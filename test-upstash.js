#!/usr/bin/env node
/**
 * Test Upstash Redis KV connection
 * Loads credentials from .env.local and tests PING
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse .env.local manually
function parseEnv(filePath) {
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
}

const envPath = resolve(__dirname, '.env.local');
const env = parseEnv(envPath);

const url = env.CAD_TUTOR_USAGE_KV_REST_API_URL;
const token = env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN;

console.log('\n🔍 Testing Upstash Redis KV Connection');
console.log('=====================================\n');

if (!url) {
  console.log('❌ CAD_TUTOR_USAGE_KV_REST_API_URL not found in .env.local');
  process.exit(1);
}

if (!token) {
  console.log('❌ CAD_TUTOR_USAGE_KV_REST_API_TOKEN not found in .env.local');
  process.exit(1);
}

console.log('✅ Credentials loaded from .env.local');
console.log(`📍 Endpoint: ${url.substring(0, 50)}...`);
console.log(`🔑 Token: ${token.substring(0, 20)}...`);
console.log('');

// Test PING
const testPing = async () => {
  try {
    console.log('Sending PING command...');
    const response = await fetch(url + '/exec', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['PING']),
    });

    console.log(`HTTP Status: ${response.status}\n`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      if (data.result === 'PONG') {
        console.log('\n✅ Upstash Redis KV is RESPONDING correctly\n');
      } else {
        console.log('\n⚠️  Upstash responded but with unexpected result\n');
      }
    } else {
      console.log('\n❌ Upstash returned HTTP error\n');
    }
  } catch (err) {
    console.log(`❌ Connection failed: ${err.message}\n`);
  }
};

testPing();
