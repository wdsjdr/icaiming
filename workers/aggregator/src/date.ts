export const DAILY_NEWS_PREFIX = 'misc/daily-news/';

// Beijing (Asia/Shanghai) calendar date, independent of the runtime timezone.
export function beijingDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

// ISO dates compare lexicographically the same as chronologically.
export function isOlderThan(date: string, cutoff: string): boolean {
  return date < cutoff;
}

export function dailyNewsKey(date: string): string {
  return `${DAILY_NEWS_PREFIX}${date}.jpg`;
}

export function parseDailyNewsKey(key: string): string | null {
  const match = /^misc\/daily-news\/(\d{4}-\d{2}-\d{2})\.jpg$/.exec(key);
  return match ? match[1] : null;
}