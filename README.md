# Chapter Companion website

Buildless public landing page and native app-link handoff for `chaptercompanion.app`.

## Cloudflare Pages

- Connect this GitHub repository to a Cloudflare Pages project.
- Production branch: `main`; build command: `npm run check:release`; output directory: `dist`.
- Add `chaptercompanion.app` as a Pages custom domain. Let Pages create its apex DNS record; preserve mail, verification, and other unrelated DNS records.
- `_redirects` serves `/121-planner/{token}` and `/invite/{id}` through the landing page. Association files remain direct JSON responses.
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
