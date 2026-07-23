export default async function handler(req, res) {
  const checks = {};

  // Check environment variables
  checks.env = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING',
    CAD_TUTOR_SESSION_SECRET: !!process.env.CAD_TUTOR_SESSION_SECRET ? 'SET' : 'MISSING',
    CAD_TUTOR_USAGE_KV_REST_API_URL: !!process.env.CAD_TUTOR_USAGE_KV_REST_API_URL ? 'SET' : 'MISSING',
    CAD_TUTOR_USAGE_KV_REST_API_TOKEN: !!process.env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN ? 'SET' : 'MISSING',
  };

  // Test Upstash connection
  if (process.env.CAD_TUTOR_USAGE_KV_REST_API_URL && process.env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN) {
    try {
      const url = `${process.env.CAD_TUTOR_USAGE_KV_REST_API_URL}/exec`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['PING']),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }

      checks.upstash = {
        status: response.status,
        ok: response.ok,
        url: process.env.CAD_TUTOR_USAGE_KV_REST_API_URL,
        response: data,
      };
    } catch (err) {
      checks.upstash = {
        error: err.message,
      };
    }
  } else {
    checks.upstash = { error: 'Credentials not set' };
  }

  res.json({
    timestamp: new Date().toISOString(),
    checks,
  });
}
