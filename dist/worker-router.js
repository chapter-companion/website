import {downloadUrlFor, loadPublicAppLinkSettings} from './store-links.js';

/** Clean planner routes remain browser pages; existing native links keep their handoff. */
export function createWorker({loadSettings = loadPublicAppLinkSettings} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const protectedPlanner = url.pathname === '/connect' || url.pathname.startsWith('/connect/');
      const download = url.pathname === '/download' || url.pathname === '/download/';
      if (protectedPlanner || download) {
        if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store',...(download ? {Vary:'User-Agent'} : {})}});
        if (download) {
          const userAgent = request.headers.get('User-Agent') ?? '';
          // Explicit mobile UAs work without JS. Macintosh-style iPadOS needs
          // the client page's touch-point check before it chooses the App Store.
          if (downloadUrlFor(userAgent, 0)) {
            const destination = downloadUrlFor(userAgent, 0, await loadSettings());
            return new Response(null, {status:302, headers:{
              Location:destination, 'Cache-Control':'no-store, max-age=0',
              Vary:'User-Agent', 'Referrer-Policy':'no-referrer',
              'X-Content-Type-Options':'nosniff',
            }});
          }
        }
        // Query parameters never participate in the chosen route or store URL.
        const pageUrl = new URL(protectedPlanner ? '/planner-connect' : '/app-download', url.origin);
        const response = await env.ASSETS.fetch(new Request(pageUrl, request));
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store, max-age=0');
        if (download) headers.append('Vary', 'User-Agent');
        if (protectedPlanner) headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
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
}
