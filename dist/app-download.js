import {applyStoreLinks, downloadUrlFor, loadPublicAppLinkSettings} from './store-links.js';

const settings = await loadPublicAppLinkSettings();
applyStoreLinks(document, settings);
const destination = downloadUrlFor(navigator.userAgent, navigator.maxTouchPoints, settings);
if (destination) {
  document.getElementById('download-status').textContent = 'Opening your app store… If it doesn’t open, choose a store on this page.';
  window.location.replace(destination);
}
