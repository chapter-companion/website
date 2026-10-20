import {downloadUrlFor, loadPublicAppLinkSettings} from './store-links.js';

// Flutter creates styles and WASM workers at runtime. Keep its policy scoped
// to /app/ so the passcode-protected document viewer retains its stricter CSP.
export const browserAppCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data: https:",
  "connect-src 'self' https://rfmzmoeherrzbjglwcor.supabase.co wss://rfmzmoeherrzbjglwcor.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://places.googleapis.com https://fonts.gstatic.com https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.x.ai",
  "worker-src 'self' blob:",
  "frame-src 'self' blob: https://www.google.com https://maps.google.com",
  "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ');

async function serveBrowserApp(request, env, url) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', {status:405, headers:{Allow:'GET, HEAD', 'Cache-Control':'no-store'}});
  }
  if (url.pathname === '/app') {
    url.pathname = '/app/';
    return new Response(null, {status:308, headers:{Location:url.toString(), 'Cache-Control':'no-store'}});
  }
  // Route navigation to the Flutter shell, but never return HTML for missing
  // scripts, fonts, WASM, or JSON. Those failures must remain visible as 404s.
  const isNavigation = !url.pathname.split('/').at(-1).includes('.');
  const assetUrl = new URL(isNavigation ? '/app/' : url.pathname, url.origin);
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = new Headers(response.headers);
  const missingAsset = !isNavigation && !url.pathname.endsWith('.html') &&
    (headers.get('Content-Type') ?? '').includes('text/html');
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('Content-Security-Policy', browserAppCsp);
  headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(missingAsset ? 'Not found' : response.body,
    {status:missingAsset ? 404 : response.status, headers});
}

/** Clean planner routes remain browser pages; existing native links keep their handoff. */
export function createWorker({loadSettings = loadPublicAppLinkSettings} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === '/app' || url.pathname.startsWith('/app/')) return serveBrowserApp(request, env, url);
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
