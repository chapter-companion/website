import {readFile, readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const app = fileURLToPath(new URL('../dist/app/', import.meta.url));
try {
  const html = await readFile(join(app, 'index.html'), 'utf8');
  if (!html.includes('<base href="/app/">')) throw new Error('Incorrect Flutter base href.');
  for (const path of ['main.dart.js', 'flutter_bootstrap.js', 'canvaskit/canvaskit.wasm',
    'assets/assets/fonts/Roboto-Regular.ttf', 'assets/assets/branding/app_icon.png']) {
    if (!(await stat(join(app, path))).isFile()) throw new Error(`Missing ${path}.`);
  }
  async function checkDirectory(directory) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await checkDirectory(path);
      else if ((await stat(path)).size > 25 * 1024 * 1024) throw new Error(`Cloudflare Pages asset exceeds 25 MiB: ${entry.name}`);
    }
  }
  await checkDirectory(app);
  console.log('Verified /app/ browser release, local runtime assets and Pages file sizes.');
} catch (error) {
  throw new Error(`Browser app is not ready for deployment. Build Flutter, then run npm run sync:web-app. ${error.message}`);
}
