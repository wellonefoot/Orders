const SUPABASE_ORIGIN = 'https://wnavzhrkwgnegjdetdno.supabase.co';
const ALLOWED_PREFIXES = ['/auth/v1/', '/rest/v1/', '/storage/v1/', '/realtime/v1/'];

function targetUrl(requestUrl) {
  const incoming = new URL(requestUrl);
  const target = incoming.searchParams.get('target') || '';
  if (!target.startsWith('/')) return null;
  const upstream = new URL(target, SUPABASE_ORIGIN);
  if (upstream.origin !== SUPABASE_ORIGIN) return null;
  if (!ALLOWED_PREFIXES.some(prefix => upstream.pathname.startsWith(prefix))) return null;
  return upstream;
}

export async function onRequest(context) {
  const upstream = targetUrl(context.request.url);
  if (!upstream) return new Response(JSON.stringify({ message: 'Invalid Supabase relay target.' }), {
    status: 400,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-wellone-relay': '1', 'cache-control': 'no-store' }
  });

  const headers = new Headers(context.request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('origin');
  headers.delete('referer');

  try {
    const request = new Request(upstream.toString(), {
      method: context.request.method,
      headers,
      body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
      redirect: 'manual'
    });
    const response = await fetch(request);
    const outHeaders = new Headers(response.headers);
    outHeaders.set('x-wellone-relay', '1');
    outHeaders.set('cache-control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ message: 'Supabase relay connection failed.', detail: String(error?.message || error) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'x-wellone-relay': '1', 'cache-control': 'no-store' }
    });
  }
}
