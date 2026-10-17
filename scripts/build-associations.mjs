import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('config/app-associations.json', root), 'utf8'));
if (!/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(config.iosAppId)) {
  throw new Error('Set the real Apple Team ID and bundle ID in config/app-associations.json.');
}
const fingerprints = config.androidSha256CertFingerprints;
if (!Array.isArray(fingerprints) || fingerprints.some((value) => !/^([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(value))) {
  throw new Error('Android SHA-256 fingerprints must contain 32 colon-separated hex bytes.');
}
if (process.argv.includes('--require-android') && fingerprints.length === 0) {
  throw new Error('Android App Links require the real release / Play App Signing SHA-256 fingerprint.');
}
const directory = new URL('dist/.well-known/', root);
await mkdir(directory, { recursive: true });
const apple = {
  applinks: {
    apps: [],
    details: [{ appID: config.iosAppId, paths: ['/121-planner/*', '/invite/*'] }],
  },
};
const android = fingerprints.length ? [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: config.androidPackageName,
    sha256_cert_fingerprints: fingerprints.map((value) => value.toUpperCase()),
  },
}] : [];
await writeFile(new URL('apple-app-site-association', directory), `${JSON.stringify(apple, null, 2)}\n`);
await writeFile(new URL('assetlinks.json', directory), `${JSON.stringify(android, null, 2)}\n`);
console.log(`Wrote app associations in ${fileURLToPath(directory)} (${fingerprints.length} Android signing certificate(s)).`);
