import { useEffect, useState } from 'react';

const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export const dateLabel = (value) => day.format(new Date(value));

export function shiftWindow({ starts_at, ends_at }, now) {
  const start = Date.parse(starts_at);
  const end = Date.parse(ends_at);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const tomorrow = new Date(midnight);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    today: start < +tomorrow && end > +midnight,
    phase: start > now ? 'Upcoming' : end <= now ? 'Completed' : 'In progress',
  };
}

export function timeRange({ starts_at, ends_at }) {
  const start = new Date(starts_at);
  const end = new Date(ends_at);
  return clock.format(start) + ' – ' + clock.format(end)
    + (dateLabel(start) === dateLabel(end) ? '' : ' (' + dateLabel(end) + ')');
}

export function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 15_000);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, []);
  return now;
}
