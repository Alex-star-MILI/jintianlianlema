import type {
  BodyWeight,
  CalorieLog,
  ExerciseCategory,
  SessionExercise,
  SetEntry,
  TrainingSession,
} from '../db/types'
import { CATEGORIES } from '../db/types'
import { estimateOneRepMax, totalVolume } from './metrics'
import {
  addDaysKey,
  daysBetween,
  eachDayInclusive,
  formatShortDate,
  parseDateKey,
  startOfMonthKey,
  toDateKey,
  weekStartKey,
  weekdayOf,
} from './date'

export type RangeKey = 'week' | 'month' | 'quarter' | 'all'

export const ALL_START = '0000-01-01'

export interface DateRange {
  start: string
  end: string
}

export function resolveRange(key: RangeKey, today: string): DateRange {
  if (key === 'week') {
    const start = weekStartKey(today)
    const end = addDaysKey(start, 6)
    return { start, end }
  }
  if (key === 'month') {
    const start = startOfMonthKey(today)
    const base = parseDateKey(start)
    const next = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    return { start, end: toDateKey(next) }
  }
  if (key === 'quarter') {
    const base = parseDateKey(today)
    const start = toDateKey(new Date(base.getFullYear(), base.getMonth() - 3, base.getDate()))
    return { start, end: today }
  }
  return { start: ALL_START, end: today }
}

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end
}

function completedSessions(sessions: TrainingSession[]): TrainingSession[] {
  return sessions.filter((session) => session.status === 'completed')
}

export function countSetsByDate(
  sessions: TrainingSession[],
  blocks: SessionExercise[],
  sets: SetEntry[],
): Record<string, number> {
  const sessionById = new Map(
    completedSessions(sessions).map((session) => [session.id, session]),
  )
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const counts: Record<string, number> = {}
  for (const set of sets) {
    if (!set.completed) continue
    const block = blockById.get(set.sessionExerciseId)
    if (!block) continue
    const session = sessionById.get(block.sessionId)
    if (!session) continue
    counts[session.date] = (counts[session.date] ?? 0) + 1
  }
  return counts
}

export interface WeekPoint {
  weekStart: string
  label: string
  count: number
}

/** 每周已完成训练次数；范围为全部时按最早记录起算，最多回看 26 周 */
export function weeklyTrainingCounts(
  sessions: TrainingSession[],
  range: DateRange,
): WeekPoint[] {
  const completed = completedSessions(sessions)
  const inRangeSessions = completed.filter((session) => inRange(session.date, range))
  const earliest = completed.reduce(
    (min, session) => (session.date < min ? session.date : min),
    range.end,
  )
  let firstWeek = weekStartKey(range.start === ALL_START ? earliest : range.start)
  const lastWeek = weekStartKey(range.end)

  const weeks: string[] = []
  let cursor = firstWeek
  while (cursor <= lastWeek) {
    weeks.push(cursor)
    cursor = addDaysKey(cursor, 7)
  }
  const trimmed = weeks.slice(-26)

  return trimmed.map((weekStart) => {
    const weekEnd = addDaysKey(weekStart, 6)
    const count = inRangeSessions.filter(
      (session) => session.date >= weekStart && session.date <= weekEnd,
    ).length
    return { weekStart, label: formatShortDate(weekStart), count }
  })
}

export interface VolumePoint {
  key: string
  label: string
  value: number
}

export function volumeSeries(
  sessions: TrainingSession[],
  range: DateRange,
  metric: 'volume' | 'sets',
  aggregate: 'session' | 'week',
): VolumePoint[] {
  const relevant = completedSessions(sessions).filter((session) =>
    inRange(session.date, range),
  )
  const buckets = new Map<string, number>()
  for (const session of relevant) {
    const key = aggregate === 'week' ? weekStartKey(session.date) : session.date
    const value = metric === 'volume' ? session.totalVolume : session.totalSets
    buckets.set(key, (buckets.get(key) ?? 0) + value)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => ({ key, label: formatShortDate(key), value }))
}

export interface StrengthPoint {
  date: string
  label: string
  maxWeight: number
  oneRepMax: number
}

export function strengthSeries(
  sessions: TrainingSession[],
  blocks: SessionExercise[],
  sets: SetEntry[],
  exerciseId: string,
  range: DateRange,
): StrengthPoint[] {
  const dateBySession = new Map(completedSessions(sessions).map((s) => [s.id, s.date]))
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const blockIds = new Set(
    blocks.filter((block) => block.exerciseId === exerciseId).map((block) => block.id),
  )
  const points = new Map<string, { maxWeight: number; oneRepMax: number }>()
  for (const set of sets) {
    if (!set.completed || !blockIds.has(set.sessionExerciseId)) continue
    const block = blockById.get(set.sessionExerciseId)
    if (!block) continue
    const date = dateBySession.get(block.sessionId)
    if (!date || !inRange(date, range)) continue
    const current = points.get(date) ?? { maxWeight: 0, oneRepMax: 0 }
    current.maxWeight = Math.max(current.maxWeight, set.weightKg)
    current.oneRepMax = Math.max(
      current.oneRepMax,
      estimateOneRepMax(set.weightKg, set.reps),
    )
    points.set(date, current)
  }
  return [...points.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({
      date,
      label: formatShortDate(date),
      maxWeight: value.maxWeight,
      oneRepMax: value.oneRepMax,
    }))
}

export function exercisePR(
  sessions: TrainingSession[],
  blocks: SessionExercise[],
  sets: SetEntry[],
  exerciseId: string,
): { pr: number; bestOneRepMax: number } {
  const completedIds = new Set(completedSessions(sessions).map((s) => s.id))
  const blockIds = new Set(
    blocks
      .filter((block) => block.exerciseId === exerciseId && completedIds.has(block.sessionId))
      .map((block) => block.id),
  )
  let pr = 0
  let bestOneRepMax = 0
  for (const set of sets) {
    if (!set.completed || !blockIds.has(set.sessionExerciseId)) continue
    pr = Math.max(pr, set.weightKg)
    bestOneRepMax = Math.max(bestOneRepMax, estimateOneRepMax(set.weightKg, set.reps))
  }
  return { pr, bestOneRepMax }
}

export interface CategorySlice {
  category: ExerciseCategory
  sets: number
  percent: number
}

export interface CategoryStale {
  category: ExerciseCategory
  days: number
}

export function categoryDistribution(
  sessions: TrainingSession[],
  blocks: SessionExercise[],
  sets: SetEntry[],
  today: string,
  windowDays = 30,
): { slices: CategorySlice[]; stale: CategoryStale[]; totalSets: number } {
  const windowStart = addDaysKey(today, -(windowDays - 1))
  const sessionById = new Map(completedSessions(sessions).map((s) => [s.id, s]))
  const blockById = new Map(blocks.map((block) => [block.id, block]))
  const counts = new Map<ExerciseCategory, number>()
  const lastDate = new Map<ExerciseCategory, string>()

  for (const set of sets) {
    if (!set.completed) continue
    const block = blockById.get(set.sessionExerciseId)
    if (!block) continue
    const session = sessionById.get(block.sessionId)
    if (!session) continue
    const previousDate = lastDate.get(block.categorySnapshot)
    if (!previousDate || session.date > previousDate) {
      lastDate.set(block.categorySnapshot, session.date)
    }
    if (session.date >= windowStart && session.date <= today) {
      counts.set(block.categorySnapshot, (counts.get(block.categorySnapshot) ?? 0) + 1)
    }
  }

  const totalSets = [...counts.values()].reduce((sum, value) => sum + value, 0)
  const slices = [...counts.entries()]
    .map(([category, count]) => ({
      category,
      sets: count,
      percent: totalSets ? Math.round((count / totalSets) * 100) : 0,
    }))
    .sort((a, b) => b.sets - a.sets)

  const stale = CATEGORIES.map((category) => {
    const last = lastDate.get(category)
    if (!last) return null
    if (counts.get(category)) return null
    const days = Math.max(0, daysBetween(last, today))
    return { category, days }
  })
    .filter((item): item is CategoryStale => item !== null)
    .sort((a, b) => b.days - a.days)

  return { slices, stale, totalSets }
}

export interface WeightPoint {
  date: string
  label: string
  weight: number
}

export function weightSeries(weights: BodyWeight[], range: DateRange): WeightPoint[] {
  return weights
    .filter((weight) => inRange(weight.date, range))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((weight) => ({
      date: weight.date,
      label: formatShortDate(weight.date),
      weight: weight.weightKg,
    }))
}

export interface CaloriePoint {
  date: string
  label: string
  total: number
  movingAvg: number
}

export function calorieSeries(logs: CalorieLog[], range: DateRange): CaloriePoint[] {
  const relevant = logs
    .filter((log) => inRange(log.date, range))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  return relevant.map((log) => {
    const total = log.breakfast + log.lunch + log.dinner + log.snack
    const windowStart = addDaysKey(log.date, -6)
    const window = relevant.filter(
      (item) => item.date >= windowStart && item.date <= log.date,
    )
    const movingAvg = window.length
      ? Math.round(
          window.reduce(
            (sum, item) => sum + item.breakfast + item.lunch + item.dinner + item.snack,
            0,
          ) / window.length,
        )
      : 0
    return {
      date: log.date,
      label: formatShortDate(log.date),
      total,
      movingAvg,
    }
  })
}

export interface HeatmapDay {
  date: string
  count: number
  level: 0 | 1 | 2 | 3
}

/** 近 N 天热力图数据，按周一分组的列 */
export function heatmapWeeks(
  counts: Record<string, number>,
  today: string,
  days = 91,
): Array<Array<HeatmapDay | null>> {
  const rawStart = addDaysKey(today, -(days - 1))
  const start = weekStartKey(rawStart)
  const allDays = eachDayInclusive(start, today)
  const weeks: Array<Array<HeatmapDay | null>> = []
  let current: Array<HeatmapDay | null> = []
  for (const date of allDays) {
    if (weekdayOf(date) === 1 && current.length) {
      while (current.length < 7) current.push(null)
      weeks.push(current)
      current = []
    }
    const count = counts[date] ?? 0
    const level: HeatmapDay['level'] =
      count === 0 ? 0 : count < 5 ? 1 : count < 10 ? 2 : 3
    current.push({ date, count, level })
  }
  if (current.length) {
    while (current.length < 7) current.push(null)
    weeks.push(current)
  }
  return weeks
}
