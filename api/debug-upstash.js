export default function handler(req, res) {
  const url = process.env.CAD_TUTOR_USAGE_KV_REST_API_URL || 'MISSING';
  const token = process.env.CAD_TUTOR_USAGE_KV_REST_API_TOKEN ? 'SET' : 'MISSING';

  res.json({
    url,
    token,
    url_protocol: url.includes('://') ? url.split('://')[0] : 'NO_PROTOCOL',
    url_host: url.includes('://') ? url.split('://')[1] : url,
  });
}
