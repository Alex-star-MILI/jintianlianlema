import { describe, expect, it } from 'vitest'
import { completedSetCount, estimateOneRepMax, isHeaviestOf, totalVolume } from '../metrics'
import type { SetEntry } from '../../db/types'

function set(id: string, weightKg: number, reps: number, completed = true): SetEntry {
  return { id, sessionExerciseId: 'se', setIndex: 1, weightKg, reps, completed }
}

describe('训练指标', () => {
  it('总容量只统计已完成组', () => {
    const sets = [set('a', 60, 8), set('b', 60, 8), set('c', 100, 5, false)]
    expect(totalVolume(sets)).toBe(960)
    expect(completedSetCount(sets)).toBe(2)
  })

  it('Epley 1RM 计算并保留一位小数', () => {
    expect(estimateOneRepMax(100, 5)).toBe(116.7)
    expect(estimateOneRepMax(60, 10)).toBe(80)
    expect(estimateOneRepMax(0, 10)).toBe(0)
  })

  it('识别当前历史最重单组', () => {
    const sets = [set('a', 60, 8), set('b', 80, 5), set('c', 80, 3)]
    expect(isHeaviestOf(sets, sets[1])).toBe(true)
    expect(isHeaviestOf(sets, sets[0])).toBe(false)
  })
})
