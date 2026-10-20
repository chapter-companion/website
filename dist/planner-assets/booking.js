const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dayMs = 86400000;

export function bookingUrl(memberId, slotId) {
  if (!uuid.test(memberId) || !uuid.test(slotId)) throw new Error('This booking is unavailable.');
  return `/app/?${new URLSearchParams({booking_member: memberId, booking_slot: slotId})}`;
}

export function dateKey(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'})
    .formatToParts(new Date(value));
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Local month boundaries preserve dates across daylight saving changes. */
export function monthRanges(offset, now = Date.now()) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 11) throw new Error('Choose an upcoming month.');
  const today = new Date(now);
  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime();
  const ranges = [];
  for (let start = Math.max(now, month.getTime()); start < end;) {
    const next = Math.min(end, start + 32 * dayMs);
    ranges.push({range_start: new Date(start).toISOString(), range_end: new Date(next).toISOString()});
    start = next;
  }
  return {year: month.getFullYear(), month: month.getMonth(), ranges};
}

export function normalizeAvailability(result, {now = Date.now(), start, end} = {}) {
  if (!result || !Array.isArray(result.slots) || result.slots.length > 100 ||
      (result.owner !== null && (!uuid.test(result.owner?.member_id) || typeof result.owner?.display_name !== 'string'))) {
    throw new Error('Available times could not be loaded. Please try again.');
  }
  if (result.owner === null) return {owner: null, slots: [], nextCursor: null};
  const slots = result.slots.flatMap((slot) => {
    const begins = Date.parse(slot?.starts_at), ends = Date.parse(slot?.ends_at);
    if (!uuid.test(slot?.id) || !Number.isFinite(begins) || !Number.isFinite(ends) ||
        begins <= now || ends - begins !== 90 * 60000 || !['online', 'offline'].includes(slot.mode) ||
        (start !== undefined && begins < start) || (end !== undefined && begins >= end)) return [];
    return [{id: slot.id, startsAt: new Date(begins).toISOString(), endsAt: new Date(ends).toISOString(), mode: slot.mode}];
  });
  let nextCursor = null;
  if (result.next_cursor !== null && result.next_cursor !== undefined) {
    const cursor = result.next_cursor;
    if (!uuid.test(cursor.after_id) || !Number.isFinite(Date.parse(cursor.after_start_at))) {
      throw new Error('Available times could not be loaded. Please try again.');
    }
    nextCursor = {after_id: cursor.after_id, after_start_at: new Date(cursor.after_start_at).toISOString()};
  }
  return {
    owner: {memberId: result.owner.member_id, displayName: result.owner.display_name.slice(0, 160)},
    slots, nextCursor,
  };
}

/** The loader is injected by the protected viewer; this module never receives its passcode or token. */
export function createBookingCalendar({root = document, loadAvailability, cancelAvailability = () => {}, onAccessError = () => {}, now = Date.now}) {
  const $ = (id) => root.querySelector(`#${id}`);
  const dialog = $('booking-dialog');
  const openButtons = [...root.querySelectorAll('[data-booking-open]')];
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const dateFormat = new Intl.DateTimeFormat(undefined, {timeZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});
  const timeFormat = new Intl.DateTimeFormat(undefined, {timeZone, hour: 'numeric', minute: '2-digit'});
  let enabled = false;
  let generation = 0;
  let monthOffset = 0;
  let month = null;
  let owner = null;
  let slots = [];
  let selectedDate = null;
  let selectedSlot = null;

  function clearSelection() {
    selectedDate = null;
    selectedSlot = null;
    $('booking-times').replaceChildren();
    $('booking-times-group').hidden = true;
    $('booking-continue').hidden = true;
    $('booking-continue').removeAttribute('href');
    $('booking-selection').textContent = '';
  }

  function hide() {
    generation++;
    cancelAvailability();
    if (dialog.open) dialog.close();
  }

  function setBusy(busy) {
    dialog.setAttribute('aria-busy', String(busy));
    $('booking-refresh').disabled = busy;
    $('booking-prev').disabled = busy || monthOffset === 0;
    $('booking-next').disabled = busy || monthOffset === 11;
  }

  function pickSlot(slot, button) {
    selectedSlot = slot;
    for (const item of $('booking-times').querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
    $('booking-selection').textContent = `${dateFormat.format(new Date(slot.startsAt))}, ${timeFormat.format(new Date(slot.startsAt))}–${timeFormat.format(new Date(slot.endsAt))} · ${slot.mode === 'offline' ? 'In person' : 'Online'}`;
    $('booking-continue').href = bookingUrl(owner.memberId, slot.id);
    $('booking-continue').hidden = false;
    $('booking-continue').scrollIntoView({block: 'nearest', behavior: 'auto'});
  }

  function pickDate(key) {
    selectedDate = key;
    selectedSlot = null;
    $('booking-continue').hidden = true;
    $('booking-continue').removeAttribute('href');
    $('booking-selection').textContent = '';
    for (const button of $('booking-days').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.date === key));
    const available = slots.filter((slot) => dateKey(slot.startsAt, timeZone) === key);
    $('booking-times').replaceChildren();
    $('booking-times-group').hidden = available.length === 0;
    if (!available.length) return;
    $('booking-times-label').textContent = `Available times · ${dateFormat.format(new Date(available[0].startsAt))}`;
    for (const slot of available) {
      const button = root.createElement('button');
      button.type = 'button';
      button.className = 'booking-time';
      const time = root.createElement('span');
      time.textContent = `${timeFormat.format(new Date(slot.startsAt))}–${timeFormat.format(new Date(slot.endsAt))}`;
      const mode = root.createElement('small');
      mode.textContent = slot.mode === 'offline' ? 'In person' : 'Online';
      button.append(time, mode);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => pickSlot(slot, button));
      $('booking-times').append(button);
    }
  }

  function renderDays() {
    const grid = $('booking-days');
    grid.replaceChildren();
    const first = new Date(month.year, month.month, 1);
    const total = new Date(month.year, month.month + 1, 0).getDate();
    const availableDates = new Set(slots.map((slot) => dateKey(slot.startsAt, timeZone)));
    for (let index = 0; index < first.getDay(); index++) {
      const space = root.createElement('span');
      space.setAttribute('aria-hidden', 'true');
      grid.append(space);
    }
    for (let day = 1; day <= total; day++) {
      const date = new Date(month.year, month.month, day, 12);
      const key = dateKey(date, timeZone);
      const button = root.createElement('button');
      button.type = 'button';
      button.dataset.date = key;
      button.textContent = String(day);
      button.disabled = !availableDates.has(key);
      button.setAttribute('aria-label', `${dateFormat.format(date)}${button.disabled ? ', no available times' : ', available'}`);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => pickDate(key));
      grid.append(button);
    }
    const firstAvailable = [...availableDates].sort()[0];
    if (firstAvailable) pickDate(firstAvailable);
  }

  async function loadMonth() {
    const attempt = ++generation;
    const timestamp = now();
    month = monthRanges(monthOffset, timestamp);
    owner = null;
    slots = [];
    clearSelection();
    $('booking-days').replaceChildren();
    $('booking-owner').textContent = 'Choose a time with the planner owner.';
    $('booking-month').textContent = new Intl.DateTimeFormat(undefined, {month: 'long', year: 'numeric'})
      .format(new Date(month.year, month.month, 1));
    $('booking-status').textContent = 'Loading available times…';
    setBusy(true);
    try {
      for (const range of month.ranges) {
        let cursor = null;
        let pages = 0;
        do {
          const result = await loadAvailability({...range, ...(cursor ?? {})});
          if (attempt !== generation || !enabled || !dialog.open) return;
          const page = normalizeAvailability(result, {now: timestamp, start: Date.parse(range.range_start), end: Date.parse(range.range_end)});
          if (owner && page.owner?.memberId !== owner.memberId) throw new Error('Available times have changed. Please refresh.');
          owner = page.owner;
          slots.push(...page.slots);
          cursor = page.nextCursor;
          if (++pages >= 20 && cursor) throw new Error('There are too many times to display. Please try another month.');
        } while (cursor);
      }
      if (attempt !== generation || !enabled || !dialog.open) return;
      slots = [...new Map(slots.map((slot) => [slot.id, slot])).values()]
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      $('booking-owner').textContent = owner ? `Book a 121 with ${owner.displayName}.` : 'The planner owner has not enabled bookings yet.';
      renderDays();
      $('booking-status').textContent = slots.length
        ? 'Choose an available date, then a time. Availability is checked again before booking.'
        : owner ? 'No available times this month. Try another month or refresh later.' : 'Ask them to set up their member profile and available times.';
    } catch (error) {
      if (attempt !== generation || !enabled || !dialog.open) return;
      slots = [];
      clearSelection();
      $('booking-days').replaceChildren();
      $('booking-status').textContent = 'Available times could not be loaded. Check your connection and try Refresh.';
      if (error.status === 403) onAccessError();
    } finally {
      if (attempt === generation) setBusy(false);
    }
  }

  function open() {
    if (!enabled) return;
    monthOffset = 0;
    dialog.showModal();
    $('booking-timezone').textContent = `All times are shown in ${timeZone.replaceAll('_', ' ')} (your timezone).`;
    loadMonth();
  }

  for (const button of openButtons) button.addEventListener('click', open);
  $('booking-close').addEventListener('click', hide);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); hide(); });
  $('booking-prev').addEventListener('click', () => { if (monthOffset > 0) { monthOffset--; loadMonth(); } });
  $('booking-next').addEventListener('click', () => { if (monthOffset < 11) { monthOffset++; loadMonth(); } });
  $('booking-refresh').addEventListener('click', loadMonth);
  $('booking-continue').addEventListener('click', (event) => {
    if (!enabled || !owner || !selectedSlot || Date.parse(selectedSlot.startsAt) <= now()) {
      event.preventDefault();
      $('booking-status').textContent = 'This time is no longer available. Refresh to choose another time.';
      clearSelection();
    }
  });
  return {
    unlock() { enabled = true; for (const button of openButtons) button.disabled = false; },
    hide,
    reset() {
      enabled = false;
      hide();
      owner = null;
      slots = [];
      clearSelection();
      $('booking-days').replaceChildren();
      $('booking-owner').textContent = '';
      $('booking-status').textContent = '';
      for (const button of openButtons) button.disabled = true;
    },
  };
}
