import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as linkUtils from '../dist/link-utils.js';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const source = (await readFile(new URL('../dist/app.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '');
const configured = {
  ios_store_url: 'https://apps.apple.com/app/chapter-companion/id123456789',
  android_store_url: 'https://play.google.com/store/apps/details?id=com.example.chapter',
};

async function loadLanding(path = '/', userAgent = 'Desktop') {
  const elements = new Map();
  const timers = [];
  const visits = [];
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const listeners = new Map();
    elements.set(match[1], {
      href: /\bhref="([^"]+)"/.exec(match[0])?.[1],
      hidden: false, textContent: '', innerHTML: '',
      addEventListener: (event, listener) => listeners.set(event, listener),
      listeners,
    });
  }
  const context = vm.createContext({
    ...linkUtils,
    loadPublicAppLinkSettings: async () => configured,
    navigator: {userAgent, maxTouchPoints: 0},
    document: {
      visibilityState: 'visible',
      getElementById: (id) => elements.get(id),
      addEventListener: () => {},
    },
    window: {
      location: {href: `https://chaptercompanion.app${path}`, replace: (url) => visits.push(url)},
      setTimeout: (callback, delay) => { timers.push({callback, delay}); return timers.length; },
      clearTimeout: () => {},
      addEventListener: () => {},
    },
  });
  await new vm.Script(`(async () => { ${source}\n })()`).runInContext(context);
  return {elements, timers, visits};
}

test('homepage offers web sign in, signup and booking without requiring a native app', () => {
  assert.match(html, /id="open-app" href="\/app\/">Open web app/);
  assert.match(html, /href="\/app\/">Sign in<\/a>/);
  assert.match(html, /href="\/app\/\?auth=signup">Create account<\/a>/);
  assert.match(html, /Book your next 1-to-1/);
  assert.doesNotMatch(html, /href="(?:com\.soance\.|intent:)/);
  assert.match(html, /id="ios-store"[^>]+href="https:\/\/apps\.apple\.com\//);
  assert.match(html, /id="android-store"[^>]+href="https:\/\/play\.google\.com\//);
});

test('homepage stays in the browser on desktop and mobile after settings load and primary click', async () => {
  for (const userAgent of ['Desktop', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 'Android']) {
    const page = await loadLanding('/', userAgent);
    assert.equal(page.elements.get('open-app').href, '/app/');
    assert.equal(page.elements.get('ios-store').href, configured.ios_store_url);
    assert.equal(page.elements.get('android-store').href, configured.android_store_url);
    page.elements.get('open-app').listeners.get('click')();
    assert.deepEqual(page.visits, []);
    assert.equal(page.timers.length, 0, 'browser navigation must not schedule a store fallback');
    assert.equal(page.elements.get('account-prompt').hidden, false);
  }
});

test('shared planner and invite links retain their native handoffs', async () => {
  const token = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6';
  for (const path of [`/121-planner/${token}`, '/invite/member-123?data=YWJj']) {
    const desktop = await loadLanding(path);
    assert.equal(desktop.elements.get('open-app').href, `com.soance.mybni.app://${path.slice(1)}`);
    assert.deepEqual(desktop.visits, []);
    assert.equal(desktop.elements.get('account-prompt').hidden, true);
    const android = await loadLanding(path, 'Android');
    assert.match(android.elements.get('open-app').href, /^intent:\/\//);
    assert.deepEqual(android.visits, [android.elements.get('open-app').href]);
    assert.equal(android.timers.length, 1);
  }
});

test('invalid invitations hide their primary handoff and never redirect', async () => {
  const page = await loadLanding('/121-planner/invalid', 'Android');
  assert.equal(page.elements.get('open-app').hidden, true);
  assert.equal(page.timers.length, 0);
  assert.deepEqual(page.visits, []);
});
