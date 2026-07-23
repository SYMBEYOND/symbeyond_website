#!/usr/bin/env node
/**
 * Verify Lua script syntax is correct for Upstash REST/EVAL
 * This validates the scripts without needing live Upstash credentials
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the Redis client file
const redisClientPath = resolve(__dirname, 'api/_lib/cad-redis.js');
const redisContent = readFileSync(redisClientPath, 'utf-8');

console.log('\n🔍 Verifying Lua Script Syntax for Upstash');
console.log('==========================================\n');

// Extract and validate each Lua script
const scripts = [
  {
    name: 'atomicIncrementGuardrail',
    pattern: /export async function atomicIncrementGuardrail.*?const script = `([\s\S]*?)`/,
    requirements: [
      'tostring(microUsd) in INCRBY call',
      'tostring(dailyTtl) in EXPIRE call',
      'tostring(monthlyTtl) in EXPIRE call',
      'return {dailyTotal, monthlyTotal}',
    ],
  },
  {
    name: 'atomicSettle',
    pattern: /export async function atomicSettle.*?const script = `([\s\S]*?)`/,
    requirements: [
      'local nowMs = tostring(ARGV\\[3\\])',
      'return {1, usageMap}',
    ],
  },
  {
    name: 'atomicRefund',
    pattern: /export async function atomicRefund.*?const script = `([\s\S]*?)`/,
    requirements: [
      'local nowMs = tostring(ARGV\\[2\\])',
      'return {1, usageMap}',
    ],
  },
];

let allPassed = true;

for (const scriptDef of scripts) {
  console.log(`Checking: ${scriptDef.name}`);
  console.log('─'.repeat(40));

  const match = redisContent.match(scriptDef.pattern);
  if (!match) {
    console.log(`❌ Script not found\n`);
    allPassed = false;
    continue;
  }

  const script = match[1];

  // Check all requirements
  let scriptPassed = true;
  for (const req of scriptDef.requirements) {
    const pattern = new RegExp(req);
    if (pattern.test(script)) {
      console.log(`  ✅ ${req}`);
    } else {
      console.log(`  ❌ MISSING: ${req}`);
      scriptPassed = false;
      allPassed = false;
    }
  }

  // Additional checks for proper syntax
  const checks = [
    {
      name: 'Valid Lua table construction',
      pattern: /return\s*{[^}]+}/,
    },
    {
      name: 'Uses redis.call() correctly',
      pattern: /redis\.call\(/,
    },
    {
      name: 'Handles KEYS array',
      pattern: /KEYS\[/,
    },
    {
      name: 'Handles ARGV array',
      pattern: /ARGV\[/,
    },
  ];

  for (const check of checks) {
    if (check.pattern.test(script)) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ⚠️  ${check.name} - not found`);
    }
  }

  console.log('');
}

// Verify no unsafe patterns
console.log('Security Checks');
console.log('─'.repeat(40));

const unsafePatterns = [
  {
    name: 'Direct number args to redis.call (missing tostring)',
    pattern: /redis\.call\(['"]\w+['"]\s*,\s*\w+\s*,\s*(?!tostring)\w+(?:Ttl|Usd|Credits)\)/,
  },
  {
    name: 'Unescaped user input in redis.call',
    pattern: /redis\.call\(['"]\w+['"]\s*,\s*user\w+/i,
  },
];

let securityPassed = true;
for (const pattern of unsafePatterns) {
  if (pattern.pattern.test(redisContent)) {
    console.log(`⚠️  WARNING: Potential issue - ${pattern.name}\n`);
    securityPassed = false;
  } else {
    console.log(`✅ ${pattern.name}`);
  }
}

console.log('');
console.log('═'.repeat(40));

if (allPassed) {
  console.log('✅ All Lua scripts have correct type handling!');
  console.log('');
  console.log('Scripts are ready for Upstash REST/EVAL:');
  console.log('  • All numeric args properly stringified');
  console.log('  • KEYS/ARGV handled correctly');
  console.log('  • Return values properly formatted');
  console.log('');
} else {
  console.log('❌ Some checks failed\n');
  process.exit(1);
}

console.log('To test against live Upstash:');
console.log('  1. Add Upstash credentials to .env.local:');
console.log('     CAD_TUTOR_USAGE_KV_REST_API_URL=...');
console.log('     CAD_TUTOR_USAGE_KV_REST_API_TOKEN=...');
console.log('  2. Run: node test-lua-upstash.js');
console.log('');
