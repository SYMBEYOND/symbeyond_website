// CAD Tutor Usage Calculation and Window Logic

import {
  CREDIT_MODEL,
  WARNING_THRESHOLDS,
  TIER_LIMITS,
  GLOBAL_GUARDRAILS,
} from './cad-config.js';

/**
 * Calculate settled credits from Anthropic usage tokens.
 * Formula: ceil((input_tokens + 5 * output_tokens) / 1000)
 * Minimum: 1 credit per successful response
 *
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number} Credits consumed
 */
export function calculateCredits(inputTokens, outputTokens) {
  const weighted =
    inputTokens * CREDIT_MODEL.INPUT_WEIGHT +
    outputTokens * CREDIT_MODEL.OUTPUT_WEIGHT;

  const credits = Math.ceil(weighted / CREDIT_MODEL.DIVISOR);
  return Math.max(credits, CREDIT_MODEL.MINIMUM);
}

/**
 * Estimate conservative reservation credit cost.
 * Used before calling Anthropic to reserve capacity.
 *
 * @returns {number} Estimated credits for reservation
 */
export function estimateReservationCredits() {
  return 11; // Conservative: ~8000 input + 500 output*5 = ~10.5k tokens
}

/**
 * Calculate estimated micro-USD cost.
 * Input: $1 per million tokens
 * Output: $5 per million tokens
 * Result: integer micro-USD (millionths of a dollar)
 *
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number} Estimated cost in micro-USD
 */
export function estimateMicroUsd(inputTokens, outputTokens) {
  return inputTokens + 5 * outputTokens;
}

/**
 * Compute warning level and message based on usage percentage.
 * @param {number} settledCredits
 * @param {number} limitCredits
 * @returns {Object} { warning, percentage }
 */
export function computeWarning(settledCredits, limitCredits) {
  const percentage = settledCredits / limitCredits;

  let warning = 'none';
  if (percentage >= WARNING_THRESHOLDS.exhausted) {
    warning = 'exhausted';
  } else if (percentage >= WARNING_THRESHOLDS.high) {
    warning = 'high';
  } else if (percentage >= WARNING_THRESHOLDS.approaching) {
    warning = 'approaching';
  }

  return {
    warning,
    percentage: Math.round(percentage * 100),
  };
}

/**
 * Build usage metadata object for API response.
 * @param {Object} usageData - { settledCredits, reservedCredits, resetAt, tier }
 * @returns {Object} Structured usage metadata
 */
export function buildUsageMetadata(usageData) {
  const tier = usageData.tier || 'trial';
  const limitCredits = TIER_LIMITS[tier] || 10;
  const settledCredits = parseInt(usageData.settledCredits || '0', 10);
  const reservedCredits = parseInt(usageData.reservedCredits || '0', 10);
  const resetAt = usageData.resetAt || new Date().toISOString();

  const { warning, percentage } = computeWarning(settledCredits, limitCredits);
  const remainingCredits = Math.max(0, limitCredits - settledCredits);

  return {
    tier,
    usedCredits: settledCredits,
    reservedCredits,
    limitCredits,
    remainingCredits,
    percentage,
    warning,
    resetAt,
  };
}

/**
 * Check if session is exhausted (no remaining credits).
 * @param {number} settledCredits
 * @param {number} tier
 * @returns {boolean}
 */
export function isExhausted(settledCredits, tier) {
  const limit = TIER_LIMITS[tier] || 10;
  return settledCredits >= limit;
}

/**
 * Check if a reservation would exceed tier limits.
 * @param {number} settledCredits
 * @param {number} reservedCredits
 * @param {number} estimatedCredits
 * @param {string} tier
 * @returns {boolean}
 */
export function wouldExceedLimit(settledCredits, reservedCredits, estimatedCredits, tier) {
  const limit = TIER_LIMITS[tier] || 10;
  return settledCredits + reservedCredits + estimatedCredits > limit;
}

/**
 * Check if a reservation would exceed global daily guardrail.
 * @param {number} currentDailyMicroUsd
 * @param {number} estimatedMicroUsd
 * @returns {boolean}
 */
export function wouldExceedDailyGuardrail(currentDailyMicroUsd, estimatedMicroUsd) {
  return currentDailyMicroUsd + estimatedMicroUsd > GLOBAL_GUARDRAILS.dailyMicroUsd;
}

/**
 * Check if a reservation would exceed global monthly guardrail.
 * @param {number} currentMonthlyMicroUsd
 * @param {number} estimatedMicroUsd
 * @returns {boolean}
 */
export function wouldExceedMonthlyGuardrail(currentMonthlyMicroUsd, estimatedMicroUsd) {
  return currentMonthlyMicroUsd + estimatedMicroUsd > GLOBAL_GUARDRAILS.monthlyMicroUsd;
}

/**
 * Format a timestamp as ISO 8601 UTC.
 * @param {Date|number|string} timestamp
 * @returns {string}
 */
export function formatTimestamp(timestamp) {
  if (typeof timestamp === 'string') {
    const ms = parseInt(timestamp, 10);
    if (!isNaN(ms)) {
      return new Date(ms).toISOString();
    }
    return timestamp;
  }
  if (typeof timestamp === 'number') {
    return new Date(timestamp).toISOString();
  }
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return new Date().toISOString();
}
