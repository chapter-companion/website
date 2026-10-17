export const APP_SCHEME = 'com.soance.mybni.app';
export const APP_PACKAGE = 'com.soance.mybni.app';
export const DEFAULT_SETTINGS = Object.freeze({
  share_link_base_url: 'https://chaptercompanion.app',
  android_store_url: 'https://play.google.com/store/apps/details?id=com.soance.mybni.app',
  ios_store_url: 'https://apps.apple.com/in/app/my-bni/id6804715863',
});

/** Keep user-controlled paths and query values out of intent metadata. */
export function parseSharedLink(input) {
  let url;
  try { url = new URL(input); } catch { return { kind: 'invalid' }; }
  if (url.pathname === '/' || url.pathname === '/index.html') return { kind: 'home' };
  const planner = /^\/121-planner\/([A-Za-z0-9]{16,128})\/?$/.exec(url.pathname);
  if (planner) return { kind: 'planner', id: planner[1], path: `/121-planner/${planner[1]}` };
  const invite = /^\/invite\/([A-Za-z0-9_-]{1,128})\/?$/.exec(url.pathname);
  if (invite) {
    const data = url.searchParams.get('data');
    // Existing invitations contain a base64-encoded public profile payload.
    // Preserve it verbatim without rendering or decoding the visitor's data.
    if (data !== null && (data.length > 16000 || !/^[A-Za-z0-9+/_=-]*$/.test(data))) return { kind: 'invalid' };
    return {
      kind: 'invite', id: invite[1],
      path: `/invite/${invite[1]}${data === null ? '' : `?data=${encodeURIComponent(data)}`}`,
    };
  }
  return { kind: 'invalid' };
}

export function safeStoreUrl(value, platform) {
  if (typeof value !== 'string') return DEFAULT_SETTINGS[`${platform}_store_url`];
  try {
    const url = new URL(value);
    const host = platform === 'android' ? 'play.google.com' : 'apps.apple.com';
    if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port) throw new Error();
    if (platform === 'android' && (url.pathname !== '/store/apps/details' || !url.searchParams.get('id'))) throw new Error();
    if (platform === 'ios' && !/\/id\d+\/?$/.test(url.pathname)) throw new Error();
    return url.href;
  } catch { return DEFAULT_SETTINGS[`${platform}_store_url`]; }
}

export function normalizeSettings(settings) {
  return {
    android_store_url: safeStoreUrl(settings?.android_store_url, 'android'),
    ios_store_url: safeStoreUrl(settings?.ios_store_url, 'ios'),
  };
}

export function platformFor(userAgent, touchPoints = 0) {
  if (/android/i.test(userAgent)) return 'android';
  if (/iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'ios';
  return 'desktop';
}

export function appLinkFor(route) {
  if (!['planner', 'invite'].includes(route.kind)) return `${APP_SCHEME}://`;
  return `${APP_SCHEME}://${route.path.slice(1)}`;
}

export function androidIntentFor(route, storeUrl) {
  const appLink = appLinkFor(route);
  return `intent://${appLink.slice(`${APP_SCHEME}://`.length)}#Intent;scheme=${APP_SCHEME};package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(safeStoreUrl(storeUrl, 'android'))};end`;
}

/** A page that became hidden must never redirect when its old timer fires. */
export function createFallbackController({ schedule, cancel, isVisible, navigate }) {
  let timer;
  let version = 0;
  function stop() {
    version += 1;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  return {
    stop,
    start(url, delay = 1800) {
      stop();
      const expected = version;
      if (!isVisible()) return;
      timer = schedule(() => {
        timer = undefined;
        if (expected === version && isVisible()) navigate(url);
      }, delay);
    },
  };
}
