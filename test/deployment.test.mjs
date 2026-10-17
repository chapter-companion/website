import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);

test('Cloudflare SPA fallback stays enabled and app association assets stay real JSON', async () => {
  await assert.rejects(access(new URL('404.html', dist)), { code: 'ENOENT' });
  const apple = JSON.parse(await readFile(new URL('.well-known/apple-app-site-association', dist)));
  const android = JSON.parse(await readFile(new URL('.well-known/assetlinks.json', dist)));
  assert.equal(apple.applinks.details[0].appID, 'NJKGDG3Y3G.com.soance.mybni.app');
  assert.ok(android[0].target.sha256_cert_fingerprints.length > 0);
});

test('Pages redirect sources use supported path syntax', async () => {
  const redirects = await readFile(new URL('_redirects', dist), 'utf8');
  for (const rule of redirects.trim().split('\n')) {
    assert.match(rule, /^\/\S+ \/\S+ 200$/);
  }
});
