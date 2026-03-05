import { loggerMock } from '@sim/testing'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { HostedKeyThrottler } from './throttler'
import type { PerRequestThrottle } from './types'
import type { ConsumeResult, RateLimitStorageAdapter } from '@/lib/core/rate-limiter/storage'

vi.mock('@sim/logger', () => loggerMock)

interface MockAdapter {
  consumeTokens: Mock
  getTokenStatus: Mock
  resetBucket: Mock
}

const createMockAdapter = (): MockAdapter => ({
  consumeTokens: vi.fn(),
  getTokenStatus: vi.fn(),
  resetBucket: vi.fn(),
})

describe('HostedKeyThrottler', () => {
  const testProvider = 'exa'
  const envKeys = ['EXA_API_KEY_1', 'EXA_API_KEY_2', 'EXA_API_KEY_3']
  let mockAdapter: MockAdapter
  let throttler: HostedKeyThrottler
  let originalEnv: NodeJS.ProcessEnv

  const perRequestThrottle: PerRequestThrottle = {
    mode: 'per_request',
    userRequestsPerMinute: 10,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAdapter = createMockAdapter()
    throttler = new HostedKeyThrottler(mockAdapter as RateLimitStorageAdapter)

    originalEnv = { ...process.env }
    process.env.EXA_API_KEY_1 = 'test-key-1'
    process.env.EXA_API_KEY_2 = 'test-key-2'
    process.env.EXA_API_KEY_3 = 'test-key-3'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('acquireKey', () => {
    it('should return error when no keys are configured', async () => {
      delete process.env.EXA_API_KEY_1
      delete process.env.EXA_API_KEY_2
      delete process.env.EXA_API_KEY_3

      const result = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle)

      expect(result.success).toBe(false)
      expect(result.error).toContain('No hosted keys configured')
    })

    it('should throttle user when they exceed their rate limit', async () => {
      const throttledResult: ConsumeResult = {
        allowed: false,
        tokensRemaining: 0,
        resetAt: new Date(Date.now() + 30000),
      }
      mockAdapter.consumeTokens.mockResolvedValue(throttledResult)

      const result = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle, 'user-123')

      expect(result.success).toBe(false)
      expect(result.userThrottled).toBe(true)
      expect(result.retryAfterMs).toBeDefined()
      expect(result.error).toContain('Rate limit exceeded')
    })

    it('should allow user within their rate limit', async () => {
      const allowedResult: ConsumeResult = {
        allowed: true,
        tokensRemaining: 9,
        resetAt: new Date(Date.now() + 60000),
      }
      mockAdapter.consumeTokens.mockResolvedValue(allowedResult)

      const result = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle, 'user-123')

      expect(result.success).toBe(true)
      expect(result.userThrottled).toBeUndefined()
      expect(result.key).toBe('test-key-1')
    })

    it('should distribute requests across keys round-robin style', async () => {
      const allowedResult: ConsumeResult = {
        allowed: true,
        tokensRemaining: 9,
        resetAt: new Date(Date.now() + 60000),
      }
      mockAdapter.consumeTokens.mockResolvedValue(allowedResult)

      const r1 = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle, 'user-1')
      const r2 = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle, 'user-2')
      const r3 = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle, 'user-3')
      const r4 = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle, 'user-4')

      expect(r1.keyIndex).toBe(0)
      expect(r2.keyIndex).toBe(1)
      expect(r3.keyIndex).toBe(2)
      expect(r4.keyIndex).toBe(0) // Wraps back
    })

    it('should work without userId (no per-user throttling)', async () => {
      const result = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle)

      expect(result.success).toBe(true)
      expect(result.key).toBe('test-key-1')
      expect(mockAdapter.consumeTokens).not.toHaveBeenCalled()
    })

    it('should handle partial key availability', async () => {
      delete process.env.EXA_API_KEY_2

      const result = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle)

      expect(result.success).toBe(true)
      expect(result.key).toBe('test-key-1')
      expect(result.envVarName).toBe('EXA_API_KEY_1')

      const r2 = await throttler.acquireKey(testProvider, envKeys, perRequestThrottle)
      expect(r2.keyIndex).toBe(2) // Skips missing key 1
      expect(r2.envVarName).toBe('EXA_API_KEY_3')
    })
  })
})
