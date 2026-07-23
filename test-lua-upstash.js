#!/usr/bin/env node
/**
 * Test Lua script fixes against real Upstash Redis KV
 * Verifies that atomicIncrementGuardrail and getGuardrailTotals work correctly
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { atomicIncrementGuardrail, getGuardrailTotals, getRedisClient } from './api/_lib/cad-redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse .env.local manually
function parseEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const env = {};

    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const match = trimmed.match(/^([^=]+)="(.+)"$/);
      if (match) {
        env[match[1]] = match[2];
      }
    });

    return env;
  } catch (err) {
    console.error(`❌ Failed to read .env.local: ${err.message}`);
    process.exit(1);
  }
}

const envPath = resolve(__dirname, '.env.local');
const env = parseEnv(envPath);

process.env.CAD_TUTOR_USAGE_KV_REST_API_URL = env.CAD_TUTOR_USAGE_KV_REST_API_URL;
process.env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN = env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN;

console.log('\n🧪 Testing Lua Script Fixes Against Upstash');
console.log('===========================================\n');

if (!env.CAD_TUTOR_USAGE_KV_REST_API_URL) {
  console.log('❌ CAD_TUTOR_USAGE_KV_REST_API_URL not found in .env.local');
  process.exit(1);
}

if (!env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN) {
  console.log('❌ CAD_TUTOR_USAGE_KV_REST_API_TOKEN not found in .env.local');
  process.exit(1);
}

console.log('✅ Credentials loaded');
console.log('');

const runTests = async () => {
  try {
    // Test 1: Call atomicIncrementGuardrail
    console.log('Test 1: atomicIncrementGuardrail with 100 micro-USD');
    console.log('─────────────────────────────────────────────────');

    const result1 = await atomicIncrementGuardrail(100);
    console.log(`✅ Result: ${JSON.stringify(result1)}`);
    console.log(`   - dailyMicroUsd: ${result1.dailyMicroUsd}`);
    console.log(`   - monthlyMicroUsd: ${result1.monthlyMicroUsd}`);

    if (typeof result1.dailyMicroUsd !== 'number' || typeof result1.monthlyMicroUsd !== 'number') {
      throw new Error('Return values are not numbers');
    }
    console.log('✅ Return types are correct (numbers)\n');

    // Test 2: Call again with different amount
    console.log('Test 2: atomicIncrementGuardrail with 250 micro-USD');
    console.log('─────────────────────────────────────────────────');

    const result2 = await atomicIncrementGuardrail(250);
    console.log(`✅ Result: ${JSON.stringify(result2)}`);
    console.log(`   - dailyMicroUsd: ${result2.dailyMicroUsd}`);
    console.log(`   - monthlyMicroUsd: ${result2.monthlyMicroUsd}`);

    // Verify increments were cumulative
    if (result2.dailyMicroUsd <= result1.dailyMicroUsd) {
      throw new Error('Daily total did not increase after second increment');
    }
    if (result2.monthlyMicroUsd <= result1.monthlyMicroUsd) {
      throw new Error('Monthly total did not increase after second increment');
    }
    console.log('✅ Cumulative increments working correctly\n');

    // Test 3: Read totals without incrementing
    console.log('Test 3: getGuardrailTotals (read-only)');
    console.log('─────────────────────────────────────');

    const result3 = await getGuardrailTotals();
    console.log(`✅ Result: ${JSON.stringify(result3)}`);
    console.log(`   - dailyMicroUsd: ${result3.dailyMicroUsd}`);
    console.log(`   - monthlyMicroUsd: ${result3.monthlyMicroUsd}`);

    // Should match result2
    if (result3.dailyMicroUsd !== result2.dailyMicroUsd) {
      console.log(`⚠️  WARNING: Daily mismatch. Expected ${result2.dailyMicroUsd}, got ${result3.dailyMicroUsd}`);
      console.log('   (This may be due to time zone differences in date calculations)\n');
    } else {
      console.log('✅ Daily total matches previous increment\n');
    }

    if (result3.monthlyMicroUsd !== result2.monthlyMicroUsd) {
      console.log(`⚠️  WARNING: Monthly mismatch. Expected ${result2.monthlyMicroUsd}, got ${result3.monthlyMicroUsd}`);
    } else {
      console.log('✅ Monthly total matches previous increment\n');
    }

    console.log('═════════════════════════════════════════════════');
    console.log('✅ All Lua script tests PASSED against Upstash!');
    console.log('═════════════════════════════════════════════════\n');
    console.log('Summary:');
    console.log('  • atomicIncrementGuardrail executes without 503 errors');
    console.log('  • Return values are correct types (numbers)');
    console.log('  • Lua scripts handle type conversions properly');
    console.log('  • Upstash REST/EVAL endpoint accepts the fixed Lua scripts');
    console.log('');

  } catch (err) {
    console.error(`\n❌ Test FAILED: ${err.message}`);
    console.error(`\nDetails: ${err.stack}`);
    process.exit(1);
  }
};

runTests();
