# Chapter Companion website

Buildless public landing page and native app-link handoff for `chaptercompanion.app`.

## Passcode-protected planner pages

`https://chaptercompanion.app/connect/{32-character-token}` opens a browser page
with a passcode gate. A small Pages Worker (`dist/_worker.js`) serves this clean
route and applies no-store/no-index headers. The protected viewer deliberately
stays in the browser; the existing `/121-planner/` and `/invite/` native links
continue to work.

The Flutter app explicitly publishes a snapshot from the same final PDF painter.
It sends typed text, rectangle and image geometry, including real PDF line breaks,
page breaks, custom branding, hint masks and continued answers. The viewer uses
the identical worksheet backgrounds and Roboto font. It does not receive or
expose an original PDF file. `accessible_text` supplies a labelled text equivalent
for screen readers because the blank worksheet headings are raster images.

The Supabase Edge Function `planner-web-share` authenticates every unlock/check
with the token and passcode. The database migration
`20261018034909_protected_planner_web_links.sql` keeps documents and bcrypt hashes
out of anonymous and metadata/admin reads. Correct unlocks count views; background
checks do not. Owners can change passcodes or revoke links, and Laravel admin
tracks metadata, counts and revocations at `/planner-links`.

Only the project's public publishable key is shipped in JavaScript. The Edge
Function uses Supabase's built-in server-only service role and has its own
passcode authentication (`verify_jwt = false` for this new function only).
Failed attempts are limited per token and per hashed client address. A token can
be locked for 15 minutes after 10 failures, including distributed guesses;
changing its passcode resets its token bucket.

The browser keeps the passcode and unlocked content in memory, rechecks access
every 30 seconds and when the tab becomes visible, and locks after 10 minutes
without activity. It offers no download or print buttons, suppresses printed
content, and discourages save/copy/developer-tool shortcuts and context menus.
Browser controls cannot guarantee prevention of screenshots, developer tools,
saving or reconstruction once an authorized recipient can see the content.
Revocation blocks subsequent access; it cannot recall an already viewed copy.

When PDF template assets change, run `npm run sync:planner-assets` from this
checkout beside the Flutter repository (or pass its `assets/` path to
`node scripts/sync-planner-assets.mjs`). This copies the seven blank worksheets
and font and records their hashes. No personal planner data is bundled.

Deploy the Pages Worker and assets together using authenticated Wrangler:

```sh
npm run check:release
npm test
npx wrangler@4.151.1 pages deploy dist --project-name chapter-companion --branch main
```

Dashboard drag-and-drop uploads alone should not be used to update the Worker.
The backend migration and Edge Function must be deployed to the same Supabase
project before publishing the viewer. Test incorrect/correct passcodes, rotation,
revocation, cache headers and the legacy association URLs after deployment.

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

- Legacy `/121-planner/` URLs use an opaque 16–128 character alphanumeric token and only hand off to the app. Protected `/connect/` pages fetch a snapshot only after passcode verification.
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
