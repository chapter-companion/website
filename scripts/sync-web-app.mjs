import {cp, mkdir, readFile, readdir, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Build Flutter first: flutter build web --release --base-href /app/
// --no-web-resources-cdn --pwa-strategy=none
const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(process.argv[2] ?? join(root, '../../bni-roster/bni_roster_app/build/web'));
const html = await readFile(join(source, 'index.html'), 'utf8');
if (!html.includes('<base href="/app/">')) throw new Error('Build the Flutter app with --base-href /app/.');
await readFile(join(source, 'main.dart.js'));
await readFile(join(source, 'flutter_bootstrap.js'));
// Generated output is intentionally ignored; only public, compiled files are
// deployed. Do not copy native configuration, credentials or source maps.
const target = join(root, 'dist/app');
await rm(target, {recursive:true, force:true});
await mkdir(target, {recursive:true});
await cp(source, target, {recursive:true, filter:(path) => !path.endsWith('.map') && !path.endsWith('.DS_Store')});
console.log(`Synced Flutter browser app (${(await readdir(target)).length} top-level entries) to dist/app.`);
