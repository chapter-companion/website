# Chapter Companion website

Buildless public landing page and native app-link handoff for `chaptercompanion.app`.

Production was verified on 17 October 2026: the apex, planner and invitation
routes return HTTP 200 over HTTPS; both app-association files return JSON.
Cloudflare DNS uses proxied CNAME records for `@` and `www` pointing to
`chapter-companion.pages.dev`. The enabled redirect rule sends HTTPS `www`
requests to the apex with their path and query string preserved. Registrar
nameservers remain `grace.ns.cloudflare.com` and `kareem.ns.cloudflare.com`.

## Production deployment

The production host is the Cloudflare Pages **Direct Upload** project `chapter-companion` (`chapter-companion.pages.dev`), with custom domain `chaptercompanion.app`. This GitHub repository stores the source; GitHub commits do **not** deploy automatically. CI is not connected.

1. Run `npm run check:release` and `npm test` locally.
2. In the Cloudflare dashboard, open **Workers & Pages → chapter-companion → Create deployment**. Upload `dist/` or a ZIP containing the **contents** of `dist/` at its root, including `.well-known`, `_headers`, and `_redirects`. Do not wrap the assets in another `dist/` directory.
3. Alternatively, with an authenticated Wrangler installation, run `npx wrangler pages deploy dist --project-name chapter-companion --branch main` from this repository.
4. Verify `/121-planner/{32-character-token}`, `/invite/{id}`, and both `.well-known` JSON URLs on the production custom domain after deployment.

The deployable output is `dist`; there is no framework build or dependency installation.

- The Pages custom domain owns the apex DNS record. Preserve mail, verification, and other unrelated DNS records.
- `_redirects` serves `/121-planner/{token}` and `/invite/{id}` through the landing page. No top-level `404.html` is shipped, so Cloudflare’s built-in single-page-app fallback also preserves deep links. Unknown routes render a friendly message in the client. Association files remain direct JSON responses.
- Configure `www.chaptercompanion.app` → `https://chaptercompanion.app` with a Cloudflare Redirect Rule / Bulk Redirect, preserving the path suffix and query string. Domain-level rules are not supported in Pages `_redirects`.
- `_headers` supplies the app-association MIME types and a restrictive content security policy.

No runtime credentials or build dependencies are needed. The Supabase `sb_publishable_…` key in `dist/app.js` is the application's public, anonymous API key, used only for the public settings RPC. Never replace it with a service-role or secret key.

## Release association files

`config/app-associations.json` contains the Apple app identity and real Android signing certificates. Add the SHA-256 fingerprint from **Google Play Console → App integrity → App signing key certificate**. If multiple production signing certificates are used, include all of them. A local upload/debug signing certificate alone will not verify a Play-installed app.

```sh
npm run check:release
npm test
```

`check:release` fails when Android's real signing certificate is missing and regenerates:

- `dist/.well-known/apple-app-site-association`
- `dist/.well-known/assetlinks.json`

`npm run build` allows an unfinished association configuration for local development only.

The Flutter release must include `applinks:chaptercompanion.app` in its Apple Associated Domains entitlement and an Android verified `https` intent filter for `/121-planner/` and `/invite/`. Signing, platform entitlements, HTTPS, and the association files all need to match before installed apps can open through native Universal Links / Android App Links.

## Sharing and fallback

- Planner URLs use an opaque 16–128 character alphanumeric token. This public website never requests or displays private planner data.
- Invitation URLs preserve the existing `?data=` base64 payload in the native route without decoding or displaying it.
- iOS and Android first have the opportunity to open a verified installed app through the OS. A visible mobile webpage sends visitors to the relevant store; Android also attempts the custom-scheme intent.
- The visible **Open Chapter Companion** button retries the native route. Browser hide, blur, page exit, or user interaction cancels an outstanding automatic store redirect.
- Desktop visitors can choose either store or open their installed app.
- Store URLs load from `get_public_app_link_settings()` in Supabase. The request has a one-second deadline and validated built-in store defaults. Laravel admin owns these public settings.

App stores do not preserve arbitrary invitation tokens through installation. After installing the app, the visitor returns to the original shared link and opens it again. Some embedded browsers require **Open in browser** before they permit native app navigation.

## Local checks

```sh
npm run build
npm test
python3 -m http.server 8788 --directory dist
```

A basic local HTTP server serves `/`; Cloudflare Pages supplies the deep-path rewrites. For local deep-link testing, use a server that implements the two rules in `dist/_redirects`, or deploy a Pages preview.

The website can also be served by GitHub Pages, but GitHub Pages does not honor `_redirects` or `_headers`. Cloudflare Pages is the intended production host because it serves clean invitation routes and association JSON directly.
