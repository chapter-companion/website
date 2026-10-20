import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {bookingUrl, dateKey, monthRanges, normalizeAvailability, createBookingCalendar} from '../dist/planner-assets/booking.js';
import {connectToken, validPasscode} from '../dist/planner-assets/document.js';

const memberId = '11111111-2222-4333-8444-555555555555';
const firstId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const secondId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const now = Date.parse('2026-10-19T08:00:00Z');
const slot = (id = firstId, starts = '2026-10-25T10:00:00Z', mode = 'online') => ({
  id, starts_at: starts, ends_at: new Date(Date.parse(starts) + 90 * 60000).toISOString(), timezone: 'UTC', mode,
});
const payload = (slots = [slot()], cursor = null) => ({
  passcode_version: 2, owner: {member_id: memberId, display_name: 'Fixture Member'},
  slots, next_cursor: cursor,
});

test('booking continuation contains only the selected member and slot, with a fixed app destination', () => {
  const target = new URL(bookingUrl(memberId, firstId), 'https://chaptercompanion.app');
  assert.equal(target.pathname, '/app/');
  assert.deepEqual([...target.searchParams], [['booking_member', memberId], ['booking_slot', firstId]]);
  for (const value of ['javascript:alert(1)', 'https://attacker.invalid', `${firstId}&passcode=secret`, undefined]) {
    assert.throws(() => bookingUrl(value, firstId));
    assert.throws(() => bookingUrl(memberId, value));
  }
});

test('availability excludes invalid, expired, out-of-window and non-90-minute slots', () => {
  const data = payload([
    slot(), slot(secondId, '2026-10-26T12:00:00Z', 'offline'),
    {...slot(), id: 'not-an-id'}, slot(firstId, '2026-10-18T10:00:00Z'),
    {...slot(), ends_at: '2026-10-25T11:00:00Z'},
    {...slot(), mode: '<script>'}, slot(firstId, '2026-11-02T10:00:00Z'),
  ]);
  const result = normalizeAvailability(data, {now, start: now, end: Date.parse('2026-11-01T00:00:00Z')});
  assert.equal(result.slots.length, 2);
  assert.deepEqual(result.slots.map((entry) => entry.mode), ['online', 'offline']);
  assert.deepEqual(normalizeAvailability({...payload(), owner: null}, {now}), {owner: null, slots: [], nextCursor: null});
  assert.throws(() => normalizeAvailability({...payload(), owner: {member_id: 'invalid', display_name: 'Name'}}, {now}));
  assert.throws(() => normalizeAvailability(payload([], {after_id: 'invalid', after_start_at: 'bad'}), {now}));
  assert.throws(() => normalizeAvailability(payload(Array(101).fill(slot())), {now}));
});

test('calendar date grouping uses the browser timezone across UTC date boundaries', () => {
  assert.equal(dateKey('2026-10-25T00:15:00Z', 'America/Los_Angeles'), '2026-10-24');
  assert.equal(dateKey('2026-10-25T23:15:00Z', 'Asia/Kolkata'), '2026-10-26');
});

test('calendar month boundaries include a full 31-day local month over a DST fall-back', () => {
  const module = new URL('../dist/planner-assets/booking.js', import.meta.url).href;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    `import {monthRanges} from ${JSON.stringify(module)}; console.log(JSON.stringify(monthRanges(1, Date.parse('2026-09-15T12:00:00Z'))));`],
  {env: {...process.env, TZ: 'Europe/London'}, encoding: 'utf8'}));
  assert.equal(result.ranges.length, 1);
  assert.equal(result.ranges[0].range_start, '2026-09-30T23:00:00.000Z');
  assert.equal(result.ranges[0].range_end, '2026-11-01T00:00:00.000Z');
  assert.equal(Date.parse(result.ranges[0].range_end) - Date.parse(result.ranges[0].range_start), 31 * 86400000 + 3600000);
  assert.throws(() => monthRanges(-1, now));
  assert.throws(() => monthRanges(12, now));
});

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.open = false;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll(tag) { return this.children.flatMap((child) => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'href') delete this.href; }
  addEventListener(event, callback) { this.listeners.set(event, callback); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  scrollIntoView() { this.scrolled = true; }
  focus() {}
  click() {
    if (this.disabled) return;
    const event = {defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }};
    this.listeners.get('click')?.(event);
    return event;
  }
}

function calendarFixture(loader, onAccessError) {
  const ids = [
    'booking-dialog', 'booking-times', 'booking-times-group', 'booking-continue', 'booking-selection',
    'booking-refresh', 'booking-prev', 'booking-next', 'booking-days', 'booking-times-label',
    'booking-owner', 'booking-month', 'booking-status', 'booking-timezone', 'booking-close',
  ];
  const elements = new Map(ids.map((id) => [id, new Element()]));
  const openButtons = [new Element('button'), new Element('button')];
  openButtons.forEach((button) => { button.disabled = true; });
  const calls = [];
  let cancelled = 0;
  const root = {
    querySelector: (selector) => elements.get(selector.slice(1)),
    querySelectorAll: () => openButtons,
    createElement: (tag) => new Element(tag),
  };
  const controller = createBookingCalendar({root, now: () => now,
    loadAvailability: async (query) => { calls.push(query); return loader(query); },
    cancelAvailability: () => { cancelled++; },
    onAccessError: () => { controller.reset(); onAccessError?.(); },
  });
  return {controller, elements, openButtons, calls, get cancelled() { return cancelled; }};
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('both viewer buttons open the owner calendar, paginate and continue only after slot selection', async () => {
  const cursor = {after_id: firstId, after_start_at: '2026-10-25T10:00:00Z'};
  const ui = calendarFixture((query) => query.after_id
    ? payload([slot(secondId, '2026-10-25T12:00:00Z', 'offline')])
    : payload([slot()], cursor));
  ui.controller.unlock();
  assert.ok(ui.openButtons.every((button) => !button.disabled));
  ui.openButtons[0].click();
  await settle();
  assert.equal(ui.calls.length, 2);
  assert.equal(ui.calls[1].after_id, firstId);
  assert.equal(ui.elements.get('booking-dialog').open, true);
  assert.match(ui.elements.get('booking-owner').textContent, /Fixture Member/);
  const times = ui.elements.get('booking-times').children;
  assert.equal(times.length, 2);
  assert.equal(times[0].children[1].textContent, 'Online');
  assert.equal(times[1].children[1].textContent, 'In person');
  assert.equal(ui.elements.get('booking-continue').hidden, true);
  times[1].click();
  assert.equal(ui.elements.get('booking-continue').href, bookingUrl(memberId, secondId));
  assert.equal(ui.elements.get('booking-continue').scrolled, true);
  assert.equal(ui.elements.get('booking-continue').hidden, false);
  ui.elements.get('booking-close').click();
  ui.openButtons[1].click();
  await settle();
  assert.equal(ui.elements.get('booking-dialog').open, true);
  assert.equal(ui.elements.get('booking-continue').hidden, true, 'opening again must require a fresh selection');
});

test('network failure supports refresh, an empty month is clear, and access loss closes and clears booking', async () => {
  let fail = true;
  const ui = calendarFixture(() => { if (fail) throw new TypeError('offline'); return payload([]); });
  ui.controller.unlock();
  ui.openButtons[0].click();
  await settle();
  assert.match(ui.elements.get('booking-status').textContent, /could not be loaded/);
  assert.equal(ui.elements.get('booking-refresh').disabled, false);
  fail = false;
  ui.elements.get('booking-refresh').click();
  await settle();
  assert.match(ui.elements.get('booking-status').textContent, /No available times this month/);
  let locked = false;
  const denied = calendarFixture(() => { throw Object.assign(new Error('denied'), {status: 403}); }, () => { locked = true; });
  denied.controller.unlock();
  denied.openButtons[0].click();
  await settle();
  assert.equal(locked, true);
  assert.equal(denied.elements.get('booking-dialog').open, false);
  assert.equal(denied.elements.get('booking-owner').textContent, '');
  assert.equal(denied.elements.get('booking-days').children.length, 0);
  assert.ok(denied.openButtons.every((button) => button.disabled));
});

test('locking while an availability request is in flight prevents a late response from restoring data', async () => {
  let finish;
  const ui = calendarFixture(() => new Promise((resolve) => { finish = resolve; }));
  ui.controller.unlock();
  ui.openButtons[0].click();
  ui.controller.reset();
  finish(payload());
  await settle();
  assert.ok(ui.cancelled > 0);
  assert.equal(ui.elements.get('booking-dialog').open, false);
  assert.equal(ui.elements.get('booking-owner').textContent, '');
  assert.equal(ui.elements.get('booking-times').children.length, 0);
  assert.equal(ui.elements.get('booking-continue').href, undefined);
});

test('a planner without a live member owner keeps both entry buttons and explains calendar setup', async () => {
  const ui = calendarFixture(() => ({passcode_version: 2, owner: null, slots: [], next_cursor: null}));
  ui.controller.unlock();
  ui.openButtons[0].click();
  await settle();
  assert.match(ui.elements.get('booking-owner').textContent, /has not enabled bookings yet/);
  assert.match(ui.elements.get('booking-status').textContent, /set up their member profile and available times/);
  assert.ok(ui.openButtons.every((button) => !button.disabled));
  assert.equal(ui.elements.get('booking-times').children.length, 0);
  assert.equal(ui.elements.get('booking-continue').href, undefined);
});

test('booking buttons bracket the protected document and auth guidance explains explicit confirmation', async () => {
  const html = await readFile(new URL('../dist/planner-connect.html', import.meta.url), 'utf8');
  assert.equal((html.match(/data-booking-open/g) ?? []).length, 2);
  assert.match(html, /data-booking-open[^>]*>Book a 121[\s\S]*id="pages"[\s\S]*data-booking-open[^>]*>Book a 121/);
  assert.match(html, /Sign in or create an account to review and confirm/);
  assert.match(html, /Your time is reserved only after you confirm/);
});

async function protectedViewerFixture(availability) {
  const html = await readFile(new URL('../dist/planner-connect.html', import.meta.url), 'utf8');
  const script = (await readFile(new URL('../dist/planner-assets/connect.js', import.meta.url), 'utf8'))
    .replace(/^import[^\n]+\n/gm, '');
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((entry) => [entry[1], new Element()]));
  const openButtons = [new Element('button'), new Element('button')];
  const events = new Map();
  const calls = [];
  const root = {
    visibilityState: 'visible', fonts: {load: async () => {}},
    getElementById: (id) => elements.get(id), querySelector: (selector) => elements.get(selector.slice(1)),
    querySelectorAll: (selector) => selector === '[data-booking-open]' ? openButtons : [],
    createElement: (tag) => new Element(tag), addEventListener: () => {},
  };
  const context = vm.createContext({
    document: root, location: {pathname: '/connect/'+'A'.repeat(32)},
    window: {scrollTo: () => {}, addEventListener: (event, callback) => events.set(event, callback)},
    AbortController, setTimeout, clearTimeout, setInterval: () => {}, connectToken, validPasscode,
    renderDocument: (_scene, pages) => pages.replaceChildren(new Element()),
    createBookingCalendar: (options) => createBookingCalendar({...options, root, now: () => now}),
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({url, options, body});
      if (body.action === 'unlock') return Response.json({passcode_version: 2, document: {pages: [{}]}});
      return availability({url, options, body});
    },
  });
  await new vm.Script(script).runInContext(context);
  elements.get('passcode').value = 'SecurePass123';
  await elements.get('unlock-form').listeners.get('submit')({preventDefault() {}});
  return {elements, openButtons, calls, events};
}

test('availability access denial immediately locks and clears the protected document', async () => {
  const page = await protectedViewerFixture(() => new Response(null, {status: 403}));
  assert.equal(page.elements.get('viewer').hidden, false);
  page.openButtons[0].click();
  await settle();
  assert.equal(page.elements.get('viewer').hidden, true);
  assert.equal(page.elements.get('gate').hidden, false);
  assert.equal(page.elements.get('pages').children.length, 0);
  assert.equal(page.elements.get('booking-dialog').open, false);
  assert.equal(page.calls[1].body.action, 'availability');
  assert.equal(page.calls[1].body.passcode, 'SecurePass123');
  assert.equal(page.calls[1].body.passcode_version, 2);
  assert.equal(new URL(page.calls[1].url).search, '');
  assert.equal(page.calls[1].options.credentials, 'omit');
  assert.equal(page.calls[1].options.cache, 'no-store');
});

test('page hide aborts pending availability and a late response cannot restore viewer or calendar', async () => {
  let finish;
  const page = await protectedViewerFixture(() => new Promise((resolve) => { finish = resolve; }));
  page.openButtons[0].click();
  const signal = page.calls[1].options.signal;
  page.events.get('pagehide')();
  assert.equal(signal.aborted, true);
  finish(Response.json(payload()));
  await settle();
  assert.equal(page.elements.get('viewer').hidden, true);
  assert.equal(page.elements.get('booking-owner').textContent, '');
  assert.equal(page.elements.get('booking-continue').href, undefined);
  assert.equal(page.elements.get('pages').children.length, 0);
});
