/** Clean planner routes remain browser pages; existing native links keep their handoff. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/connect' || url.pathname.startsWith('/connect/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
      const pageUrl = new URL('/planner-connect', url.origin);
      const response = await env.ASSETS.fetch(new Request(pageUrl, request));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store, max-age=0');
      headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'DENY');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src https://rfmzmoeherrzbjglwcor.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      return new Response(response.body, {status:response.status,headers});
    }
    return env.ASSETS.fetch(request);
  },
};
