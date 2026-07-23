#!/usr/bin/env node
import { readFileSync } from 'fs';

const content = readFileSync('api/_lib/cad-redis.js', 'utf-8');

console.log('\n✅ Lua Script Fix Verification\n');

const checks = [
  {
    name: 'atomicIncrementGuardrail: INCRBY uses tostring()',
    pattern: /redis\.call\('INCRBY',\s*dailyKey,\s*tostring\(microUsd\)\)/,
  },
  {
    name: 'atomicIncrementGuardrail: EXPIRE uses tostring()',
    pattern: /redis\.call\('EXPIRE',\s*dailyKey,\s*tostring\(dailyTtl\)\)/,
  },
  {
    name: 'atomicIncrementGuardrail: monthly INCRBY uses tostring()',
    pattern: /redis\.call\('INCRBY',\s*monthlyKey,\s*tostring\(microUsd\)\)/,
  },
  {
    name: 'atomicIncrementGuardrail: monthly EXPIRE uses tostring()',
    pattern: /redis\.call\('EXPIRE',\s*monthlyKey,\s*tostring\(monthlyTtl\)\)/,
  },
  {
    name: 'atomicSettle: nowMs = tostring(ARGV[3])',
    pattern: /local nowMs = tostring\(ARGV\[3\]\)/,
  },
  {
    name: 'atomicRefund: nowMs = tostring(ARGV[2])',
    pattern: /local nowMs = tostring\(ARGV\[2\]\)/,
  },
];

let passed = 0;
let failed = 0;

for (const check of checks) {
  if (check.pattern.test(content)) {
    console.log(`✅ ${check.name}`);
    passed++;
  } else {
    console.log(`❌ ${check.name}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('✨ All Lua script fixes are in place!\n');
  process.exit(0);
} else {
  process.exit(1);
}
