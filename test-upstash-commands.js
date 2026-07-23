#!/usr/bin/env node
/**
 * Test which Upstash REST API commands are supported
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse .env.local
function parseEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const env = {};
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=]+)="(.+)"$/);
      if (match) env[match[1]] = match[2];
    });
    return env;
  } catch (err) {
    return {};
  }
}

const env = parseEnv(resolve(__dirname, '.env.local'));
const url = env.CAD_TUTOR_USAGE_KV_REST_API_URL;
const token = env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN;

if (!url || !token) {
  console.log('❌ Missing Upstash credentials in .env.local');
  process.exit(1);
}

console.log('\n🧪 Testing Upstash REST API Command Support\n');

const commands = [
  { name: 'PING', cmd: ['PING'] },
  { name: 'SET', cmd: ['SET', 'test-key', 'test-value'] },
  { name: 'GET', cmd: ['GET', 'test-key'] },
  { name: 'EVAL simple', cmd: ['EVAL', 'return 1', '0'] },
  { name: 'INCRBY', cmd: ['INCRBY', 'test-counter', '1'] },
  { name: 'HSET', cmd: ['HSET', 'test-hash', 'field', 'value'] },
  { name: 'HGETALL', cmd: ['HGETALL', 'test-hash'] },
];

const testCommand = async (name, cmd) => {
  try {
    const response = await fetch(`${url}/exec`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cmd),
    });

    const data = await response.json();
    const status = response.ok ? '✅' : '❌';
    console.log(`${status} ${name} (${response.status})`);
    if (!response.ok) {
      console.log(`   Error: ${data.error || JSON.stringify(data)}`);
    } else {
      console.log(`   Result: ${JSON.stringify(data.result)}`);
    }
  } catch (err) {
    console.log(`❌ ${name} - Connection error: ${err.message}`);
  }
};

console.log('Testing commands...\n');
for (const test of commands) {
  await testCommand(test.name, test.cmd);
}

console.log('');
