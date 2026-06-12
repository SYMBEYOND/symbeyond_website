// SYMBEYOND AI Resume Builder 5000 - serverless middleman
// Lives at: api/resume.js in the symbeyond_website repo root
// Vercel auto-deploys this as https://symbeyond.ai/api/resume
// The API key NEVER appears in this file. It lives in Vercel env vars.

// Best-effort rate limiting (resets when the function cold-starts, which is fine:
// it only needs to slow down abuse, not be perfect)
const hits = new Map();
const LIMIT = 10;          // max drafts per IP
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

// Trim any field to a sane max length so nobody stuffs a novel in
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
      error: 'Easy there. This tool allows 10 drafts per hour. Try again in a bit, or use "Just format my words" which has no limit.'
    });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Server is missing its key. Tell John.' });
  }

  // Accept ONLY structured resume fields. The prompt is built HERE, server-side,
  // so this endpoint can never be repurposed as a free general-purpose AI proxy.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const name    = clip(body.name, 100);
  const target  = clip(body.target, 150);
  const posting = clip(body.posting, 4000);
  const edu     = clip(body.edu, 600);
  const skills  = clip(body.skills, 600);

  const jobs = Array.isArray(body.jobs) ? body.jobs.slice(0, 8).map(j => ({
    place: clip(j.place, 120),
    role:  clip(j.role, 120),
    when:  clip(j.when, 60),
    what:  clip(j.what, 1200),
    proud: clip(j.proud, 300)
  })) : [];

  if (!name && jobs.length === 0) {
    return res.status(400).json({ error: 'Need at least a name and one job.' });
  }

  const prompt = `You are helping someone write an honest one-page resume. Use ONLY the information provided. Do not invent employers, dates, numbers, certifications, or accomplishments that were not stated. You may rephrase their plain words into professional resume language with strong action verbs, and you may tailor word choices to the job posting where the person's real experience honestly matches.

THEIR INFO:
Name: ${name}
Target job: ${target || 'not specified'}
Job posting (may be empty): ${posting || 'none provided'}
Work history: ${JSON.stringify(jobs)}
Education: ${edu || 'none provided'}
Skills in their words: ${skills || 'none provided'}

Respond with ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:
{"summary":"2 sentence professional summary","jobs":[{"role":"","place":"","dates":"","bullets":["",""]}],"education":"one line or empty string","skills":["",""]}
Each job gets 2 to 4 bullets. Keep everything truthful to their input. If education or skills were not provided, return empty string or empty array.`;

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
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('Anthropic API error:', r.status, detail);
      return res.status(502).json({ error: 'The drafting service had a hiccup. Try again, or use "Just format my words."' });
    }

    const data = await r.json();
    const text = (data.content || []).map(c => c.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('JSON parse failed, raw output:', clean.slice(0, 300));
      return res.status(502).json({ error: 'The draft came back garbled. Try once more.' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Something broke on the server side. The manual mode always works.' });
  }
}
