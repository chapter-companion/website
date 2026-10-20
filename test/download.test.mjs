import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../dist/_worker.js';
import {createWorker} from '../dist/worker-router.js';
import {DEFAULT_SETTINGS, normalizeSettings} from '../dist/link-utils.js';
import {applyStoreLinks, downloadUrlFor, loadPublicAppLinkSettings} from '../dist/store-links.js';

const defaults = normalizeSettings();
const configured = {
  android_store_url: 'https://play.google.com/store/apps/details?id=com.example.chapter',
  ios_store_url: 'https://apps.apple.com/app/chapter-companion/id123456789',
};

test('download chooses configured stores for Android, iPhone and touch iPad, and leaves desktops on the page', () => {
  assert.equal(downloadUrlFor('Mozilla/5.0 (Linux; Android 15)', 5, configured), configured.android_store_url);
  assert.equal(downloadUrlFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 5, configured), configured.ios_store_url);
  assert.equal(downloadUrlFor('Mozilla/5.0 (iPad; CPU OS 18_0)', 5, configured), configured.ios_store_url);
  assert.equal(downloadUrlFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5, configured), configured.ios_store_url);
  for (const userAgent of ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)']) {
    assert.equal(downloadUrlFor(userAgent, 0, configured), null);
  }
  assert.equal(downloadUrlFor('Android', 1, {android_store_url:'https://attacker.invalid'}), DEFAULT_SETTINGS.android_store_url);
});

test('public settings request sends no private context and validates all returned destinations', async () => {
  let request;
  const settings = await loadPublicAppLinkSettings({fetchImpl:async (url, options) => {
    request = {url, options};
    return Response.json({...configured, ios_store_url:'javascript:alert(1)', redirect:'https://attacker.invalid'});
  }});
  assert.equal(request.url, 'https://rfmzmoeherrzbjglwcor.supabase.co/rest/v1/rpc/get_public_app_link_settings');
  assert.equal(request.options.body, '{}');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(settings.android_store_url, configured.android_store_url);
  assert.equal(settings.ios_store_url, DEFAULT_SETTINGS.ios_store_url);
  assert.deepEqual(Object.keys(settings).sort(), ['android_store_url', 'ios_store_url']);
});

test('unavailable and malformed public settings retain trusted store defaults', async () => {
  for (const fetchImpl of [
    async () => { throw new TypeError('offline'); },
    async () => new Response('Unavailable', {status:503}),
    async () => new Response('not JSON', {status:200}),
  ]) assert.deepEqual(await loadPublicAppLinkSettings({fetchImpl}), defaults);
});

test('settings deadline bounds both an unresponsive request and an unresponsive response body', async () => {
  for (const phase of ['request', 'body']) {
    let signal;
    const never = new Promise(() => {});
    const settings = await loadPublicAppLinkSettings({timeoutMs:10, fetchImpl:async (_url, options) => {
      signal = options.signal;
      return phase === 'request' ? never : {ok:true, json:() => never};
    }});
    assert.equal(signal.aborted, true);
    assert.deepEqual(settings, defaults);
  }
});

test('download Worker sends explicit mobile devices to validated configured stores without rendering an asset', async () => {
  const mobileWorker = createWorker({loadSettings:async () => configured});
  for (const [userAgent, expected] of [['Android', configured.android_store_url], ['iPhone', configured.ios_store_url], ['iPad', configured.ios_store_url]]) {
    const response = await mobileWorker.fetch(new Request('https://chaptercompanion.app/download?url=https://attacker.invalid&redirect=evil', {headers:{'User-Agent':userAgent}}), {});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), expected);
    assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
    assert.equal(response.headers.get('Vary'), 'User-Agent');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  }
  const unsafeWorker = createWorker({loadSettings:async () => ({android_store_url:'https://attacker.invalid', ios_store_url:'javascript:evil'})});
  const fallback = await unsafeWorker.fetch(new Request('https://chaptercompanion.app/download', {headers:{'User-Agent':'Android'}}), {});
  assert.equal(fallback.headers.get('Location'), DEFAULT_SETTINGS.android_store_url);
});

test('download Worker redirects through a settings timeout with trusted defaults', async () => {
  const timeoutWorker = createWorker({loadSettings:() => loadPublicAppLinkSettings({timeoutMs:10, fetchImpl:() => new Promise(() => {})})});
  const response = await timeoutWorker.fetch(new Request('https://chaptercompanion.app/download', {headers:{'User-Agent':'iPhone'}}), {});
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), DEFAULT_SETTINGS.ios_store_url);
});

test('download Worker serves no-store desktop and Macintosh iPad HTML without using query redirect parameters', async () => {
  const received = [];
  const env = {ASSETS:{fetch:async (request) => {
    received.push(request);
    return new Response('same download page', {headers:{'Content-Type':'text/html'}});
  }}};
  for (const userAgent of ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'Desktop', '']) {
    const response = await worker.fetch(new Request('https://chaptercompanion.app/download?url=https://attacker.invalid&redirect=evil', {headers:{'User-Agent':userAgent}}), env);
    assert.equal(await response.text(), 'same download page');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
    assert.equal(response.headers.get('Location'), null);
    assert.equal(response.headers.get('Vary'), 'User-Agent');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.match(response.headers.get('Content-Security-Policy'), /script-src 'self'/);
    assert.equal(new URL(received.at(-1).url).pathname, '/app-download');
    assert.equal(new URL(received.at(-1).url).search, '');
  }
});

test('download route supports HEAD and trailing slash while preserving other asset and legacy routes', async () => {
  let received;
  const env = {ASSETS:{fetch:async (request) => {
    received = request;
    return new Response('asset');
  }}};
  await worker.fetch(new Request('https://chaptercompanion.app/download/', {method:'HEAD'}), env);
  assert.equal(received.method, 'HEAD');
  assert.equal(new URL(received.url).pathname, '/app-download');
  const rejected = await worker.fetch(new Request('https://chaptercompanion.app/download', {method:'POST'}), {});
  assert.equal(rejected.status, 405);
  for (const path of ['/download/unrecognized', '/121-planner/'+'A'.repeat(32), '/invite/test', '/.well-known/assetlinks.json']) {
    await worker.fetch(new Request(`https://chaptercompanion.app${path}`), env);
    assert.equal(new URL(received.url).pathname, path);
  }
});

test('planner promotion stays after the viewer, separate from the document, and remains suppressed for print', async () => {
  const html = await readFile(new URL('../dist/planner-connect.html', import.meta.url), 'utf8');
  assert.match(html, /id="pages"[^>]*><\/div>[\s\S]*?<\/section>\s*<aside class="app-promo"/);
  assert.equal((html.match(/class="app-promo"/g) ?? []).length, 1);
  assert.match(html, /data-store-platform="ios"/);
  assert.match(html, /data-store-platform="android"/);
  const promoCss = await readFile(new URL('../dist/app-promo.css', import.meta.url), 'utf8');
  assert.match(promoCss, /@media print\{\.app-promo\{display:none!important\}\}/);
  const viewerCss = await readFile(new URL('../dist/planner-assets/connect.css', import.meta.url), 'utf8');
  assert.match(viewerCss, /body>\*\{display:none!important\}/);
  const routes = JSON.parse(await readFile(new URL('../dist/_routes.json', import.meta.url), 'utf8'));
  assert.ok(routes.include.includes('/connect/*'));
  assert.ok(routes.include.includes('/download'));
});

test('the Mac option follows the same validated dynamic App Store URL as iPhone and iPad', () => {
  const phone = {dataset:{storePlatform:'ios'}};
  const mac = {dataset:{storePlatform:'ios'}};
  const android = {dataset:{storePlatform:'android'}};
  const root = {querySelectorAll:() => [phone, mac, android]};
  applyStoreLinks(root, configured);
  assert.equal(phone.href, configured.ios_store_url);
  assert.equal(mac.href, configured.ios_store_url);
  assert.equal(android.href, configured.android_store_url);
  applyStoreLinks(root, {ios_store_url:'https://attacker.invalid'});
  assert.equal(mac.href, DEFAULT_SETTINGS.ios_store_url);
});

test('desktop options state verified Mac compatibility and link Windows users to the full browser app', async () => {
  const html = await readFile(new URL('../dist/app-download.html', import.meta.url), 'utf8');
  assert.match(html, /Apple silicon \(M1 or later\)/);
  assert.match(html, /Runs the iPhone\/iPad app; check compatibility in the App Store/);
  assert.doesNotMatch(html, /macOS (11|12)|Intel Mac/);
  assert.match(html, /Sign in, create an account and book your next 1-to-1 in your browser/);
  assert.match(html, /The web app works on Windows, Mac and other computers/);
  assert.match(html, /href="\/app\/">Open web app/);
  assert.doesNotMatch(html, /apps\.microsoft\.com|ms-windows-store:/);
});
