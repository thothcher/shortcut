import { DAY } from '../config.js';

const TZ = 'Asia/Tbilisi';
const dateFmt = new Intl.DateTimeFormat('ka-GE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('ka-GE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});

const shortFmt = new Intl.DateTimeFormat('ka-GE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
/** 28 ნოე, 14:00 */
export const formatShortDateTime = (ms) => (ms ? shortFmt.format(new Date(ms)) : '—');

/** 28 ნოემბერი, 2026 */
export const formatDate = (ms) => (ms ? dateFmt.format(new Date(ms)) : '—');
/** 28 ნოე. 2026, 14:00 */
export const formatDateTime = (ms) => (ms ? dateTimeFmt.format(new Date(ms)) : '—');

/** 1000 tetri → "10 ₾", 1050 → "10.50 ₾" */
export function formatMoney(tetri) {
  const gel = tetri / 100;
  return `${Number.isInteger(gel) ? gel : gel.toFixed(2)} ₾`;
}

/** Whole days left until a timestamp (at least 1 while it is still in the future). */
export const daysLeft = (until, now = Date.now()) => (until && until > now ? Math.ceil((until - now) / DAY) : 0);

export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

export const ORDER_STATUS = {
  created: 'შექმნილი',
  processing: 'მუშავდება',
  approved: 'წარმატებული',
  declined: 'უარყოფილი',
  expired: 'ვადაგასული',
  reversed: 'დაბრუნებული',
};
