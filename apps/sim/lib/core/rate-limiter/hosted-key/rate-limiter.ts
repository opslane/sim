import { createLogger } from '@sim/logger'
import {
  createStorageAdapter,
  type RateLimitStorageAdapter,
  type TokenBucketConfig,
} from '@/lib/core/rate-limiter/storage'
import {
  DEFAULT_BURST_MULTIPLIER,
  DEFAULT_WINDOW_MS,
  toTokenBucketConfig,
  type AcquireKeyResult,
  type CustomRateLimit,
  type HostedKeyRateLimitConfig,
  type ReportUsageResult,
} from './types'

const logger = createLogger('HostedKeyRateLimiter')

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
 * HostedKeyRateLimiter provides:
 * 1. Per-user rate limiting (enforced - blocks users who exceed their limit)
 * 2. Least-loaded key selection (distributes requests evenly across keys)
 * 3. Post-execution dimension usage tracking for custom rate limits
 */
export class HostedKeyRateLimiter {
  private storage: RateLimitStorageAdapter
  /** In-memory request counters per key: "provider:keyIndex" -> count */
  private keyRequestCounts = new Map<string, number>()

  constructor(storage?: RateLimitStorageAdapter) {
    this.storage = storage ?? createStorageAdapter()
  }

  private buildUserStorageKey(provider: string, userId: string): string {
    return `hosted:${provider}:user:${userId}:${USER_REQUESTS_DIMENSION}`
  }

  private buildDimensionStorageKey(
    provider: string,
    userId: string,
    dimensionName: string
  ): string {
    return `hosted:${provider}:user:${userId}:${dimensionName}`
  }

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
   * Build a token bucket config for the per-user request rate limit.
   * Works for both `per_request` and `custom` modes since both define `userRequestsPerMinute`.
   */
  private getUserRateLimitConfig(config: HostedKeyRateLimitConfig): TokenBucketConfig | null {
    if (!config.userRequestsPerMinute) return null
    return toTokenBucketConfig(
      config.userRequestsPerMinute,
      config.burstMultiplier ?? DEFAULT_BURST_MULTIPLIER,
      DEFAULT_WINDOW_MS
    )
  }

  /**
   * Check and consume user request rate limit. Returns null if allowed, or retry info if blocked.
   */
  private async checkUserRateLimit(
    provider: string,
    userId: string,
    config: HostedKeyRateLimitConfig
  ): Promise<{ rateLimited: true; retryAfterMs: number } | null> {
    const bucketConfig = this.getUserRateLimitConfig(config)
    if (!bucketConfig) return null

    const storageKey = this.buildUserStorageKey(provider, userId)

    try {
      const result = await this.storage.consumeTokens(storageKey, 1, bucketConfig)
      if (!result.allowed) {
        const retryAfterMs = Math.max(0, result.resetAt.getTime() - Date.now())
        logger.info(`User ${userId} rate limited for ${provider}`, {
          provider,
          userId,
          retryAfterMs,
          tokensRemaining: result.tokensRemaining,
        })
        return { rateLimited: true, retryAfterMs }
      }
      return null
    } catch (error) {
      logger.error(`Error checking user rate limit for ${provider}`, { error, userId })
      return null
    }
  }

  /**
   * Pre-check that the user has available budget in all custom dimensions.
   * Does NOT consume tokens -- just verifies the user isn't already depleted.
   * Returns retry info for the most restrictive exhausted dimension, or null if all pass.
   */
  private async preCheckDimensions(
    provider: string,
    userId: string,
    config: CustomRateLimit
  ): Promise<{ rateLimited: true; retryAfterMs: number; dimension: string } | null> {
    for (const dimension of config.dimensions) {
      const storageKey = this.buildDimensionStorageKey(provider, userId, dimension.name)
      const bucketConfig = toTokenBucketConfig(
        dimension.limitPerMinute,
        dimension.burstMultiplier ?? DEFAULT_BURST_MULTIPLIER,
        DEFAULT_WINDOW_MS
      )

      try {
        const status = await this.storage.getTokenStatus(storageKey, bucketConfig)
        if (status.tokensAvailable < 1) {
          const retryAfterMs = Math.max(0, status.nextRefillAt.getTime() - Date.now())
          logger.info(`User ${userId} exhausted dimension ${dimension.name} for ${provider}`, {
            provider,
            userId,
            dimension: dimension.name,
            tokensAvailable: status.tokensAvailable,
            retryAfterMs,
          })
          return { rateLimited: true, retryAfterMs, dimension: dimension.name }
        }
      } catch (error) {
        logger.error(`Error pre-checking dimension ${dimension.name} for ${provider}`, {
          error,
          userId,
        })
      }
    }
    return null
  }

  /**
   * Acquire the best available key.
   *
   * For both modes:
   *   1. Per-user request rate limiting (enforced): blocks users who exceed their request limit
   *   2. Least-loaded key selection: picks the key with fewest in-flight requests
   *
   * For `custom` mode additionally:
   *   3. Pre-checks dimension budgets: blocks if any dimension is already depleted
   */
  async acquireKey(
    provider: string,
    envKeys: string[],
    config: HostedKeyRateLimitConfig,
    userId?: string
  ): Promise<AcquireKeyResult> {
    if (userId && config.userRequestsPerMinute) {
      const userRateLimitResult = await this.checkUserRateLimit(provider, userId, config)
      if (userRateLimitResult) {
        return {
          success: false,
          userRateLimited: true,
          retryAfterMs: userRateLimitResult.retryAfterMs,
          error: `Rate limit exceeded. Please wait ${Math.ceil(userRateLimitResult.retryAfterMs / 1000)} seconds.`,
        }
      }
    }

    if (userId && config.mode === 'custom' && config.dimensions.length > 0) {
      const dimensionResult = await this.preCheckDimensions(provider, userId, config)
      if (dimensionResult) {
        return {
          success: false,
          userRateLimited: true,
          retryAfterMs: dimensionResult.retryAfterMs,
          error: `Rate limit exceeded for ${dimensionResult.dimension}. Please wait ${Math.ceil(dimensionResult.retryAfterMs / 1000)} seconds.`,
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

  /**
   * Report actual usage after successful tool execution (custom mode only).
   * Calls `extractUsage` on each dimension and consumes the actual token count.
   * This is the "post-execution" phase of the optimistic two-phase approach.
   */
  async reportUsage(
    provider: string,
    userId: string,
    config: CustomRateLimit,
    params: Record<string, unknown>,
    response: Record<string, unknown>
  ): Promise<ReportUsageResult> {
    const results: ReportUsageResult['dimensions'] = []

    for (const dimension of config.dimensions) {
      let usage: number
      try {
        usage = dimension.extractUsage(params, response)
      } catch (error) {
        logger.error(`Failed to extract usage for dimension ${dimension.name}`, {
          provider,
          userId,
          error,
        })
        continue
      }

      if (usage <= 0) {
        results.push({
          name: dimension.name,
          consumed: 0,
          allowed: true,
          tokensRemaining: 0,
        })
        continue
      }

      const storageKey = this.buildDimensionStorageKey(provider, userId, dimension.name)
      const bucketConfig = toTokenBucketConfig(
        dimension.limitPerMinute,
        dimension.burstMultiplier ?? DEFAULT_BURST_MULTIPLIER,
        DEFAULT_WINDOW_MS
      )

      try {
        const consumeResult = await this.storage.consumeTokens(storageKey, usage, bucketConfig)

        results.push({
          name: dimension.name,
          consumed: usage,
          allowed: consumeResult.allowed,
          tokensRemaining: consumeResult.tokensRemaining,
        })

        if (!consumeResult.allowed) {
          logger.warn(
            `Dimension ${dimension.name} overdrawn for ${provider} (optimistic concurrency)`,
            { provider, userId, usage, tokensRemaining: consumeResult.tokensRemaining }
          )
        }

        logger.debug(`Consumed ${usage} from dimension ${dimension.name} for ${provider}`, {
          provider,
          userId,
          usage,
          allowed: consumeResult.allowed,
          tokensRemaining: consumeResult.tokensRemaining,
        })
      } catch (error) {
        logger.error(`Failed to consume tokens for dimension ${dimension.name}`, {
          provider,
          userId,
          usage,
          error,
        })
      }
    }

    return { dimensions: results }
  }

  private getKeyCount(provider: string, keyIndex: number): number {
    return this.keyRequestCounts.get(`${provider}:${keyIndex}`) ?? 0
  }

  private incrementKeyCount(provider: string, keyIndex: number): void {
    const key = `${provider}:${keyIndex}`
    this.keyRequestCounts.set(key, (this.keyRequestCounts.get(key) ?? 0) + 1)
  }
}

let cachedInstance: HostedKeyRateLimiter | null = null

/**
 * Get the singleton HostedKeyRateLimiter instance
 */
export function getHostedKeyRateLimiter(): HostedKeyRateLimiter {
  if (!cachedInstance) {
    cachedInstance = new HostedKeyRateLimiter()
  }
  return cachedInstance
}

/**
 * Reset the cached rate limiter (for testing)
 */
export function resetHostedKeyRateLimiter(): void {
  cachedInstance = null
}
