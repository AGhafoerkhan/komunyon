import type { DayOfWeek } from '@/types';

export function isDayOfWeek(value: unknown): value is DayOfWeek {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Accepts `HH:mm` from `<input type="time">` and returns that value, or null. */
export function normalizeTime(value: string): string | null {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${match[1]}:${match[2]}`;
}
