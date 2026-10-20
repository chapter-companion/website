import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../dist/_worker.js';
import {browserAppCsp} from '../dist/worker-router.js';

test('browser app redirects to its base directory and retains signup/callback parameters', async () => {
  const response = await worker.fetch(new Request('https://chaptercompanion.app/app?auth=signup&code=test'), {});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), 'https://chaptercompanion.app/app/?auth=signup&code=test');
});

test('browser app navigation uses its own shell and no-store WASM-capable security policy', async () => {
  let asset;
  const env = {ASSETS:{fetch:async (request) => {
    asset = new URL(request.url);
    return new Response('Flutter shell', {headers:{'Content-Type':'text/html', 'Content-Security-Policy':"script-src 'none'"}});
  }}};
  for (const path of ['/app/', '/app/bookings', '/app/?auth=signup&code=test']) {
    const response = await worker.fetch(new Request(`https://chaptercompanion.app${path}`), env);
    assert.equal(asset.pathname, '/app/');
    assert.equal(asset.search, '');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Security-Policy'), browserAppCsp);
    assert.match(browserAppCsp, /'wasm-unsafe-eval'/);
    assert.match(browserAppCsp, /wss:\/\/rfmzmoeherrzbjglwcor\.supabase\.co/);
    assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('Permissions-Policy'), 'camera=(self), microphone=(self), geolocation=(self)');
  }
});

test('browser assets preserve paths, HEAD and MIME types; missing scripts cannot become HTML', async () => {
  let received;
  const env = {ASSETS:{fetch:async (request) => {
    received = request;
    return new Response('script', {headers:{'Content-Type':'application/javascript'}});
  }}};
  const response = await worker.fetch(new Request('https://chaptercompanion.app/app/main.dart.js', {method:'HEAD'}), env);
  assert.equal(new URL(received.url).pathname, '/app/main.dart.js');
  assert.equal(received.method, 'HEAD');
  assert.equal(response.headers.get('Content-Type'), 'application/javascript');
  const missing = await worker.fetch(new Request('https://chaptercompanion.app/app/missing.js'),
    {ASSETS:{fetch:async () => new Response('landing page', {headers:{'Content-Type':'text/html'}})}});
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Not found');
  const rejected = await worker.fetch(new Request('https://chaptercompanion.app/app/', {method:'POST'}), {});
  assert.equal(rejected.status, 405);
});

test('browser security exceptions stay scoped to app routes and worker invocation includes assets', async () => {
  const routes = JSON.parse(await readFile(new URL('../dist/_routes.json', import.meta.url)));
  assert.ok(routes.include.includes('/app'));
  assert.ok(routes.include.includes('/app/*'));
  const protectedResponse = await worker.fetch(new Request('https://chaptercompanion.app/connect/'+'A'.repeat(32)),
    {ASSETS:{fetch:async () => new Response('protected')}});
  assert.doesNotMatch(protectedResponse.headers.get('Content-Security-Policy'), /unsafe-inline|wasm-unsafe-eval/);
});
