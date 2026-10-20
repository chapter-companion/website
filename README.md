# Chapter Companion website

Public landing page, Flutter browser app, and native app-link handoff for `chaptercompanion.app`.

## Browser app

`https://chaptercompanion.app/app/` runs the existing Flutter member app in the
browser. `https://chaptercompanion.app/app/?auth=signup` opens account creation.
Accounts, chapter approval, member directories, published availability and
90-minute 121 reservations use the same Supabase backend as mobile. Existing
approval and participant access checks still apply. Native store purchases and
biometric unlock remain platform features; the established web/desktop access
policy does not require an App Store purchase.

The source is the adjacent `../../bni-roster/bni_roster_app` checkout. Build and
copy its public release output before deploying this website:

```sh
cd /Volumes/Transcend/bni/bni-roster/bni_roster_app
flutter build web --release --base-href /app/ --no-web-resources-cdn --pwa-strategy=none
cd /Volumes/Transcend/bni/bni-docs/chapter-companion-website
npm run sync:web-app
npm run check:release
npm test
npx wrangler@4.151.1 pages deploy dist --project-name chapter-companion --branch main
```

`dist/app/` is ignored generated output and must be rebuilt/synchronized on a
fresh checkout. The sync script accepts an optional absolute Flutter build
directory and verifies the `/app/` base href. It copies no native credentials
or source maps. Flutter bundles CanvasKit, fonts and PDF assets locally, and
its custom bootstrap does not register an offline service worker. The Worker
serves `/app/` navigation from its own shell and sends no-store headers for
browser app resources to prevent mixed release assets. Missing scripts return
404 rather than the public landing page.

Only `/app/` receives the CSP needed for Flutter's styles, WASM and PDF worker;
the protected `/connect/` viewer keeps its separate strict policy. Auth callback
parameters remain in the browser URL. Supabase Auth's production Site URL is
`https://chaptercompanion.app/app/`, and the exact redirect allowlist contains
that URL plus `com.soance.mybni.app://login-callback/`. Browser signup and password
recovery pass the browser callback; native apps retain their native callback.

Browser-triggered booking and connection notification Edge Functions must
support preflight from `https://chaptercompanion.app`. CORS does not replace
their existing JWT/participant checks. Booking records and notification outbox
transactions remain on the server.

Deployed on 19 October 2026 to Cloudflare Pages release
`8905d47a.chapter-companion.pages.dev`. Production `/app/` and signup URLs load,
the two JavaScript entry assets match the local release SHA-256 values, CanvasKit
has the correct WASM MIME type, and missing scripts return 404. Existing download,
protected planner, native invitation and association routes remain reachable.
Chrome production sign-in rejects synthetic invalid credentials with a useful
error, and the clean startup has no console warnings/errors. All 36 website tests,
11 Chrome Flutter tests (including booking success/conflict, publishing availability
and 390px auth layouts), 32 native focused regressions, 38 Edge Function tests and
the local PostgreSQL authorization/booking/registration suites passed. Flutter
analysis is clean. Live function preflights allow the website and reject foreign
origins; anonymous POSTs still return 401. No real account signup or reservation
was created during verification. Local release evidence is under
`output/web-app-qa/`.

## App downloads and planner promotion

`https://chaptercompanion.app/download` opens the configured Google Play URL on
Android and the configured App Store URL on iPhone and iPad, including iPad's
desktop browsing mode. The Worker returns an HTTP 302 for explicit Android,
iPhone and iPad user agents, using the configured store URL. Desktop visitors
see a branded page with both store buttons. Macintosh-style iPadOS uses a
client-side touch-point check to choose the App Store. Every download response
is no-store and varies on User-Agent; URL query parameters cannot choose a
redirect destination. The HTML includes working store buttons without JavaScript.

The Mac option uses the same validated, configurable App Store URL as iPhone and
iPad. The [official Apple listing](https://apps.apple.com/us/app/chapter-companion/id6804715863)
supports Macs with Apple silicon (M1 or later), running the iPhone/iPad app.
The website directs visitors to check current compatibility in the App Store;
it does not claim a native Mac build or Intel Mac support. Mac users remain on
the download page rather than being redirected automatically.

Windows visitors can view shared planners in their browser and use the mobile
companion. No verified Microsoft Store product URL is currently configured, so
the Windows card explains availability without an install button. Add a Windows
installation link only after its actual store listing has been verified.

The protected planner displays a small Chapter Companion promotion after both
the passcode gate and the unlocked viewer. It stays outside the document pages
and is suppressed when printing. Its app icon and store symbols are self-hosted.
It never redirects visitors automatically or changes the planner's access state.

The 18 October desktop follow-up is live as `66b81408.chapter-companion.pages.dev`
(runtime commit `ea3afde`, functional changes `a144c2e`). It removes the manual
Lock planner button and adds the existing iPhone/iPad App Store listing as the
install option for compatible Apple silicon Macs. Microsoft Store work was
deferred at the user's request; Windows visitors retain browser viewing guidance.
All 28 website tests and release checks passed. In an existing browser session,
a normal reload loaded the content-versioned assets, opened all seven sample
pages, showed no lock button or new console errors, and changed zoom correctly.
Both the download page and the passcode promotion fit a 390px viewport without
horizontal overflow. Store installation on physical devices was not tested.

The landing page, download route, and planner promotion share the public
`get_public_app_link_settings()` loader in `dist/store-links.js`. It sends no
token, passcode, document or referrer, allows only HTTPS App Store / Google Play
destinations, and falls back to trusted defaults after one second or any error.

Deployed on 18 October 2026 as `7546a912.chapter-companion.pages.dev`, runtime
source commit `88349a8`. Live HTTP checks verified Android and iPhone/iPad store
redirects, the desktop HTML response, no-store / User-Agent headers, ignored
redirect query parameters, and the existing www redirect and association files.
The live fictional seven-page planner opened with its passcode and displayed
the promotion below its final page; both store links were correct and the
browser reported no warnings or errors. The passcode screen also displayed the
promotion. Local 390px checks fit without horizontal overflow. All 25 website
tests and release checks passed; no physical-device test is claimed.

The live Laravel-managed app invitation template now includes
`https://chaptercompanion.app/download` while preserving its personalized
`{link}` placeholder. This makes the download link available to the submitted
mobile build 58 on its next settings fetch. Subsequent Flutter source changes
also append a missing download link to custom/offline messages and avoid
duplicates; those later source changes are not part of build 58.

## Passcode-protected planner pages

After unlocking a shared planner, **Book a 121** appears above and below the
document. Both buttons open the link owner's available-date calendar. Dates
and 90-minute times use the visitor's browser timezone, include online/in-person
labels, and support month navigation, refresh, and empty/unavailable states.
The calendar follows paginated server results for persisted and recurring slots.

The new `planner-web-share` `availability` action checks the same token,
passcode, passcode version, live owner status and rate limits as the viewer.
Its service-only database RPC derives the host from the link owner; a visitor
cannot choose another owner. Only the host's display name, member ID, open slot
IDs, times and meeting mode are returned. Addresses, other participants,
bookings and private planner data are not part of this response.

Selecting a time continues to `/app/?booking_member=<UUID>&booking_slot=<UUID>`.
The app preserves only those two public scheduling IDs and a timestamp through
sign-in, signup, email confirmation and chapter approval in the same browser.
The selection can be cancelled and expires after seven days. Before showing
review, `resolve_one_to_one_slot_for_booking` checks the actual member and slot
again as the signed-in approved member. The existing booking RPC reserves the
time only after explicit confirmation; a stale slot offers a fresh-time path.
The planner token, passcode and document never enter that URL or pending storage.
Locking/revoking the planner clears and closes its calendar, including pending
network responses. The two buttons sit outside the document rendering and are
suppressed together with the viewer when printing.

Deployed on 19 October 2026 as `d1271027.chapter-companion.pages.dev`, with
Supabase migration `20261019061134_planner_web_owner_booking_availability` and
the updated `planner-web-share` Edge Function. All 48 website tests, 16 Chrome
Flutter tests, 33 focused VM regressions, 19 planner Edge tests and the local
PostgreSQL privacy/booking/recurrence tests passed; Flutter analysis is clean.
Desktop and 390px sample-planner UI checks confirmed both buttons, owner dates,
time selection and the preserved sign-in selection. No production reservation
was created. Deployed script/style bytes match the release hashes.

An admin-owned link without a linked live member has no booking host: the
viewer remains available, and its calendar explains that the owner must set up
a member profile and availability. Do not infer a host from PDF text or assign
another member automatically. An unlinked owner intentionally returns no
available times; viewing the planner does not require assigning a member.
Follow-up live verification confirmed both this empty case and a linked owner's
nine available 90-minute sessions over the next 31 days, including recurring
occurrences. No account mapping, availability or reservation was changed.

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
without activity. The visible manual lock action has been removed; background
checks, passcode-change/revocation handling, and automatic locking remain.
It offers no download or print buttons, suppresses printed
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

Protected sharing was deployed on 18 October 2026 to Supabase project
`rfmzmoeherrzbjglwcor` and Cloudflare Pages deployment
`1c9163de.chapter-companion.pages.dev` (runtime source commit `ba2de69`). Live
checks confirmed a correct passcode opens the document, an old passcode fails
after rotation, and rotation/revocation clear an open viewer. The synthetic QA
link was revoked and removed afterward. Seven-page and ten-page Flutter
exports, including custom logos and continuation pages, were compared visually
with their HTML counterparts. A 390px viewport fit without horizontal overflow.
Website checks passed all 16 tests; the Edge Function passed 14 tests and the
database authorization/concurrency checks passed. No physical-device or new
mobile store build is claimed for this protected-sharing update.

Production was verified on 17 October 2026: the apex, planner and invitation
routes return HTTP 200 over HTTPS; both app-association files return JSON.
Cloudflare DNS uses proxied CNAME records for `@` and `www` pointing to
`chapter-companion.pages.dev`. The enabled redirect rule sends HTTPS `www`
requests to the apex with their path and query string preserved. Registrar
nameservers remain `grace.ns.cloudflare.com` and `kareem.ns.cloudflare.com`.

## Production deployment

The production host is the Cloudflare Pages **Direct Upload** project `chapter-companion` (`chapter-companion.pages.dev`), with custom domain `chaptercompanion.app`. This GitHub repository stores the source; GitHub commits do **not** deploy automatically. CI is not connected.

1. Run `npm run check:release` and `npm test` locally.
2. With an authenticated Wrangler installation, run `npx wrangler@4.151.1 pages deploy dist --project-name chapter-companion --branch main` from this repository. This deploys the protected-route Worker and all assets together.
3. Verify `/download`, `/connect/{32-character-token}`, `/121-planner/{32-character-token}`, `/invite/{id}`, and both `.well-known` JSON URLs on the production custom domain after deployment. Dashboard drag-and-drop alone is insufficient for the protected-route Worker.

The deployable output is `dist`; there is no framework build or dependency installation.

### Runtime asset versions

Fresh no-store HTML can still load an old cached script or stylesheet when its
URL is unchanged. Production static asset headers observed on 18 October 2026
allowed four hours of browser caching. In particular, a new planner page without
the manual lock button must never load the old script that requires that button.

When changing a runtime asset, change every URL that loads it, including any
JavaScript module import URLs. A version query on an entry script does not
automatically version its imports. For `/styles.css`, `/app-promo.css`, and
`/planner-assets/connect.js`, `npm test` requires `?v=` followed by the first
12 hexadecimal characters of the file's SHA-256 in every HTML reference. Update
all referencing pages when this check fails; do not reuse a date or release label.

After deployment, verify the versioned response bytes, then use an already-open
browser to confirm the new layout, absence of the manual lock action, and active
background access checks without console errors. A fresh browser alone does not
exercise an older cached runtime.

- The Pages custom domain owns the apex DNS record. Preserve mail, verification, and other unrelated DNS records.
- `_redirects` serves `/121-planner/{token}` and `/invite/{id}` through the landing page. No top-level `404.html` is shipped, so Cloudflare’s built-in single-page-app fallback also preserves deep links. Unknown routes render a friendly message in the client. Association files remain direct JSON responses.
- Configure `www.chaptercompanion.app` → `https://chaptercompanion.app` with a Cloudflare Redirect Rule / Bulk Redirect, preserving the path suffix and query string. Domain-level rules are not supported in Pages `_redirects`.
- `_headers` supplies the app-association MIME types and a restrictive content security policy.

No runtime credentials or build dependencies are needed. The Supabase `sb_publishable_…` key in `dist/store-links.js` is the application's public, anonymous API key, used only for the public settings RPC. Never replace it with a service-role or secret key.

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
