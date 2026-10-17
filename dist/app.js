import {
  parseSharedLink, normalizeSettings, platformFor, appLinkFor,
  androidIntentFor, createFallbackController,
} from './link-utils.js';

const route = parseSharedLink(window.location.href);
const platform = platformFor(navigator.userAgent, navigator.maxTouchPoints);
const $ = (id) => document.getElementById(id);
const fallback = createFallbackController({
  schedule: window.setTimeout.bind(window),
  cancel: window.clearTimeout.bind(window),
  isVisible: () => document.visibilityState === 'visible',
  navigate: (url) => window.location.replace(url),
});
let settings = normalizeSettings();
let autoHandoffAllowed = true;

function cancelAutomaticHandoff() {
  autoHandoffAllowed = false;
  fallback.stop();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') cancelAutomaticHandoff();
});
window.addEventListener('pagehide', cancelAutomaticHandoff);
window.addEventListener('blur', cancelAutomaticHandoff);
// Give a visitor interacting with the page control over when they leave it.
document.addEventListener('pointerdown', cancelAutomaticHandoff);
document.addEventListener('keydown', cancelAutomaticHandoff);

if (route.kind === 'invalid') {
  $('eyebrow').textContent = 'LET’S GET YOU CONNECTED';
  $('title').textContent = 'This link needs another look.';
  $('description').textContent = 'The invitation link is incomplete or no longer in the right format. Ask the sender to share a new link from Chapter Companion.';
  $('open-app').hidden = true;
  $('route-note').textContent = 'You can still download Chapter Companion below.';
  $('illustration-label').textContent = 'STRONGER CONNECTIONS';
} else if (route.kind === 'planner') {
  $('eyebrow').textContent = 'YOUR 1-TO-1 INVITATION';
  $('title').innerHTML = 'Good conversations.<br><span>Stronger connections.</span>';
  $('description').textContent = 'Someone has shared a 1-to-1 planner with you. Open it in Chapter Companion to view the invitation and take the next step.';
  $('route-note').textContent = 'Already have the app? Your invitation opens there. New here? Download the app, then tap this link again.';
  $('illustration-label').textContent = 'YOUR NEXT 1-TO-1';
} else if (route.kind === 'invite') {
  $('eyebrow').textContent = 'YOU’RE INVITED TO CONNECT';
  $('title').innerHTML = 'Your chapter.<br><span>Closer together.</span>';
  $('description').textContent = 'You’ve received an invitation to Chapter Companion. Open the app to connect and continue the conversation.';
  $('route-note').textContent = 'After installing the app, return to this invitation and tap the link again.';
  $('illustration-label').textContent = 'A NEW CONNECTION';
}

function updateLinks() {
  $('android-store').href = settings.android_store_url;
  $('ios-store').href = settings.ios_store_url;
  $('open-app').href = platform === 'android'
    ? androidIntentFor(route, settings.android_store_url)
    : appLinkFor(route);
}
updateLinks();

$('open-app').addEventListener('click', () => {
  fallback.stop();
  if (platform === 'ios') fallback.start(settings.ios_store_url, 2200);
  if (platform === 'android') fallback.start(settings.android_store_url, 2200);
  // Android's intent URL contains its own store fallback. The OS chooses the
  // installed app before this page, when the verified App Link is available.
});

async function loadSettings() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch('https://rfmzmoeherrzbjglwcor.supabase.co/rest/v1/rpc/get_public_app_link_settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: 'sb_publishable_c1sBYr7bmBFmcHB47hsrjw_jBWh2-nX',
      },
      body: '{}', signal: controller.signal, credentials: 'omit', cache: 'no-store',
    });
    if (response.ok) settings = normalizeSettings(await response.json());
  } catch {
    // Store links remain available even if settings cannot be reached.
  } finally {
    window.clearTimeout(timeout);
  }
  updateLinks();
}

await loadSettings();
if (autoHandoffAllowed && ['planner', 'invite'].includes(route.kind) && document.visibilityState === 'visible') {
  if (platform === 'android') {
    $('redirect-status').textContent = 'Opening your invitation…';
    // Some browsers suppress intents without a user gesture. Use a guarded
    // store fallback as well; app activation cancels it on blur or page hide.
    fallback.start(settings.android_store_url, 2200);
    window.location.replace(androidIntentFor(route, settings.android_store_url));
  } else if (platform === 'ios') {
    $('redirect-status').textContent = 'Taking you to the App Store…';
    fallback.start(settings.ios_store_url, 1800);
  }
}
