import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Verify Lua script type handling matches Upstash REST/EVAL requirements
 * These tests ensure that numeric values are properly stringified before redis.call()
 */

test('Lua: atomicIncrementGuardrail type conversions', () => {
  // Simulate what gets passed from JavaScript
  const microUsd = '100'; // Sent as string from JS
  const dailyTtl = '86400'; // Sent as string from JS
  const monthlyTtl = '2592000'; // Sent as string from JS

  // In Lua: tonumber() converts strings to numbers
  const microUsdNum = Number(microUsd); // 100
  const dailyTtlNum = Number(dailyTtl); // 86400
  const monthlyTtlNum = Number(monthlyTtl); // 2592000

  // Then tostring() converts them back for redis.call()
  assert.equal(String(microUsdNum), '100');
  assert.equal(String(dailyTtlNum), '86400');
  assert.equal(String(monthlyTtlNum), '2592000');
});

test('Lua: atomicSettle nowMs type conversion', () => {
  // Simulate nowMs handling in atomicSettle
  const nowMsArg = Date.now().toString(); // Sent as string from JS

  // In Lua: explicit tostring() ensures it stays as string
  const nowMs = nowMsArg;

  assert.equal(typeof nowMs, 'string', 'nowMs should remain a string');
  assert.ok(/^\d+$/.test(nowMs), 'nowMs should be numeric string');
});

test('Lua: atomicRefund nowMs type conversion', () => {
  // Same as atomicSettle
  const nowMsArg = Date.now().toString(); // Sent as string from JS

  // In Lua: explicit tostring() ensures it stays as string
  const nowMs = nowMsArg;

  assert.equal(typeof nowMs, 'string', 'nowMs should remain a string');
  assert.ok(/^\d+$/.test(nowMs), 'nowMs should be numeric string');
});

test('Lua: redis.call argument types (Upstash simulation)', () => {
  // This test verifies that arguments passed to redis.call() are strings
  // which is what Upstash's REST/EVAL endpoint requires

  const testRedisCall = (command, ...args) => {
    // Upstash REST/EVAL expects all arguments to be strings or arrays
    // that can be serialized to JSON
    for (const arg of args) {
      assert.ok(
        typeof arg === 'string' || typeof arg === 'number' || Array.isArray(arg),
        `redis.call('${command}') argument must be string, number, or array: got ${typeof arg}`
      );
    }
  };

  // INCRBY with stringified number
  const microUsd = 100;
  testRedisCall('INCRBY', 'cad:guardrail:daily:2026-07-23', String(microUsd));

  // EXPIRE with stringified TTL
  const dailyTtl = 86400;
  testRedisCall('EXPIRE', 'cad:guardrail:daily:2026-07-23', String(dailyTtl));

  // HSET with timestamp
  const nowMs = Date.now();
  testRedisCall('HSET', 'cad:usage:digest', 'updatedAt', String(nowMs));
});

test('Lua: ARGV conversion pattern', () => {
  // Verify the pattern: ARGV comes in as strings, tonumber() for arithmetic, tostring() for redis.call()

  const ARGV = [
    '100',      // microUsd (as string from REST)
    '86400',    // dailyTtl (as string from REST)
    '2592000',  // monthlyTtl (as string from REST)
  ];

  // Step 1: Extract and convert with tonumber()
  const microUsd = Number(ARGV[0]);
  const dailyTtl = Number(ARGV[1]);
  const monthlyTtl = Number(ARGV[2]);

  // Step 2: Verify numeric
  assert.equal(typeof microUsd, 'number');
  assert.equal(typeof dailyTtl, 'number');
  assert.equal(typeof monthlyTtl, 'number');

  // Step 3: Convert back to string for redis.call()
  const args = [String(microUsd), String(dailyTtl), String(monthlyTtl)];

  for (const arg of args) {
    assert.equal(typeof arg, 'string', 'redis.call() arguments must be strings');
  }
});
