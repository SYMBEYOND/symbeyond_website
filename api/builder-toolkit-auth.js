// SYMBEYOND Builder Toolkit - access code validator + session issuer
// Lives at: api/builder-toolkit-auth.js in the symbeyond_website repo root
// Vercel auto-deploys this as https://symbeyond.ai/api/builder-toolkit-auth
//
// Codes live in the BUILDER_TOOLKIT_CODES env var as JSON, one 4-digit
// code per member, e.g.:
//   {"1842":"thomas_frumkin","5071":"t_sommers","9304":"amita_kapoor"}
//
// To add a member: pick an unused 4-digit code, add it to that JSON in
// Vercel env vars, redeploy.
//
// If a code leaks (see log lines below - same code, many different IPs,
// short window): remove that code from the JSON, give the member a new
// one, redeploy. Only that one member is affected.

import {
  createSession,
  deriveSessionDigest,
  parseSessionCookie,
} from './_lib/cad-session.js';
import { initializeSession, getSession } from './_lib/cad-redis.js';
import { COOKIE_OPTIONS } from './_lib/cad-config.js';

function clip(s, max) {
  return (typeof s === 'string' ? s : '').slice(0, max).trim();
}

/**
 * Set secure HttpOnly cookie on response.
 */
function setCookie(res, cookieValue) {
  const cookieString = [
    `cad_session=${cookieValue}`,
    'Secure',
    'HttpOnly',
    `SameSite=${COOKIE_OPTIONS.sameSite}`,
    `Path=${COOKIE_OPTIONS.path}`,
    `Max-Age=${COOKIE_OPTIONS.maxAge}`,
  ].join('; ');
  res.setHeader('Set-Cookie', cookieString);
}

/**
 * Clear the session cookie.
 */
function clearCookie(res) {
  const cookieString = [
    'cad_session=',
    'Secure',
    'HttpOnly',
    `SameSite=${COOKIE_OPTIONS.sameSite}`,
    `Path=${COOKIE_OPTIONS.path}`,
    'Max-Age=0',
  ].join('; ');
  res.setHeader('Set-Cookie', cookieString);
}

export default async function handler(req, res) {
  const method = req.method;
  const path = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;

  // Route: POST /api/builder-toolkit-auth (validate code and create session)
  if (method === 'POST' && !path.includes('/status')) {
    return handleValidate(req, res);
  }

  // Route: POST /api/builder-toolkit-auth/status (check session status)
  if (method === 'POST' && path.includes('/status')) {
    return handleStatus(req, res);
  }

  // Route: POST /api/builder-toolkit-auth/logout (clear session)
  if (method === 'POST' && path.includes('/logout')) {
    return handleLogout(req, res);
  }

  return res.status(405).json({ error: 'POST only' });
}

/**
 * Handle code validation and session creation.
 */
async function handleValidate(req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const code = clip(body.code, 4);

  if (!/^\d{4}$/.test(code)) {
    return res.status(400).json({ error: 'Enter your 4-digit code.' });
  }

  let codes = {};
  try {
    codes = JSON.parse(process.env.BUILDER_TOOLKIT_CODES || '{}');
  } catch {
    return res.status(500).json({ error: 'Server misconfigured. Contact support.' });
  }

  const ownerRef = codes[code];
  if (!ownerRef) {
    return res.status(401).json({ error: 'Code not recognized.' });
  }

  // Create signed session
  let sessionData;
  try {
    sessionData = createSession({ tier: 'builder', ownerRef });
  } catch (err) {
    return res.status(500).json({ error: 'Session creation failed. Contact support.' });
  }

  // Store in Redis
  try {
    const sessionDigest = deriveSessionDigest(sessionData.token);
    await initializeSession(sessionDigest, {
      version: '1',
      tier: 'builder',
      ownerRef,
      createdAt: sessionData.createdAt,
      expiresAt: sessionData.expiresAt,
    });
  } catch (err) {
    return res.status(503).json({ error: 'Fair-use system unavailable. Try again.' });
  }

  // Set secure HttpOnly cookie
  setCookie(res, sessionData.cookie);

  return res.status(200).json({
    ok: true,
    authenticated: true,
    tier: 'builder',
  });
}

/**
 * Handle session status check.
 */
async function handleStatus(req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const cookieValue = body.sessionCookie || req.headers.cookie
    ?.split(';')
    .find(c => c.trim().startsWith('cad_session='))
    ?.split('=')[1];

  if (!cookieValue) {
    return res.status(200).json({
      ok: true,
      authenticated: false,
    });
  }

  // Verify session signature
  const secret = process.env.CAD_TUTOR_SESSION_SECRET;
  if (!secret) {
    return res.status(200).json({
      ok: true,
      authenticated: false,
    });
  }

  const parsed = parseSessionCookie(cookieValue, secret);
  if (!parsed) {
    return res.status(200).json({
      ok: true,
      authenticated: false,
    });
  }

  // Check Redis
  try {
    const sessionDigest = deriveSessionDigest(parsed.token);
    const sessionRecord = await getSession(sessionDigest);

    if (!sessionRecord) {
      return res.status(200).json({
        ok: true,
        authenticated: false,
      });
    }

    const tier = sessionRecord.tier || 'trial';
    return res.status(200).json({
      ok: true,
      authenticated: true,
      tier,
    });
  } catch (err) {
    return res.status(200).json({
      ok: true,
      authenticated: false,
    });
  }
}

/**
 * Handle logout (clear session cookie and Redis).
 */
async function handleLogout(req, res) {
  clearCookie(res);

  return res.status(200).json({
    ok: true,
    authenticated: false,
  });
}
