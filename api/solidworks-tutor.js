// SYMBEYOND AI SolidWorks Tutor - serverless middleman
// Lives at: api/solidworks-tutor.js in the symbeyond_website repo root
// Vercel auto-deploys this as https://symbeyond.ai/api/solidworks-tutor
// The API key NEVER appears in this file. It lives in Vercel env vars.

const hits = new Map();
const LIMIT = 30;          // max questions per IP
const WINDOW = 60 * 60 * 1000; // per hour

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, start: now };
  if (now - rec.start > WINDOW) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count++;
  hits.set(ip, rec);
  return rec.count > LIMIT;
}

function clip(s, max) {
  return (typeof s === 'string' ? s : '').slice(0, max).trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return res.status(429).json({
      error: 'You have asked a lot of questions. Rate limit: 30 per hour. Try again in a bit.'
    });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Server is missing its API key. Contact support.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const category = clip(body.category, 30);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];

  if (!category || messages.length === 0) {
    return res.status(400).json({ error: 'Need a category and at least one message.' });
  }

  const categoryDescriptions = {
    part: 'Part Modeling - Creating 3D solid parts from sketches and features.',
    assembly: 'Assemblies - Combining parts with mates and constraints.',
    drawing: 'Drawings & Detailing - 2D views, dimensions, weld callouts, and output.'
  };

  const catDesc = categoryDescriptions[category] || 'SolidWorks';

  const systemPrompt = `You are an expert SolidWorks tutor helping engineers and makers learn CAD. The user is working in: ${catDesc}

Your approach:
- Answer briefly (2-4 sentences max) unless they ask for detail.
- Give exact shortcuts and menu paths when relevant.
- Explain the WHY, not just the HOW.
- If they ask something outside SolidWorks, redirect politely.
- Assume they know CAD basics but may not know SolidWorks specifics.

Be practical, direct, and honest about difficulty.`;

  const userMessages = messages.map(m => ({
    role: m.role || 'user',
    content: clip(m.content, 2000)
  }));

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: userMessages
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Anthropic API error:', r.status, detail);
      return res.status(502).json({ error: 'Tutor service had a hiccup. Try again.' });
    }

    const data = await r.json();
    const reply = (data.content || []).map(c => c.text || '').join('').trim();

    if (!reply) {
      return res.status(502).json({ error: 'No response generated. Try rewording your question.' });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error. Try again in a moment.' });
  }
}
