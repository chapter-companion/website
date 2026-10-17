import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, parseSharedLink, safeStoreUrl, normalizeSettings,
  platformFor, appLinkFor, androidIntentFor, createFallbackController,
} from '../dist/link-utils.js';

const token = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6';

test('planner paths accept opaque alphanumeric tokens and reject malformed values', () => {
  const route = parseSharedLink(`https://chaptercompanion.app/121-planner/${token}?source=share`);
  assert.deepEqual(route, { kind: 'planner', id: token, path: `/121-planner/${token}` });
  assert.equal(parseSharedLink('https://chaptercompanion.app/121-planner/too-short').kind, 'invalid');
  assert.equal(parseSharedLink(`https://chaptercompanion.app/121-planner/${token}/other`).kind, 'invalid');
  assert.equal(parseSharedLink('https://chaptercompanion.app/121-planner/%3BIntent').kind, 'invalid');
  assert.equal(parseSharedLink(`https://chaptercompanion.app/121-planner/${'A'.repeat(129)}`).kind, 'invalid');
  assert.equal(parseSharedLink('not a URL').kind, 'invalid');
});

test('invite links preserve encoded base64 without accepting extra intent metadata', () => {
  const data = 'eyJjaGFwdGVyIjoiQ2hhcHRlciJ9+/=';
  const invite = parseSharedLink(`https://chaptercompanion.app/invite/123e4567-e89b-12d3-a456-426614174000?data=${encodeURIComponent(data)}&other=ignored`);
  assert.equal(invite.kind, 'invite');
  assert.equal(invite.path, `/invite/123e4567-e89b-12d3-a456-426614174000?data=${encodeURIComponent(data)}`);
  assert.equal(parseSharedLink('https://chaptercompanion.app/invite/id?data=%3Bscheme%3Devil').kind, 'invalid');
  assert.equal(parseSharedLink(`https://chaptercompanion.app/invite/id?data=${'a'.repeat(16001)}`).kind, 'invalid');
});

test('store settings only permit real HTTPS App Store and Play Store destinations', () => {
  const android = 'https://play.google.com/store/apps/details?id=com.example.new';
  const ios = 'https://apps.apple.com/app/new-name/id123456';
  assert.deepEqual(normalizeSettings({ android_store_url: android, ios_store_url: ios }), {
    android_store_url: android, ios_store_url: ios,
  });
  for (const unsafe of [
    'javascript:alert(1)', 'https://play.google.com.evil.test/store/apps/details?id=bad',
    'http://play.google.com/store/apps/details?id=com.example.app',
    'https://user@play.google.com/store/apps/details?id=com.example.app',
    'https://play.google.com:8443/store/apps/details?id=com.example.app',
    'https://play.google.com/store/apps/details',
  ]) assert.equal(safeStoreUrl(unsafe, 'android'), DEFAULT_SETTINGS.android_store_url);
  assert.equal(safeStoreUrl('https://apps.apple.com/help', 'ios'), DEFAULT_SETTINGS.ios_store_url);
  assert.deepEqual(normalizeSettings(null), {
    android_store_url: DEFAULT_SETTINGS.android_store_url, ios_store_url: DEFAULT_SETTINGS.ios_store_url,
  });
});

test('custom and Android intent links carry exactly the validated route', () => {
  const route = parseSharedLink(`https://chaptercompanion.app/121-planner/${token}`);
  assert.equal(appLinkFor(route), `com.soance.mybni.app://121-planner/${token}`);
  const intent = androidIntentFor(route, 'javascript:evil');
  assert.equal(intent, `intent://121-planner/${token}#Intent;scheme=com.soance.mybni.app;package=com.soance.mybni.app;S.browser_fallback_url=${encodeURIComponent(DEFAULT_SETTINGS.android_store_url)};end`);
});

test('platform detection handles Android, iPhone, desktop, and iPad desktop mode', () => {
  assert.equal(platformFor('Mozilla/5.0 (Linux; Android 15)'), 'android');
  assert.equal(platformFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)'), 'ios');
  assert.equal(platformFor('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5), 'ios');
  assert.equal(platformFor('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0), 'desktop');
});

function fallbackHarness() {
  const timers = [];
  const visited = [];
  let visible = true;
  const controller = createFallbackController({
    schedule: (fn, delay) => { timers.push({ fn, delay }); return timers.length - 1; },
    // Deliberately leave callbacks available: cancellation cannot stop a
    // callback already queued by the browser, so the version guard matters.
    cancel: () => {}, isVisible: () => visible, navigate: (url) => visited.push(url),
  });
  return { controller, timers, visited, hide: () => { visible = false; } };
}

test('visible mobile pages reach a store if the app does not open', () => {
  const harness = fallbackHarness();
  harness.controller.start('https://apps.apple.com/app/id123');
  harness.timers[0].fn();
  assert.deepEqual(harness.visited, ['https://apps.apple.com/app/id123']);
});

test('app activation prevents an old queued fallback from stealing navigation', () => {
  const harness = fallbackHarness();
  harness.controller.start('store');
  harness.controller.stop();
  harness.timers[0].fn();
  assert.deepEqual(harness.visited, []);
});

test('hidden pages never navigate and replacing a timer invalidates the old one', () => {
  const harness = fallbackHarness();
  harness.controller.start('old-store');
  harness.controller.start('new-store');
  harness.timers[0].fn();
  assert.deepEqual(harness.visited, []);
  harness.hide();
  harness.timers[1].fn();
  assert.deepEqual(harness.visited, []);
  harness.controller.start('hidden-store');
  assert.equal(harness.timers.length, 2);
});
