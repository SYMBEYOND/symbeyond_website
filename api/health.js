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
  checks.upstash_url = process.env.CAD_TUTOR_USAGE_KV_REST_API_URL || 'MISSING';
  checks.upstash_token_set = !!process.env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN;

  if (process.env.CAD_TUTOR_USAGE_KV_REST_API_URL && process.env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN) {
    const testCommands = [
      { name: 'PING', cmd: ['PING'] },
      { name: 'SET', cmd: ['SET', 'health-test', 'ok'] },
      { name: 'INCRBY', cmd: ['INCRBY', 'health-counter', '1'] },
      { name: 'EVAL', cmd: ['EVAL', 'return 42', '0'] },
    ];

    checks.upstash_commands = {};

    for (const test of testCommands) {
      try {
        const url = process.env.CAD_TUTOR_USAGE_KV_REST_API_URL;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(test.cmd),
          timeout: 5000,
        });

        let data;
        try {
          data = await response.json();
        } catch {
          data = { error: 'Failed to parse response' };
        }

        checks.upstash_commands[test.name] = {
          status: response.status,
          ok: response.ok,
          error: data.error,
          result: data.result,
        };
      } catch (err) {
        checks.upstash_commands[test.name] = {
          error: err.message,
        };
      }
    }
  } else {
    checks.upstash = { error: 'Credentials not set' };
  }

  res.json({
    timestamp: new Date().toISOString(),
    checks,
  });
}
