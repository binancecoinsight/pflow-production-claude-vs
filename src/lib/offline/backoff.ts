/**
 * PharmacyFlow Bounded Exponential Backoff with Jitter
 * 
 * Prevents thundering herds and excessive request loops during network outages.
 */

export interface BackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterFactor: number; // e.g. 0.2 for +/- 20%
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 60000, // 60 seconds
  multiplier: 2,
  jitterFactor: 0.2
};

/**
 * Calculates the next retry epoch millisecond timestamp given the number of attempts.
 */
export const calculateNextAttemptAt = (
  attempts: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG,
  now: number = Date.now()
): number => {
  const safeAttempts = Math.max(0, attempts);
  // Calculate exponential delay: base * (multiplier ^ attempts)
  const rawDelay = config.baseDelayMs * Math.pow(config.multiplier, safeAttempts);
  const boundedDelay = Math.min(rawDelay, config.maxDelayMs);

  // Apply jitter: delay * (1 + random between -jitterFactor and +jitterFactor)
  const randomFactor = (Math.random() * 2 - 1) * config.jitterFactor;
  const jitteredDelay = Math.round(boundedDelay * (1 + randomFactor));

  return now + Math.max(100, jitteredDelay);
};
