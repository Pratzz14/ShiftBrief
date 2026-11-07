import assert from 'node:assert/strict';
import test from 'node:test';

process.env.TZ = 'Europe/Berlin';
const { shiftWindow } = await import('./shift-time.js');
const shift = (starts_at, ends_at) => ({ starts_at, ends_at });

test('overnight shifts overlap the current day and become completed at the end', () => {
  const overnight = shift('2026-11-06T22:00:00+01:00', '2026-11-07T06:00:00+01:00');
  assert.deepEqual(shiftWindow(overnight, Date.parse('2026-11-07T02:00:00+01:00')),
    { today: true, phase: 'In progress' });
  assert.deepEqual(shiftWindow(overnight, Date.parse('2026-11-07T06:00:00+01:00')),
    { today: true, phase: 'Completed' });
});

test('shifts ending or starting exactly at local midnight do not overlap adjacent dates', () => {
  const now = Date.parse('2026-11-07T12:00:00+01:00');
  assert.deepEqual(shiftWindow(shift('2026-11-06T22:00:00+01:00', '2026-11-07T00:00:00+01:00'), now),
    { today: false, phase: 'Completed' });
  assert.deepEqual(shiftWindow(shift('2026-11-08T00:00:00+01:00', '2026-11-08T08:00:00+01:00'), now),
    { today: false, phase: 'Upcoming' });
});

test('the end of today follows local midnight on the spring daylight saving transition', () => {
  const now = Date.parse('2026-03-29T09:00:00+02:00');
  const nextDay = shift('2026-03-30T00:30:00+02:00', '2026-03-30T08:30:00+02:00');
  assert.deepEqual(shiftWindow(nextDay, now), { today: false, phase: 'Upcoming' });
});
