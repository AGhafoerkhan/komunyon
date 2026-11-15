import { isDayOfWeek, isIsoDate } from '@/lib/guards';
import type { BibleStudy, DayOfWeek } from '@/types';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Monday-first, matching calendars in the Netherlands. Sunday stays 0 in stored data. */
export const DAY_FILTERS: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];

export function dayName(day: DayOfWeek): string {
  return DAY_NAMES[day];
}

export function dayShort(day: DayOfWeek): string {
  return DAY_NAMES[day].slice(0, 3);
}

export function studyWeekday(study: Pick<BibleStudy, 'format' | 'dayOfWeek' | 'date'>): DayOfWeek | null {
  if (study.format === 'recurring') return study.dayOfWeek;
  if (!study.date || !isIsoDate(study.date)) return null;
  const [year, month, day] = study.date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const weekday = new Date(year, month - 1, day).getDay();
  return isDayOfWeek(weekday) ? weekday : null;
}

export function formatSchedule(study: Pick<BibleStudy, 'format' | 'dayOfWeek' | 'date' | 'time'>): string {
  if (study.format === 'recurring' && study.dayOfWeek !== null) {
    return `Every ${dayName(study.dayOfWeek)} · ${study.time}`;
  }
  if (study.date && isIsoDate(study.date)) {
    const [year, month, day] = study.date.split('-').map(Number);
    const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
    const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date);
    const rest = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    return `${weekday} ${rest} · ${study.time}`;
  }
  return study.time;
}

export function spotsLabel(approved: number, capacity: number): string {
  const left = Math.max(0, capacity - approved);
  if (left === 0) return 'Full';
  if (left === 1) return '1 left';
  return `${left} left`;
}
