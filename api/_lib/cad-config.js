// CAD Tutor Fair-Use Configuration
// Sterile constants for credit model, limits, and timeouts

export const CREDIT_MODEL = {
  // Formula: ceil((input_tokens + 5 * output_tokens) / 1000)
  INPUT_WEIGHT: 1,
  OUTPUT_WEIGHT: 5,
  DIVISOR: 1000,
  MINIMUM: 1,
};

export const TIER_LIMITS = {
  trial: 10,      // credits per hour
  builder: 30,    // credits per hour
  professional: 100, // reserved for future
};

export const SESSION_LIFETIME = {
  trial: 30 * 24 * 60 * 60 * 1000,    // 30 days in milliseconds
  builder: 30 * 24 * 60 * 60 * 1000,  // 30 days in milliseconds
};

export const WINDOW_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

export const RESERVATION_ESTIMATE = {
  // Conservative estimate: assume max input context + max output
  // Input: ~8000 tokens (typical large context)
  // Output: max_tokens 500
  // Weighted: 8000 + 5*500 = 10,500 tokens = 11 credits (rounded up)
  credits: 11,
};

export const GLOBAL_GUARDRAILS = {
  dailyMicroUsd: 1_000_000,    // $1.00 per day
  monthlyMicroUsd: 10_000_000, // $10.00 per month
};

export const REDIS_TTL = {
  session: SESSION_LIFETIME.trial + (60 * 1000),       // session lifetime + 1 minute grace
  usage: WINDOW_DURATION + (60 * 1000),                // window duration + 1 minute grace
  requestReservation: 2 * 60 * 60 * 1000,              // 2 hours
  abuseState: 24 * 60 * 60 * 1000,                     // 24 hours
  globalDaily: 24 * 60 * 60 * 1000,                    // 1 day
  globalMonthly: 31 * 24 * 60 * 60 * 1000,             // 31 days
};

export const COOKIE_OPTIONS = {
  secure: true,
  httpOnly: true,
  sameSite: 'Lax',
  path: '/',
  maxAge: SESSION_LIFETIME.trial / 1000, // in seconds, for trial default
};

export const WARNING_THRESHOLDS = {
  approaching: 0.80,  // 80%
  high: 0.90,         // 90%
  exhausted: 1.00,    // 100%
};
