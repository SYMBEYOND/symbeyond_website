import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCredits,
  estimateReservationCredits,
  estimateMicroUsd,
  computeWarning,
  buildUsageMetadata,
  isExhausted,
  wouldExceedLimit,
  wouldExceedDailyGuardrail,
  wouldExceedMonthlyGuardrail,
  formatTimestamp,
} from '../api/_lib/cad-usage.js';

test('Usage: calculateCredits formula matches spec', () => {
  // Formula: ceil((input + 5*output) / 1000), min 1

  // Test: 100 input, 100 output = (100 + 500) / 1000 = 0.6 -> 1
  assert.equal(calculateCredits(100, 100), 1, 'small usage rounds to minimum 1');

  // Test: 1000 input, 200 output = (1000 + 1000) / 1000 = 2
  assert.equal(calculateCredits(1000, 200), 2, 'medium usage');

  // Test: 8000 input, 500 output = (8000 + 2500) / 1000 = 10.5 -> 11
  assert.equal(calculateCredits(8000, 500), 11, 'large usage rounds up');
});

test('Usage: estimateReservationCredits returns consistent estimate', () => {
  const est = estimateReservationCredits();
  assert.equal(est, 11, 'estimate is 11 credits');
});

test('Usage: estimateMicroUsd formula matches spec', () => {
  // Formula: input_tokens + 5 * output_tokens

  assert.equal(estimateMicroUsd(100, 100), 600, '100 input + 5*100 output');
  assert.equal(estimateMicroUsd(1000, 200), 2000, '1000 input + 5*200 output');
});

test('Usage: computeWarning thresholds', () => {
  // below 80%: 'none'
  let warning = computeWarning(7, 10); // 70%
  assert.equal(warning.warning, 'none', 'below 80% is none');
  assert.equal(warning.percentage, 70, 'percentage is 70');

  // 80-89%: 'approaching'
  warning = computeWarning(8, 10); // 80%
  assert.equal(warning.warning, 'approaching', '80% is approaching');

  warning = computeWarning(89, 100); // 89%
  assert.equal(warning.warning, 'approaching', '89% is approaching');

  // 90-99%: 'high'
  warning = computeWarning(9, 10); // 90%
  assert.equal(warning.warning, 'high', '90% is high');

  warning = computeWarning(99, 100); // 99%
  assert.equal(warning.warning, 'high', '99% is high');

  // 100%: 'exhausted'
  warning = computeWarning(10, 10); // 100%
  assert.equal(warning.warning, 'exhausted', '100% is exhausted');
});

test('Usage: buildUsageMetadata returns complete structure', () => {
  const meta = buildUsageMetadata({
    tier: 'trial',
    settledCredits: '5',
    reservedCredits: '2',
    resetAt: new Date(Date.now() + 3600000).toISOString(),
  });

  assert.equal(meta.tier, 'trial', 'tier present');
  assert.equal(meta.usedCredits, 5, 'usedCredits correct');
  assert.equal(meta.limitCredits, 10, 'limitCredits for trial');
  assert.equal(meta.remainingCredits, 5, 'remainingCredits = limit - used');
  assert.equal(meta.percentage, 50, 'percentage = 50%');
  assert.equal(meta.warning, 'none', 'warning is none at 50%');
});

test('Usage: isExhausted at tier limits', () => {
  assert.equal(isExhausted(10, 'trial'), true, '10 exhausts trial (limit 10)');
  assert.equal(isExhausted(9, 'trial'), false, '9 does not exhaust trial');
  assert.equal(isExhausted(30, 'builder'), true, '30 exhausts builder (limit 30)');
  assert.equal(isExhausted(29, 'builder'), false, '29 does not exhaust builder');
});

test('Usage: wouldExceedLimit checks tier limits', () => {
  const trial = wouldExceedLimit(8, 0, 3, 'trial');
  assert.equal(trial, true, '8 + 0 + 3 = 11 exceeds trial limit 10');

  const trialOk = wouldExceedLimit(7, 0, 3, 'trial');
  assert.equal(trialOk, false, '7 + 0 + 3 = 10 fits trial limit');

  const builder = wouldExceedLimit(25, 0, 6, 'builder');
  assert.equal(builder, true, '25 + 0 + 6 = 31 exceeds builder limit 30');
});

test('Usage: guardrails check daily and monthly limits', () => {
  // Daily limit: $1.00 = 1,000,000 micro-USD
  const daily = wouldExceedDailyGuardrail(900000, 200000);
  assert.equal(daily, true, '900k + 200k exceeds daily 1M');

  const dailyOk = wouldExceedDailyGuardrail(900000, 99999);
  assert.equal(dailyOk, false, '900k + 99k fits daily 1M');

  // Monthly limit: $10.00 = 10,000,000 micro-USD
  const monthly = wouldExceedMonthlyGuardrail(9000000, 2000000);
  assert.equal(monthly, true, '9M + 2M exceeds monthly 10M');

  const monthlyOk = wouldExceedMonthlyGuardrail(9000000, 999999);
  assert.equal(monthlyOk, false, '9M + 999k fits monthly 10M');
});

test('Usage: formatTimestamp handles various inputs', () => {
  const date = new Date('2026-07-18T12:00:00Z');
  const ms = date.getTime();

  const fromMs = formatTimestamp(ms);
  assert.ok(fromMs.includes('2026'), 'timestamp from ms');

  const fromDate = formatTimestamp(date);
  assert.ok(fromDate.includes('2026'), 'timestamp from Date');

  const fromStr = formatTimestamp('1689686400000');
  assert.ok(typeof fromStr === 'string', 'timestamp from string');
});
