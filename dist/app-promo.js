import {applyStoreLinks, loadPublicAppLinkSettings} from './store-links.js';

applyStoreLinks(document, await loadPublicAppLinkSettings());
