import { createLogger } from '@sim/logger'
import {
  createStorageAdapter,
  type RateLimitStorageAdapter,
  type TokenBucketConfig,
} from '@/lib/core/rate-limiter/storage'
import {
  DEFAULT_BURST_MULTIPLIER,
  THROTTLE_WINDOW_MS,
  toTokenBucketConfig,
  type AcquireKeyResult,
  type PerRequestThrottle,
  type ThrottleConfig,
} from './types'

const logger = createLogger('HostedKeyThrottler')

/** Dimension name for per-user rate limiting */
const USER_REQUESTS_DIMENSION = 'user_requests'

/**
 * Information about an available hosted key
 */
interface AvailableKey {
  key: string
  keyIndex: number
  envVarName: string
}

/**
 * HostedKeyThrottler provides:
 * 1. Per-user rate limiting (enforced - blocks users who exceed their limit)
 * 2. Least-loaded key selection (distributes requests evenly across keys)
 */
export class HostedKeyThrottler {
  private storage: RateLimitStorageAdapter
  /** In-memory request counters per key: "provider:keyIndex" -> count */
  private keyRequestCounts = new Map<string, number>()

  constructor(storage?: RateLimitStorageAdapter) {
    this.storage = storage ?? createStorageAdapter()
  }

  /**
   * Build storage key for per-user rate limiting
   */
  private buildUserStorageKey(provider: string, userId: string): string {
    return `hosted:${provider}:user:${userId}:${USER_REQUESTS_DIMENSION}`
  }

  /**
   * Get available keys from environment variables
   */
  private getAvailableKeys(envKeys: string[]): AvailableKey[] {
    const keys: AvailableKey[] = []
    for (let i = 0; i < envKeys.length; i++) {
      const envVarName = envKeys[i]
      const key = process.env[envVarName]
      if (key) {
        keys.push({ key, keyIndex: i, envVarName })
      }
    }
    return keys
  }

  /**
   * Get user rate limit config from throttle config
   */
  private getUserRateLimitConfig(throttle: ThrottleConfig): TokenBucketConfig | null {
    if (throttle.mode !== 'per_request' || !throttle.userRequestsPerMinute) {
      return null
    }
    return toTokenBucketConfig(
      throttle.userRequestsPerMinute,
      throttle.burstMultiplier ?? DEFAULT_BURST_MULTIPLIER,
      THROTTLE_WINDOW_MS
    )
  }

  /**
   * Check and consume user rate limit. Returns null if allowed, or retry info if throttled.
   */
  private async checkUserRateLimit(
    provider: string,
    userId: string,
    throttle: ThrottleConfig
  ): Promise<{ throttled: true; retryAfterMs: number } | null> {
    const config = this.getUserRateLimitConfig(throttle)
    if (!config) return null

    const storageKey = this.buildUserStorageKey(provider, userId)

    try {
      const result = await this.storage.consumeTokens(storageKey, 1, config)
      if (!result.allowed) {
        const retryAfterMs = Math.max(0, result.resetAt.getTime() - Date.now())
        logger.info(`User ${userId} throttled for ${provider}`, {
          provider,
          userId,
          retryAfterMs,
          tokensRemaining: result.tokensRemaining,
        })
        return { throttled: true, retryAfterMs }
      }
      return null
    } catch (error) {
      logger.error(`Error checking user rate limit for ${provider}`, { error, userId })
      return null // Allow on error
    }
  }

  /**
   * Acquire the best available key.
   *
   * 1. Per-user throttling (enforced): Users exceeding their limit get blocked
   * 2. Least-loaded key selection: Picks the key with fewest requests
   */
  async acquireKey(
    provider: string,
    envKeys: string[],
    throttle: ThrottleConfig,
    userId?: string
  ): Promise<AcquireKeyResult> {
    if (userId && throttle.mode === 'per_request' && throttle.userRequestsPerMinute) {
      const userThrottleResult = await this.checkUserRateLimit(provider, userId, throttle)
      if (userThrottleResult) {
        return {
          success: false,
          userThrottled: true,
          retryAfterMs: userThrottleResult.retryAfterMs,
          error: `Rate limit exceeded. Please wait ${Math.ceil(userThrottleResult.retryAfterMs / 1000)} seconds.`,
        }
      }
    }

    const availableKeys = this.getAvailableKeys(envKeys)

    if (availableKeys.length === 0) {
      logger.warn(`No hosted keys configured for provider ${provider}`)
      return {
        success: false,
        error: `No hosted keys configured for ${provider}`,
      }
    }

    // Select the key with fewest requests
    let leastLoaded = availableKeys[0]
    let minCount = this.getKeyCount(provider, leastLoaded.keyIndex)

    for (let i = 1; i < availableKeys.length; i++) {
      const count = this.getKeyCount(provider, availableKeys[i].keyIndex)
      if (count < minCount) {
        minCount = count
        leastLoaded = availableKeys[i]
      }
    }

    this.incrementKeyCount(provider, leastLoaded.keyIndex)

    logger.debug(`Selected hosted key for ${provider}`, {
      provider,
      keyIndex: leastLoaded.keyIndex,
      envVarName: leastLoaded.envVarName,
      requestCount: minCount + 1,
    })

    return {
      success: true,
      key: leastLoaded.key,
      keyIndex: leastLoaded.keyIndex,
      envVarName: leastLoaded.envVarName,
    }
  }

  private getKeyCount(provider: string, keyIndex: number): number {
    return this.keyRequestCounts.get(`${provider}:${keyIndex}`) ?? 0
  }

  private incrementKeyCount(provider: string, keyIndex: number): void {
    const key = `${provider}:${keyIndex}`
    this.keyRequestCounts.set(key, (this.keyRequestCounts.get(key) ?? 0) + 1)
  }
}

let cachedThrottler: HostedKeyThrottler | null = null

/**
 * Get the singleton HostedKeyThrottler instance
 */
export function getHostedKeyThrottler(): HostedKeyThrottler {
  if (!cachedThrottler) {
    cachedThrottler = new HostedKeyThrottler()
  }
  return cachedThrottler
}

/**
 * Reset the cached throttler (for testing)
 */
export function resetHostedKeyThrottler(): void {
  cachedThrottler = null
}
