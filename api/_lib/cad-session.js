// CAD Tutor Session Management
// Opaque signed session tokens with HMAC-SHA256

import crypto from 'crypto';
import { timingSafeEqual } from 'crypto';
import { SESSION_LIFETIME } from './cad-config.js';

/**
 * Generate a cryptographically random opaque session token.
 * @returns {string} Base64url-encoded 32-byte random token
 */
export function generateOpaqueToken() {
  const randomBytes = crypto.randomBytes(32);
  return base64url(randomBytes);
}

/**
 * Sign an opaque token using HMAC-SHA256.
 * @param {string} token - The opaque token
 * @param {string} secret - The session secret (CAD_TUTOR_SESSION_SECRET)
 * @returns {string} Signature as base64url
 */
export function signToken(token, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(token);
  return base64url(hmac.digest());
}

/**
 * Verify a token signature using timing-safe comparison.
 * @param {string} token - The opaque token
 * @param {string} signature - The provided signature
 * @param {string} secret - The session secret
 * @returns {boolean} True if signature is valid
 */
export function verifyTokenSignature(token, signature, secret) {
  try {
    const expectedSignature = signToken(token, secret);
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

/**
 * Create a signed session record.
 * @param {Object} options
 * @param {string} options.tier - 'trial' or 'builder'
 * @param {string} [options.ownerRef] - Internal owner reference for Builder sessions only
 * @returns {Object} { token, signature, cookie }
 */
export function createSession(options) {
  const { tier, ownerRef } = options;
  const secret = process.env.CAD_TUTOR_SESSION_SECRET;

  if (!secret) {
    throw new Error('CAD_TUTOR_SESSION_SECRET not configured');
  }

  if (!['trial', 'builder'].includes(tier)) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  const token = generateOpaqueToken();
  const signature = signToken(token, secret);
  const cookieValue = `${token}.${signature}`;

  return {
    token,
    signature,
    cookie: cookieValue,
    tier,
    ownerRef: ownerRef || null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_LIFETIME[tier]).toISOString(),
  };
}

/**
 * Parse and verify a session cookie.
 * @param {string} cookieValue - The cookie value (token.signature)
 * @param {string} secret - The session secret
 * @returns {Object|null} { token, signature } or null if invalid
 */
export function parseSessionCookie(cookieValue, secret) {
  if (!cookieValue || typeof cookieValue !== 'string') {
    return null;
  }

  const parts = cookieValue.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [token, signature] = parts;

  if (!token || !signature) {
    return null;
  }

  if (!verifyTokenSignature(token, signature, secret)) {
    return null;
  }

  return { token, signature };
}

/**
 * Derive a one-way Redis lookup key from an opaque token.
 * Uses HMAC-SHA256 with a different secret to prevent timing attacks
 * from revealing the session token.
 * @param {string} token - The opaque session token
 * @returns {string} Redis-safe digest for key lookup
 */
export function deriveSessionDigest(token) {
  const secret = process.env.CAD_TUTOR_SESSION_SECRET;
  if (!secret) {
    throw new Error('CAD_TUTOR_SESSION_SECRET not configured');
  }

  const hmac = crypto.createHmac('sha256', secret + ':digest');
  hmac.update(token);
  return base64url(hmac.digest()).slice(0, 20); // truncate for brevity
}

/**
 * Safe encoding for tokens and signatures.
 * @param {Buffer} buffer
 * @returns {string} Base64url string
 */
function base64url(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
