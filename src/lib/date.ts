import { addDays, differenceInCalendarDays, format, parse, startOfWeek, endOfWeek } from 'date-fns'

export const DATE_KEY = 'yyyy-MM-dd'

/** 本地日期 → YYYY-MM-DD，避免 UTC 偏移 */
export function toDateKey(date: Date): string {
  return format(date, DATE_KEY)
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function parseDateKey(key: string): Date {
  return parse(key, DATE_KEY, new Date())
}

export function addDaysKey(key: string, days: number): string {
  return toDateKey(addDays(parseDateKey(key), days))
}

/** 1=周一 … 7=周日 */
export function weekdayOf(key: string): number {
  const day = parseDateKey(key).getDay()
  return day === 0 ? 7 : day
}

/** 以周一为一周起点 */
export function weekStartKey(key: string): string {
  return toDateKey(startOfWeek(parseDateKey(key), { weekStartsOn: 1 }))
}

export function weekEndKey(key: string): string {
  return toDateKey(endOfWeek(parseDateKey(key), { weekStartsOn: 1 }))
}

export function startOfMonthKey(key: string): string {
  return `${key.slice(0, 7)}-01`
}

export function endOfMonthKey(key: string): string {
  const d = parseDateKey(startOfMonthKey(key))
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return toDateKey(next)
}

export function daysBetween(fromKey: string, toKey: string): number {
  return differenceInCalendarDays(parseDateKey(toKey), parseDateKey(fromKey))
}

export function eachDayInclusive(fromKey: string, toKey: string): string[] {
  const days: string[] = []
  let cursor = fromKey
  let guard = 0
  while (cursor <= toKey && guard < 1000) {
    days.push(cursor)
    cursor = addDaysKey(cursor, 1)
    guard += 1
  }
  return days
}

const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function weekdayName(weekday: number): string {
  return WEEK_LABELS[weekday - 1] ?? ''
}

export function weekdayLabel(key: string): string {
  return WEEK_LABELS[weekdayOf(key) - 1]
}

export function formatDateLabel(key: string): string {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdayLabel(key)}`
}

export function formatShortDate(key: string): string {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  return `${year}年${Number(month)}月`
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}小时${m}分`
  return `${m}分钟`
}
