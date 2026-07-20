// CAD Tutor Redis Operations
// Upstash REST API client for durable usage tracking

import { REDIS_TTL, GLOBAL_GUARDRAILS } from './cad-config.js';

/**
 * Redis REST API client for Upstash.
 * Uses CAD_TUTOR_USAGE_KV_REST_API_URL and CAD_TUTOR_USAGE_KV_REST_API_TOKEN.
 */
export class RedisClient {
  constructor() {
    this.baseUrl = process.env.CAD_TUTOR_USAGE_KV_REST_API_URL;
    this.token = process.env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN;

    if (!this.baseUrl || !this.token) {
      throw new Error('Redis KV configuration missing');
    }
  }

  /**
   * Execute a Redis command via REST API.
   * @param {Array} command - Redis command array, e.g., ['GET', 'key']
   * @returns {Promise<any>}
   */
  async command(command) {
    const url = `${this.baseUrl}/exec`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`Redis command failed: ${response.status}`);
    }

    const data = await response.json();
    // Upstash REST API returns { result: ... }
    return data.result;
  }

  /**
   * Set a key with an optional TTL (in seconds).
   * @param {string} key
   * @param {string} value - JSON stringified value
   * @param {number} [ttlSeconds] - TTL in seconds
   */
  async set(key, value, ttlSeconds) {
    if (ttlSeconds) {
      return this.command(['SET', key, value, 'EX', ttlSeconds.toString()]);
    }
    return this.command(['SET', key, value]);
  }

  /**
   * Get a key.
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    return this.command(['GET', key]);
  }

  /**
   * Delete a key.
   * @param {string} key
   */
  async del(key) {
    return this.command(['DEL', key]);
  }

  /**
   * Increment a field in a hash.
   * @param {string} key - Hash key
   * @param {string} field - Field name
   * @param {number} value - Increment amount
   */
  async hincrby(key, field, value) {
    return this.command(['HINCRBY', key, field, value.toString()]);
  }

  /**
   * Get a hash.
   * @param {string} key
   * @returns {Promise<Object|null>}
   */
  async hgetall(key) {
    const result = await this.command(['HGETALL', key]);
    if (!result || result.length === 0) {
      return null;
    }
    // Upstash returns arrays; convert to object
    const obj = {};
    for (let i = 0; i < result.length; i += 2) {
      obj[result[i]] = result[i + 1];
    }
    return obj;
  }

  /**
   * Set a hash (multiple fields).
   * @param {string} key
   * @param {Object} fields
   * @param {number} [ttlSeconds]
   */
  async hset(key, fields, ttlSeconds) {
    const args = ['HSET', key];
    for (const [field, value] of Object.entries(fields)) {
      args.push(field, typeof value === 'string' ? value : JSON.stringify(value));
    }
    await this.command(args);
    if (ttlSeconds) {
      await this.command(['EXPIRE', key, ttlSeconds.toString()]);
    }
  }

  /**
   * Execute a Lua script atomically.
   * @param {string} script - Lua script
   * @param {number} numKeys - Number of keys in argv
   * @param {Array} argv - Keys and arguments
   */
  async eval(script, numKeys, argv) {
    const args = ['EVAL', script, numKeys.toString(), ...argv];
    return this.command(args);
  }
}

/**
 * Session-safe getter for Redis client (shared per request).
 */
let _redisClient = null;

export function getRedisClient() {
  if (!_redisClient) {
    _redisClient = new RedisClient();
  }
  return _redisClient;
}

/**
 * Initialize a session record in Redis.
 * @param {string} sessionDigest - Derived from session token
 * @param {Object} sessionData - { tier, ownerRef, createdAt, expiresAt }
 */
export async function initializeSession(sessionDigest, sessionData) {
  const redis = getRedisClient();
  const key = `cad:session:${sessionDigest}`;
  const sessionTtl = Math.ceil(REDIS_TTL.session / 1000);

  await redis.hset(key, sessionData, sessionTtl);
}

/**
 * Get a session record from Redis.
 * @param {string} sessionDigest
 * @returns {Promise<Object|null>}
 */
export async function getSession(sessionDigest) {
  const redis = getRedisClient();
  const key = `cad:session:${sessionDigest}`;
  return redis.hgetall(key);
}

/**
 * Initialize a usage record in Redis.
 * @param {string} sessionDigest
 * @param {Object} usageData - { version, tier, windowStartedAt, resetAt, settledCredits, reservedCredits, requestCount }
 */
export async function initializeUsage(sessionDigest, usageData) {
  const redis = getRedisClient();
  const key = `cad:usage:${sessionDigest}`;
  const usageTtl = Math.ceil(REDIS_TTL.usage / 1000);

  await redis.hset(key, usageData, usageTtl);
}

/**
 * Get a usage record from Redis.
 * @param {string} sessionDigest
 * @returns {Promise<Object|null>}
 */
export async function getUsage(sessionDigest) {
  const redis = getRedisClient();
  const key = `cad:usage:${sessionDigest}`;
  return redis.hgetall(key);
}

/**
 * Atomically reserve credits using a Lua script.
 * Handles window reset, limit check, and reservation.
 *
 * @param {string} sessionDigest
 * @param {number} tier 'trial' or 'builder'
 * @param {number} estimatedCredits - Conservative estimate
 * @returns {Promise<Object>} { allowed, usageAfter, error }
 */
export async function atomicReserve(sessionDigest, tier, estimatedCredits) {
  const redis = getRedisClient();

  // Lua script for atomic reservation
  const script = `
    local usageKey = KEYS[1]
    local nowMs = tonumber(ARGV[1])
    local tier = ARGV[2]
    local estimatedCredits = tonumber(ARGV[3])
    local tierLimit = tonumber(ARGV[4])
    local windowDurationMs = tonumber(ARGV[5])

    local usage = redis.call('HGETALL', usageKey)
    local usageMap = {}
    for i = 1, #usage, 2 do
      usageMap[usage[i]] = usage[i+1]
    end

    -- Initialize if not present
    if not usageMap.version then
      usageMap.version = '1'
      usageMap.tier = tier
      usageMap.windowStartedAt = tostring(nowMs)
      usageMap.resetAt = tostring(nowMs + windowDurationMs)
      usageMap.settledCredits = '0'
      usageMap.reservedCredits = tostring(estimatedCredits)
      usageMap.requestCount = '1'
      usageMap.updatedAt = tostring(nowMs)

      local args = {}
      for k, v in pairs(usageMap) do
        table.insert(args, k)
        table.insert(args, v)
      end
      redis.call('HSET', usageKey, unpack(args))
      return {1, usageMap}
    end

    -- Check if window has reset
    local resetAt = tonumber(usageMap.resetAt)
    if nowMs >= resetAt then
      -- Window reset
      usageMap.windowStartedAt = tostring(nowMs)
      usageMap.resetAt = tostring(nowMs + windowDurationMs)
      usageMap.settledCredits = '0'
      usageMap.reservedCredits = tostring(estimatedCredits)
      usageMap.requestCount = '1'
      usageMap.updatedAt = tostring(nowMs)
    else
      -- Check limit
      local settled = tonumber(usageMap.settledCredits) or 0
      local reserved = tonumber(usageMap.reservedCredits) or 0
      local total = settled + reserved

      if total + estimatedCredits > tierLimit then
        return {0, nil, 'LIMIT_EXCEEDED'}
      end

      -- Reserve
      usageMap.reservedCredits = tostring(reserved + estimatedCredits)
      usageMap.requestCount = tostring((tonumber(usageMap.requestCount) or 0) + 1)
      usageMap.updatedAt = tostring(nowMs)
    end

    -- Persist
    local args = {}
    for k, v in pairs(usageMap) do
      table.insert(args, k)
      table.insert(args, v)
    end
    redis.call('HSET', usageKey, unpack(args))
    return {1, usageMap}
  `;

  const tierLimits = {
    trial: 10,
    builder: 30,
    professional: 100,
  };

  const tierLimit = tierLimits[tier] || 10;
  const windowDurationMs = 60 * 60 * 1000;
  const nowMs = Date.now();

  const result = await redis.eval(script, 1, [
    `cad:usage:${sessionDigest}`,
    nowMs.toString(),
    tier,
    estimatedCredits.toString(),
    tierLimit.toString(),
    windowDurationMs.toString(),
  ]);

  if (!result || result.length === 0) {
    return { allowed: false, error: 'REDIS_ERROR' };
  }

  const [allowed, usageData, errorCode] = result;

  if (allowed === 1) {
    return { allowed: true, usageAfter: usageData };
  } else {
    return { allowed: false, error: errorCode || 'UNKNOWN' };
  }
}

/**
 * Atomically settle credits after Anthropic response.
 * @param {string} sessionDigest
 * @param {number} estimatedCredits - The reservation amount
 * @param {number} actualCredits - Computed from actual tokens
 * @returns {Promise<Object>}
 */
export async function atomicSettle(sessionDigest, estimatedCredits, actualCredits) {
  const redis = getRedisClient();

  const script = `
    local usageKey = KEYS[1]
    local estimatedCredits = tonumber(ARGV[1])
    local actualCredits = tonumber(ARGV[2])
    local nowMs = ARGV[3]

    local usage = redis.call('HGETALL', usageKey)
    local usageMap = {}
    for i = 1, #usage, 2 do
      usageMap[usage[i]] = usage[i+1]
    end

    if not usageMap.version then
      return {0, nil, 'SESSION_NOT_FOUND'}
    end

    local reserved = tonumber(usageMap.reservedCredits) or 0
    if reserved < estimatedCredits then
      return {0, nil, 'RESERVATION_MISMATCH'}
    end

    -- Remove reserved, add settled
    usageMap.reservedCredits = tostring(reserved - estimatedCredits)
    usageMap.settledCredits = tostring((tonumber(usageMap.settledCredits) or 0) + actualCredits)
    usageMap.updatedAt = nowMs

    local args = {}
    for k, v in pairs(usageMap) do
      table.insert(args, k)
      table.insert(args, v)
    end
    redis.call('HSET', usageKey, unpack(args))
    return {1, usageMap}
  `;

  const result = await redis.eval(script, 1, [
    `cad:usage:${sessionDigest}`,
    estimatedCredits.toString(),
    actualCredits.toString(),
    Date.now().toString(),
  ]);

  if (!result || result.length === 0) {
    return { ok: false, error: 'REDIS_ERROR' };
  }

  const [ok, usageData, errorCode] = result;
  if (ok === 1) {
    return { ok: true, usageAfter: usageData };
  } else {
    return { ok: false, error: errorCode };
  }
}

/**
 * Atomically refund a failed reservation.
 * @param {string} sessionDigest
 * @param {number} estimatedCredits
 */
export async function atomicRefund(sessionDigest, estimatedCredits) {
  const redis = getRedisClient();

  const script = `
    local usageKey = KEYS[1]
    local estimatedCredits = tonumber(ARGV[1])
    local nowMs = ARGV[2]

    local usage = redis.call('HGETALL', usageKey)
    local usageMap = {}
    for i = 1, #usage, 2 do
      usageMap[usage[i]] = usage[i+1]
    end

    if not usageMap.version then
      return {0, nil}
    end

    local reserved = tonumber(usageMap.reservedCredits) or 0
    if reserved >= estimatedCredits then
      usageMap.reservedCredits = tostring(reserved - estimatedCredits)
      usageMap.updatedAt = nowMs

      local args = {}
      for k, v in pairs(usageMap) do
        table.insert(args, k)
        table.insert(args, v)
      end
      redis.call('HSET', usageKey, unpack(args))
      return {1, usageMap}
    end

    return {0, usageMap}
  `;

  const result = await redis.eval(script, 1, [
    `cad:usage:${sessionDigest}`,
    estimatedCredits.toString(),
    Date.now().toString(),
  ]);

  if (!result) {
    return { ok: false };
  }

  const [ok, usageData] = result;
  return { ok: ok === 1, usageAfter: usageData };
}
