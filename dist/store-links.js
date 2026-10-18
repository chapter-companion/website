import {normalizeSettings, platformFor} from './link-utils.js';

const settingsEndpoint = 'https://rfmzmoeherrzbjglwcor.supabase.co/rest/v1/rpc/get_public_app_link_settings';
const publicKey = 'sb_publishable_c1sBYr7bmBFmcHB47hsrjw_jBWh2-nX';

/** Public store settings only; no invitation token, passcode or document is sent. */
export async function loadPublicAppLinkSettings({fetchImpl = globalThis.fetch, timeoutMs = 1000} = {}) {
  const defaults = normalizeSettings();
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(defaults);
    }, timeoutMs);
  });
  const lookup = (async () => {
    try {
      const response = await fetchImpl(settingsEndpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', apikey: publicKey},
        body: '{}', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      return response.ok ? normalizeSettings(await response.json()) : defaults;
    } catch {
      return defaults;
    }
  })();
  try {
    // The deadline also bounds a slow response body or a fetch implementation
    // that has not yet completed its abort handling.
    return await Promise.race([lookup, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function applyStoreLinks(root, settings) {
  const safe = normalizeSettings(settings);
  for (const link of root.querySelectorAll('[data-store-platform]')) {
    const platform = link.dataset.storePlatform;
    if (platform === 'ios' || platform === 'android') link.href = safe[`${platform}_store_url`];
  }
}

/** Query parameters never participate in choosing a download destination. */
export function downloadUrlFor(userAgent, touchPoints, settings) {
  const platform = platformFor(userAgent, touchPoints);
  const safe = normalizeSettings(settings);
  return platform === 'desktop' ? null : safe[`${platform}_store_url`];
}
