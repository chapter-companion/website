const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const color = (value) => value === undefined || (typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value));
const align = (value) => value === undefined || ['left', 'center', 'right'].includes(value);
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key));

export function connectToken(pathname) {
  return /^\/connect\/([A-Za-z0-9]{32})\/?$/.exec(pathname)?.[1] ?? null;
}

export function validPasscode(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{8,64}$/.test(value);
}

export function validDocument(document) {
  if (!keys(document, ['schema_version', 'layout_version', 'pages', 'accessible_text']) || document.schema_version !== 1 || document.layout_version !== 'one-to-one-v1' || (document.accessible_text !== undefined && (typeof document.accessible_text !== 'string' || document.accessible_text.length > 200000)) || !Array.isArray(document.pages) || document.pages.length < 1 || document.pages.length > 100) return false;
  let count = 0;
  for (const page of document.pages) {
    if (!keys(page, ['width', 'height', 'background', 'elements']) || !number(page.width, 100, 2000) || !number(page.height, 100, 8000) || (page.background !== undefined && !/^template-[1-7]$/.test(page.background)) || !Array.isArray(page.elements)) return false;
    for (const item of page.elements) {
      if (++count > 20000 || !item || !number(item.left, -100, 2000) || !number(item.top, -100, 8000) || !number(item.width, 0, 2000) || (item.height !== undefined && !number(item.height, 0, 8000))) return false;
      if (item.type === 'text') {
        if (!keys(item, ['type', 'left', 'top', 'width', 'height', 'text', 'fontSize', 'lineHeight', 'color', 'textAlign']) || typeof item.text !== 'string' || item.text.length > 60000 || !number(item.fontSize, 1, 100) || (item.lineHeight !== undefined && !number(item.lineHeight, 1, 200)) || !color(item.color) || !align(item.textAlign)) return false;
      } else if (item.type === 'rect' || item.type === 'line') {
        if (!keys(item, ['type', 'left', 'top', 'width', 'height', 'color', 'borderColor', 'borderWidth']) || !number(item.height, 0, 8000) || !color(item.color) || !color(item.borderColor) || (item.borderWidth !== undefined && !number(item.borderWidth, 0, 20))) return false;
      } else if (item.type === 'image') {
        if (!keys(item, ['type', 'left', 'top', 'width', 'height', 'src', 'fit', 'align']) || !number(item.height, 0, 8000) || typeof item.src !== 'string' || item.src.length > 700000 || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.src) || (item.fit !== undefined && item.fit !== 'contain') || !align(item.align)) return false;
      } else return false;
    }
  }
  return true;
}

/** The server sends typed geometry, never executable HTML or arbitrary styles. */
export function renderDocument(document, target) {
  if (!validDocument(document)) throw new Error('This planner could not be displayed. Ask the sender to update the link.');
  const dom = target.ownerDocument;
  const fragment = dom.createDocumentFragment();
  if (document.accessible_text) {
    const accessible = dom.createElement('div');
    accessible.className = 'screen-reader-only';
    accessible.textContent = document.accessible_text;
    fragment.append(accessible);
  }
  document.pages.forEach((page, index) => {
    const viewport = dom.createElement('section');
    viewport.className = 'page-viewport';
    viewport.setAttribute('aria-label', `Page ${index + 1} of ${document.pages.length}`);
    if (document.accessible_text) viewport.setAttribute('aria-hidden', 'true');
    const paper = dom.createElement('div');
    paper.className = 'planner-page';
    paper.style.width = `${page.width}px`;
    paper.style.height = `${page.height}px`;
    paper.dataset.width = page.width;
    paper.dataset.height = page.height;
    if (page.background) {
      const background = dom.createElement('img');
      background.src = `/planner-assets/${page.background}.png`;
      background.className = 'page-background';
      background.alt = '';
      background.draggable = false;
      paper.append(background);
    }
    page.elements.forEach((item) => {
      const node = dom.createElement(item.type === 'image' ? 'img' : 'div');
      node.className = `page-element page-${item.type}`;
      for (const key of ['left', 'top', 'width', 'height']) if (item[key] !== undefined) node.style[key] = `${item[key]}px`;
      if (item.type === 'text') {
        node.textContent = item.text;
        node.style.fontSize = `${item.fontSize}px`;
        node.style.lineHeight = item.lineHeight === undefined ? '1.2' : `${item.lineHeight}px`;
        node.style.color = item.color ?? '#000000';
        node.style.textAlign = item.textAlign ?? 'left';
      } else if (item.type === 'image') {
        node.src = item.src;
        node.alt = '';
        node.draggable = false;
        node.style.objectPosition = `${item.align ?? 'center'} center`;
      } else {
        if (item.color) node.style.backgroundColor = item.color;
        if (item.borderColor) node.style.border = `${item.borderWidth ?? 0.5}px solid ${item.borderColor}`;
      }
      paper.append(node);
    });
    viewport.append(paper);
    fragment.append(viewport);
  });
  target.replaceChildren(fragment);
}
