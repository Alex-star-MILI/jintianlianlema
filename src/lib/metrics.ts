import type { SetEntry } from '../db/types'

/** 总容量：仅统计已完成组 */
export function totalVolume(sets: SetEntry[]): number {
  return sets
    .filter((s) => s.completed)
    .reduce((sum, s) => sum + (s.weightKg || 0) * (s.reps || 0), 0)
}

export function completedSetCount(sets: SetEntry[]): number {
  return sets.filter((s) => s.completed).length
}

export function roundVolume(value: number): number {
  return Math.round(value)
}

/** Epley 公式估算 1RM，保留 1 位小数 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (!weightKg || !reps) return 0
  const value = weightKg * (1 + reps / 30)
  return Math.round(value * 10) / 10
}

/** 某组是否为该动作当前历史最大重量 */
export function isHeaviestOf(sets: SetEntry[], target: SetEntry): boolean {
  const completed = sets.filter((s) => s.completed)
  if (!completed.length) return false
  const max = Math.max(...completed.map((s) => s.weightKg))
  return target.completed && target.weightKg === max
}

export function formatWeight(kg: number): string {
  const rounded = Math.round(kg * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
