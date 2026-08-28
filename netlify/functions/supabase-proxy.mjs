const SUPABASE_ORIGIN = 'https://wnavzhrkwgnegjdetdno.supabase.co';
const ALLOWED_PREFIXES = ['/auth/v1/', '/rest/v1/', '/storage/v1/', '/realtime/v1/'];

function response(status, body, headers = {}) {
  return { statusCode: status, body, headers: { 'content-type': 'application/json; charset=utf-8', 'x-wellone-relay': '1', 'cache-control': 'no-store', ...headers } };
}

export async function handler(event) {
  const target = event.queryStringParameters?.target || '';
  if (!target.startsWith('/')) return response(400, JSON.stringify({ message: 'Invalid Supabase relay target.' }));
  const upstream = new URL(target, SUPABASE_ORIGIN);
  if (upstream.origin !== SUPABASE_ORIGIN || !ALLOWED_PREFIXES.some(prefix => upstream.pathname.startsWith(prefix))) {
    return response(400, JSON.stringify({ message: 'Invalid Supabase relay target.' }));
  }

  const headers = { ...(event.headers || {}) };
  delete headers.host;
  delete headers['content-length'];
  delete headers.origin;
  delete headers.referer;

  let body;
  if (!['GET', 'HEAD'].includes(event.httpMethod || 'GET') && event.body) {
    body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
  }

  try {
    const upstreamResponse = await fetch(upstream, { method: event.httpMethod || 'GET', headers, body, redirect: 'manual' });
    const bytes = Buffer.from(await upstreamResponse.arrayBuffer());
    const outHeaders = {};
    upstreamResponse.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(lower)) outHeaders[key] = value;
    });
    outHeaders['x-wellone-relay'] = '1';
    outHeaders['cache-control'] = 'no-store';
    return { statusCode: upstreamResponse.status, headers: outHeaders, body: bytes.toString('base64'), isBase64Encoded: true };
  } catch (error) {
    return response(502, JSON.stringify({ message: 'Supabase relay connection failed.', detail: String(error?.message || error) }));
  }
}
