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

export function formatSchedule(
  study: Pick<BibleStudy, 'format' | 'dayOfWeek' | 'date' | 'time' | 'skippedDates'>,
): string {
  if (study.format === 'recurring' && study.dayOfWeek !== null) {
    const skipped = new Set(study.skippedDates);
    const next = upcomingSessions(study.dayOfWeek, study.time, 16).find((date) => !skipped.has(date));
    return next ? `${formatDdMmYyyy(next)} · ${study.time}` : study.time;
  }
  if (study.date && isIsoDate(study.date)) {
    return `${formatDdMmYyyy(study.date)} · ${study.time}`;
  }
  return study.time;
}

export function spotsLabel(approved: number, capacity: number): string {
  const left = Math.max(0, capacity - approved);
  if (left === 0) return 'Full';
  if (left === 1) return '1 left';
  return `${left} left`;
}

const UPCOMING_WEEKS = 8;

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatDdMmYyyy(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!day || !month || !year) return iso;
  return `${day}-${month}-${year}`;
}

function meetingHasPassed(now: Date, time: string): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return now.getHours() > hours || (now.getHours() === hours && now.getMinutes() > minutes);
}

/** The next sessions of one weekday, including today when that meeting has not started. */
export function upcomingSessions(day: DayOfWeek, time: string, count = UPCOMING_WEEKS, now = new Date()): string[] {
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (cursor.getDay() === day && meetingHasPassed(now, time)) cursor.setDate(cursor.getDate() + 1);
  while (cursor.getDay() !== day) cursor.setDate(cursor.getDate() + 1);
  const dates: string[] = [];
  for (let index = 0; index < count; index += 1) {
    dates.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

/** Shown when the next session of a recurring study will not meet. */
export function cancellationNote(
  study: Pick<BibleStudy, 'format' | 'dayOfWeek' | 'time' | 'skippedDates'>,
): string | null {
  if (study.format !== 'recurring' || study.dayOfWeek === null) return null;
  const sessions = upcomingSessions(study.dayOfWeek, study.time);
  const skipped = new Set(study.skippedDates);
  const next = sessions[0];
  if (!next || !skipped.has(next)) return null;
  const resume = sessions.find((date) => !skipped.has(date));
  if (!resume) return 'The upcoming sessions are canceled.';
  const [year, month, day] = next.split('-').map(Number);
  const following = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  following.setDate(following.getDate() + 7);
  if (resume === isoDate(following)) return 'This week is canceled. Bible study will proceed next week.';
  return `This week is canceled. Bible study will proceed on ${formatDdMmYyyy(resume)}.`;
}
