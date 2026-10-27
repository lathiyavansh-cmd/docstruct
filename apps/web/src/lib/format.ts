/**
 * What this file does
 *   Small helpers that turn raw values into text people can read: dates, "3 min ago" times,
 *   file sizes and plural words.
 *
 * How it works
 *   - formatBytes is re-exported from the shared package so server and web show sizes the same way.
 *   - Two Intl.DateTimeFormat objects are made once and reused; they follow the browser's locale.
 *   - timeAgo() works out the gap in seconds and steps up to minutes, hours and days.
 *   - plural() picks "1 file" or "2 files".
 *
 * Where it fits
 *   Used by ActivityFeed, AnnotationsPanel, ReviewPanel, SharePanel, VersionHistory and most pages.
 *   Module: app shell / shared UI (owner: Vansh).
 */
export { formatBytes } from '@docstruct/shared';

// Built once and reused, because creating an Intl formatter is slow compared with calling it.
const dateTime = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatDate(iso: string): string {
  // Plain YYYY-MM-DD dates are calendar dates, not instants: format them without a time-zone shift.
  return dateOnly.format(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso));
}

/** "3 minutes ago", "yesterday", or the date for older events. */
export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  // Each step rounds to the next bigger unit; after a week we show the date instead.
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

/** Plain words for a review's due date: "Overdue by 2 days", "Due today", "Due in 3 days (12 Nov 2026)". */
export function dueLabel(dueDate: string | null, daysUntilDue: number | null): string {
  if (!dueDate || daysUntilDue === null) return 'No due date';
  if (daysUntilDue < 0) return `Overdue by ${-daysUntilDue} day${daysUntilDue === -1 ? '' : 's'}`;
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  return `Due in ${daysUntilDue} days (${formatDate(dueDate)})`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
