import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const dist = new URL('../dist/', import.meta.url);
const runtimeAssets = new Set(['/styles.css', '/app-promo.css', '/planner-assets/connect.js']);

test('planner runtime and shared styles use current content hashes in every HTML reference', async () => {
  const expected = new Map();
  for (const path of runtimeAssets) {
    const bytes = await readFile(new URL(path.slice(1), dist));
    expected.set(path, createHash('sha256').update(bytes).digest('hex').slice(0, 12));
  }
  const found = new Set();
  for (const file of (await readdir(dist)).filter((name) => name.endsWith('.html'))) {
    const html = await readFile(new URL(file, dist), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"\s]+)"/g)) {
      const url = new URL(match[1], 'https://chaptercompanion.app');
      if (url.origin !== 'https://chaptercompanion.app' || !runtimeAssets.has(url.pathname)) continue;
      found.add(url.pathname);
      assert.equal(url.searchParams.get('v'), expected.get(url.pathname),
        `${file} must reference ${url.pathname}?v=${expected.get(url.pathname)}; stale URLs can load an older runtime with newer HTML.`);
    }
  }
  assert.deepEqual(found, runtimeAssets);
});
