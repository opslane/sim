import type { TokenBucketConfig } from '@/lib/core/rate-limiter/storage'

export type ThrottleMode = 'per_request' | 'custom'

/**
 * Simple per-request throttle configuration.
 * Enforces per-user rate limiting and distributes requests across keys.
 */
export interface PerRequestThrottle {
  mode: 'per_request'
  /** Maximum requests per minute per user (enforced - blocks if exceeded) */
  userRequestsPerMinute: number
  /** Burst multiplier for token bucket max capacity. Default: 2 */
  burstMultiplier?: number
}

/**
 * Custom throttle with multiple dimensions (e.g., tokens, search units).
 * Allows tracking different usage metrics independently.
 */
export interface CustomThrottle {
  mode: 'custom'
  /** Maximum requests per minute per user (enforced - blocks if exceeded) */
  userRequestsPerMinute: number
  /** Multiple dimensions to track */
  dimensions: ThrottleDimension[]
  /** Burst multiplier for token bucket max capacity. Default: 2 */
  burstMultiplier?: number
}

/**
 * A single dimension for custom throttling.
 * Each dimension has its own token bucket.
 */
export interface ThrottleDimension {
  /** Dimension name (e.g., 'tokens', 'search_units') - used in storage key */
  name: string
  /** Limit per minute for this dimension */
  limitPerMinute: number
  /** Burst multiplier for token bucket max capacity. Default: 2 */
  burstMultiplier?: number
  /**
   * Extract usage amount from request params and response.
   * Called after successful execution to consume the actual usage.
   */
  extractUsage: (params: Record<string, unknown>, response: Record<string, unknown>) => number
}

/** Union of all throttle configuration types */
export type ThrottleConfig = PerRequestThrottle | CustomThrottle

/**
 * Result from acquiring a key from the throttler
 */
export interface AcquireKeyResult {
  /** Whether a key was successfully acquired */
  success: boolean
  /** The API key value (if success=true) */
  key?: string
  /** Index of the key in the envKeys array */
  keyIndex?: number
  /** Environment variable name of the selected key */
  envVarName?: string
  /** Error message if no key available */
  error?: string
  /** Whether the user was throttled (exceeded their per-user limit) */
  userThrottled?: boolean
  /** Milliseconds until user's rate limit resets (if userThrottled=true) */
  retryAfterMs?: number
}

/**
 * Convert throttle config to token bucket config for a dimension
 */
export function toTokenBucketConfig(
  limitPerMinute: number,
  burstMultiplier = 2,
  windowMs = 60000
): TokenBucketConfig {
  return {
    maxTokens: limitPerMinute * burstMultiplier,
    refillRate: limitPerMinute,
    refillIntervalMs: windowMs,
  }
}

/**
 * Default throttle window in milliseconds (1 minute)
 */
export const THROTTLE_WINDOW_MS = 60000

/**
 * Default burst multiplier
 */
export const DEFAULT_BURST_MULTIPLIER = 2
