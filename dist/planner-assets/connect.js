import {connectToken, validPasscode, renderDocument} from './document.js';
import {createBookingCalendar} from './booking.js?v=2cb36e948a51';

const endpoint = 'https://rfmzmoeherrzbjglwcor.supabase.co/functions/v1/planner-web-share';
const publicKey = 'sb_publishable_c1sBYr7bmBFmcHB47hsrjw_jBWh2-nX';
const $ = (id) => document.getElementById(id);
const token = connectToken(location.pathname);
let passcode = null;
let version = null;
let unlocked = false;
let checking = false;
let lastActivity = Date.now();
let epoch = 0;
const requests = new Map();

function lock(message = 'The planner is locked. Enter the passcode to open it again.') {
  epoch++;
  for (const controller of requests.keys()) controller.abort();
  requests.clear();
  booking.reset();
  passcode = null;
  version = null;
  unlocked = false;
  $('pages').replaceChildren();
  $('viewer').hidden = true;
  $('gate').hidden = false;
  $('status').textContent = message;
  $('passcode').value = '';
  $('passcode').type = 'password';
  $('reveal').textContent = 'Show';
  $('reveal').setAttribute('aria-pressed', 'false');
  $('reveal').setAttribute('aria-label', 'Show passcode');
  document.title = 'Shared 121 planner · Chapter Companion';
  if (document.visibilityState === 'visible' && !$('unlock-form').hidden) $('passcode').focus();
}

async function call(action, secret, expectedVersion, availability = {}) {
  const controller = new AbortController();
  requests.set(controller, action);
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: {'Content-Type': 'application/json', apikey: publicKey},
      body: JSON.stringify({action, token, passcode: secret, ...(expectedVersion === undefined ? {} : {passcode_version: expectedVersion}),
        ...(action === 'availability' ? {
          range_start: availability.range_start, range_end: availability.range_end,
          ...(availability.after_start_at ? {after_start_at: availability.after_start_at, after_id: availability.after_id} : {}),
        } : {})}),
    });
    if (!response.ok) {
      const error = new Error(response.status === 403 ? 'This link or passcode is unavailable. Check with the sender, or try again later.' : 'The planner could not be opened. Please try again.');
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Could not reach the planner. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    requests.delete(controller);
  }
}

const booking = createBookingCalendar({
  loadAvailability: async (range) => {
    const attempt = epoch;
    if (!unlocked || !passcode) throw new Error('Open the planner to see available times.');
    const result = await call('availability', passcode, version, range);
    if (attempt !== epoch || !unlocked) throw new Error('The planner is locked.');
    if (result.passcode_version !== version) {
      const error = new Error('Access has changed.');
      error.status = 403;
      throw error;
    }
    return result;
  },
  cancelAvailability: () => {
    for (const [controller, action] of requests) if (action === 'availability') controller.abort();
  },
  onAccessError: () => lock('Access has changed. Enter the current passcode to continue.'),
});

function resizePages() {
  const choice = $('zoom').value;
  const available = Math.max(120, $('pages').clientWidth - 8);
  document.querySelectorAll('.planner-page').forEach((page) => {
    const width = Number(page.dataset.width), height = Number(page.dataset.height);
    const scale = choice === 'fit' ? Math.min(1.5, available / width) : Number(choice);
    page.style.transform = `scale(${scale})`;
    page.parentElement.style.width = `${width * scale}px`;
    page.parentElement.style.height = `${height * scale}px`;
  });
}

async function checkAccess() {
  if (!unlocked || checking || document.visibilityState !== 'visible') return;
  if (Date.now() - lastActivity > 10 * 60 * 1000) return lock('Your viewing session has ended. Enter the passcode to continue.');
  checking = true;
  const attempt = epoch;
  try {
    const result = await call('check', passcode, version);
    if (attempt !== epoch) return;
    if (result.passcode_version !== version) return lock('Access has changed. Ask the sender for the current passcode.');
    $('pages').hidden = false;
    $('viewer-status').textContent = '';
  } catch {
    if (attempt === epoch) lock('Access could not be confirmed. Enter the current passcode to continue.');
  } finally { checking = false; }
}

if (!token) {
  $('gate-title').textContent = 'This link needs another look.';
  $('gate-description').textContent = 'Ask the sender to copy a new planner link from Chapter Companion.';
  $('unlock-form').hidden = true;
}

$('unlock-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!token || $('unlock').disabled) return;
  const secret = $('passcode').value;
  if (!validPasscode(secret)) return;
  const attempt = ++epoch;
  $('unlock').disabled = true;
  $('status').textContent = 'Opening planner…';
  try {
    const result = await call('unlock', secret);
    if (attempt !== epoch) return;
    if (!Number.isSafeInteger(result.passcode_version) || result.passcode_version < 1) throw new Error('The planner could not be opened. Please try again.');
    await document.fonts.load('12px PlannerRoboto');
    if (attempt !== epoch) return;
    renderDocument(result.document, $('pages'));
    passcode = secret;
    version = result.passcode_version;
    unlocked = true;
    booking.unlock();
    lastActivity = Date.now();
    $('passcode').value = '';
    $('status').textContent = '';
    $('page-count').textContent = `${result.document.pages.length} pages`;
    $('pages').hidden = document.visibilityState !== 'visible';
    $('viewer').hidden = false;
    $('gate').hidden = true;
    resizePages();
    window.scrollTo({top: 0, behavior: 'auto'});
    $('viewer-title').focus();
  } catch (error) {
    if (attempt === epoch) $('status').textContent = error.message;
  } finally { $('unlock').disabled = false; }
});
$('reveal').addEventListener('click', () => {
  const show = $('passcode').type === 'password';
  $('passcode').type = show ? 'text' : 'password';
  $('reveal').textContent = show ? 'Hide' : 'Show';
  $('reveal').setAttribute('aria-pressed', String(show));
  $('reveal').setAttribute('aria-label', show ? 'Hide passcode' : 'Show passcode');
});
$('zoom').addEventListener('change', resizePages);
window.addEventListener('resize', resizePages);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { $('pages').hidden = true; booking.hide(); }
  else if (unlocked) checkAccess();
});
window.addEventListener('pagehide', () => lock('Enter the passcode to open the planner.'));
window.addEventListener('pageshow', (event) => { if (event.persisted) lock('Enter the passcode to open the planner.'); });
for (const name of ['pointerdown', 'keydown', 'scroll']) document.addEventListener(name, () => { lastActivity = Date.now(); }, {passive: true});
setInterval(checkAccess, 30000);

// These discourage browser UI exports. Access control is enforced on the server;
// browsers cannot guarantee prevention of screenshots, saving, or developer tools.
document.addEventListener('contextmenu', (event) => { if (unlocked) event.preventDefault(); });
document.addEventListener('dragstart', (event) => { if (unlocked) event.preventDefault(); });
document.addEventListener('copy', (event) => { if (unlocked) event.preventDefault(); });
document.addEventListener('keydown', (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (event.key === 'F12' || (modifier && ['p', 's', 'u'].includes(key)) || (modifier && (event.shiftKey || event.altKey) && ['i', 'j', 'c'].includes(key))) {
    event.preventDefault();
    if (unlocked) $('viewer-status').textContent = 'This planner is shared for on-screen viewing.';
  }
});
