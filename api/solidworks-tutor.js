// SYMBEYOND AI CAD Tutor - serverless middleman with fair-use system
// Lives at: api/solidworks-tutor.js in the symbeyond_website repo root
// Vercel auto-deploys this as https://symbeyond.ai/api/solidworks-tutor
// The API key NEVER appears in this file. It lives in Vercel env vars.

import {
  createSession,
  deriveSessionDigest,
  parseSessionCookie,
} from './_lib/cad-session.js';
import {
  initializeSession,
  atomicReserve,
  atomicSettle,
  atomicRefund,
} from './_lib/cad-redis.js';
import {
  calculateCredits,
  estimateReservationCredits,
  buildUsageMetadata,
  isExhausted,
  formatTimestamp,
} from './_lib/cad-usage.js';

// Secondary abuse signal (in-memory IP tracking, non-blocking)
const hits = new Map();
const IP_LIMIT = 30;
const IP_WINDOW = 60 * 60 * 1000;

function trackIp(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, start: now };
  if (now - rec.start > IP_WINDOW) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count++;
  hits.set(ip, rec);
  return rec.count;
}

function clip(s, max) {
  return (typeof s === 'string' ? s : '').slice(0, max).trim();
}

/**
 * Resolve or create a session.
 */
async function resolveSession(cookieValue) {
  const secret = process.env.CAD_TUTOR_SESSION_SECRET;

  // Try to parse existing session
  if (cookieValue && secret) {
    const parsed = parseSessionCookie(cookieValue, secret);
    if (parsed) {
      return {
        token: parsed.token,
        digest: deriveSessionDigest(parsed.token),
        isNew: false,
      };
    }
  }

  // Create new trial session
  if (!secret) {
    throw new Error('Session system unavailable');
  }

  const sessionData = createSession({ tier: 'trial' });
  const digest = deriveSessionDigest(sessionData.token);

  // Store in Redis
  await initializeSession(digest, {
    version: '1',
    tier: 'trial',
    ownerRef: null,
    createdAt: sessionData.createdAt,
    expiresAt: sessionData.expiresAt,
  });

  return {
    token: sessionData.token,
    digest,
    cookie: sessionData.cookie,
    isNew: true,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  trackIp(ip);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'Server is missing its API key. Contact support.' });
  }

  // Parse request body
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const category = clip(body.category, 30);
  const software = clip(body.software, 30) || 'solidworks';
  const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];

  // Validate request (no credits consumed for invalid requests)
  if (!category || messages.length === 0) {
    return res.status(400).json({ error: 'Need a category and at least one message.' });
  }

  // Get or create session
  let session;
  let setCookieHeader = null;
  try {
    const cookieValue = req.headers.cookie
      ?.split(';')
      .find(c => c.trim().startsWith('cad_session='))
      ?.split('=')[1];

    session = await resolveSession(cookieValue);

    if (session.isNew && session.cookie) {
      const COOKIE_OPTIONS = {
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      };
      const cookieString = [
        `cad_session=${session.cookie}`,
        'Secure',
        'HttpOnly',
        `SameSite=${COOKIE_OPTIONS.sameSite}`,
        `Path=${COOKIE_OPTIONS.path}`,
        `Max-Age=${COOKIE_OPTIONS.maxAge}`,
      ].join('; ');
      setCookieHeader = cookieString;
    }
  } catch (err) {
    return res.status(503).json({ error: 'Fair-use system unavailable. Try again.' });
  }

  // Build system prompt
  const categoryDescriptions = {
    part: 'Part Modeling - Creating 3D solid parts from sketches and features.',
    assembly: 'Assemblies - Combining parts with mates and constraints.',
    drawing: 'Drawings & Detailing - 2D views, dimensions, weld callouts, and output.',
  };

  const softwareInfo = {
    solidworks: 'SolidWorks',
    fusion360: 'Fusion 360',
    onshape: 'Onshape',
  };

  const catDesc = categoryDescriptions[category] || 'CAD';
  const softwareName = softwareInfo[software] || 'CAD';

  const systemPrompt = `You are an expert ${softwareName} tutor helping engineers and makers learn CAD. The user is working in: ${catDesc}

Your approach:
- Answer briefly (2-4 sentences max) unless they ask for detail.
- Give exact shortcuts and menu paths when relevant.
- Explain the WHY, not just the HOW.
- If they ask something outside ${softwareName}, redirect politely.
- Assume they know CAD basics but may not know ${softwareName} specifics.

Be practical, direct, and honest about difficulty.`;

  const userMessages = messages.map(m => ({
    role: m.role || 'user',
    content: clip(m.content, 2000),
  }));

  // Reserve credits before calling Anthropic
  const estimatedCredits = estimateReservationCredits();
  let reservationResult;
  try {
    reservationResult = await atomicReserve(
      session.digest,
      'trial', // TODO: read from session data in production
      estimatedCredits
    );
  } catch (err) {
    return res.status(503).json({ error: 'Fair-use system unavailable. Try again.' });
  }

  if (!reservationResult.allowed) {
    // Check if exhausted
    const usageMetadata = buildUsageMetadata(reservationResult.usageAfter || {});
    if (isExhausted(usageMetadata.usedCredits, 'trial')) {
      if (setCookieHeader) {
        res.setHeader('Set-Cookie', setCookieHeader);
      }
      return res.status(429).json({
        ok: false,
        code: 'FAIR_USE_LIMIT',
        message: 'You have reached your current fair-use limit.',
        usage: usageMetadata,
      });
    }

    // Other reservation errors
    if (setCookieHeader) {
      res.setHeader('Set-Cookie', setCookieHeader);
    }
    return res.status(503).json({ error: 'Fair-use system unavailable. Try again.' });
  }

  // Call Anthropic
  let anthropicResponse;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: userMessages,
        cache_control: { type: 'ephemeral' },
      }),
    });

    if (!r.ok) {
      // Upstream failure: refund reservation
      try {
        await atomicRefund(session.digest, estimatedCredits);
      } catch {
        // Log but don't fail
      }

      const detail = await r.text();
      console.error('Anthropic API error:', r.status, detail);
      if (setCookieHeader) {
        res.setHeader('Set-Cookie', setCookieHeader);
      }
      return res.status(502).json({ error: 'Tutor service had a hiccup. Try again.' });
    }

    anthropicResponse = await r.json();
  } catch (err) {
    // Network error: refund reservation
    try {
      await atomicRefund(session.digest, estimatedCredits);
    } catch {
      // Log but don't fail
    }

    console.error('Handler error:', err);
    if (setCookieHeader) {
      res.setHeader('Set-Cookie', setCookieHeader);
    }
    return res.status(500).json({ error: 'Server error. Try again in a moment.' });
  }

  // Extract reply and usage
  const reply = (anthropicResponse.content || [])
    .map(c => c.text || '')
    .join('')
    .trim();

  if (!reply) {
    // No response: refund reservation
    try {
      await atomicRefund(session.digest, estimatedCredits);
    } catch {
      // Log but don't fail
    }

    if (setCookieHeader) {
      res.setHeader('Set-Cookie', setCookieHeader);
    }
    return res.status(502).json({ error: 'No response generated. Try rewording your question.' });
  }

  // Compute actual credits from Anthropic usage
  const inputTokens = anthropicResponse.usage?.input_tokens || 0;
  const outputTokens = anthropicResponse.usage?.output_tokens || 0;
  const actualCredits = calculateCredits(inputTokens, outputTokens);

  // Settle the reservation
  let settlementResult;
  try {
    settlementResult = await atomicSettle(
      session.digest,
      estimatedCredits,
      actualCredits
    );
  } catch (err) {
    // Settlement failure: operational risk
    console.error('Settlement error:', err);
    if (setCookieHeader) {
      res.setHeader('Set-Cookie', setCookieHeader);
    }
    return res.status(500).json({ error: 'Server error. Try again in a moment.' });
  }

  if (!settlementResult.ok) {
    console.error('Settlement failed:', settlementResult.error);
    if (setCookieHeader) {
      res.setHeader('Set-Cookie', setCookieHeader);
    }
    return res.status(500).json({ error: 'Server error. Try again in a moment.' });
  }

  // Build response
  const usageMetadata = buildUsageMetadata(settlementResult.usageAfter);

  if (setCookieHeader) {
    res.setHeader('Set-Cookie', setCookieHeader);
  }

  return res.status(200).json({
    reply,
    usage: usageMetadata,
  });
}
