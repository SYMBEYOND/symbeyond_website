// SYMBEYOND BOSS - access code validator
// Lives at: api/boss-auth.js in the symbeyond_website repo root
// Vercel auto-deploys this as https://symbeyond.ai/api/boss-auth
//
// Codes live in the BOSS_CODES env var as JSON, one 4-digit
// code per member, e.g.:
//   {"4127":"thomas_frumkin","8350":"amita_kapoor","6094":"t_sommers","8520":"john_ducrest"}
//
// To add a member: pick an unused 4-digit code, add it to that JSON in
// Vercel env vars, redeploy.
//
// If a code leaks (same code, many different IPs, short window):
// remove that code from the JSON, give the member a new one, redeploy.
// Only that one member is affected.

function clip(s, max) {
  return (typeof s === 'string' ? s : '').slice(0, max).trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const code = clip(body.code, 4);

  if (!/^\d{4}$/.test(code)) {
    return res.status(400).json({ error: 'Enter your 4-digit code.' });
  }

  let codes = {};
  try {
    codes = JSON.parse(process.env.BOSS_CODES || '{}');
  } catch {
    return res.status(500).json({ error: 'Server misconfigured. Contact support.' });
  }

  const owner = codes[code];
  if (!owner) {
    console.log(`[boss-auth] DENY code=${code} ip=${ip} ts=${new Date().toISOString()}`);
    return res.status(401).json({ error: 'Code not recognized.' });
  }

  console.log(`[boss-auth] OK code=${code} owner=${owner} ip=${ip} ts=${new Date().toISOString()}`);

  return res.status(200).json({ ok: true });
}
