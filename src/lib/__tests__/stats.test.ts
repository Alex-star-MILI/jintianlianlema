import { describe, expect, it } from 'vitest'
import type {
  BodyWeight,
  CalorieLog,
  SessionExercise,
  SetEntry,
  TrainingSession,
} from '../../db/types'
import {
  ALL_START,
  calorieSeries,
  categoryDistribution,
  countSetsByDate,
  exercisePR,
  heatmapWeeks,
  resolveRange,
  strengthSeries,
  volumeSeries,
  weeklyTrainingCounts,
  weightSeries,
} from '../stats'

function session(
  id: string,
  date: string,
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    id,
    date,
    templateId: null,
    templateNameSnapshot: '推',
    startedAt: `${date}T10:00:00.000Z`,
    endedAt: `${date}T11:00:00.000Z`,
    durationSec: 3600,
    status: 'completed',
    note: '',
    totalSets: 3,
    totalVolume: 300,
    ...overrides,
  }
}

function block(
  id: string,
  sessionId: string,
  exerciseId: string,
  category: SessionExercise['categorySnapshot'] = '胸',
  name = '卧推',
): SessionExercise {
  return {
    id,
    sessionId,
    exerciseId,
    exerciseNameSnapshot: name,
    categorySnapshot: category,
    sortOrder: 0,
    skipped: false,
  }
}

function setEntry(
  id: string,
  blockId: string,
  weightKg: number,
  reps: number,
  completed = true,
  setIndex = 1,
): SetEntry {
  return { id, sessionExerciseId: blockId, setIndex, weightKg, reps, completed }
}

describe('统计时间范围', () => {
  it('按周一为起点解析本周与本月', () => {
    expect(resolveRange('week', '2026-10-24')).toEqual({
      start: '2026-10-19',
      end: '2026-10-25',
    })
    expect(resolveRange('month', '2026-10-24')).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
    })
    expect(resolveRange('quarter', '2026-10-24')).toEqual({
      start: '2026-07-24',
      end: '2026-10-24',
    })
    expect(resolveRange('all', '2026-10-24')).toEqual({
      start: ALL_START,
      end: '2026-10-24',
    })
  })
})

describe('训练频率', () => {
  it('每周只统计已完成训练，跨越周日与周一的记录不串周', () => {
    const sessions = [
      session('s1', '2026-10-19'),
      session('s2', '2026-10-25'),
      session('s3', '2026-10-26'),
      session('s4', '2026-10-28', { status: 'draft' }),
    ]
    const weeks = weeklyTrainingCounts(sessions, { start: '2026-10-19', end: '2026-10-30' })
    expect(weeks.map((week) => [week.weekStart, week.count])).toEqual([
      ['2026-10-19', 2],
      ['2026-10-26', 1],
    ])
  })

  it('按日期统计已完成组数，用于热力图', () => {
    const sessions = [session('s1', '2026-10-20'), session('s2', '2026-10-21')]
    const blocks = [block('b1', 's1', 'ex-bench'), block('b2', 's2', 'ex-row', '背')]
    const sets = [
      setEntry('a', 'b1', 60, 8),
      setEntry('b', 'b1', 60, 8),
      setEntry('c', 'b2', 40, 10),
      setEntry('d', 'b2', 40, 10, false),
    ]
    expect(countSetsByDate(sessions, blocks, sets)).toEqual({
      '2026-10-20': 2,
      '2026-10-21': 1,
    })
    const weeks = heatmapWeeks({ '2026-10-18': 3 }, '2026-10-18', 7)
    expect(weeks.flat().filter(Boolean)).toHaveLength(7)
  })
})

describe('容量趋势', () => {
  it('按次按日期合并，按周按周一分组合并', () => {
    const sessions = [
      session('s1', '2026-10-20', { totalVolume: 100, totalSets: 2 }),
      session('s2', '2026-10-20', { totalVolume: 50, totalSets: 1 }),
      session('s3', '2026-10-21', { totalVolume: 200, totalSets: 3 }),
    ]
    const range = { start: '2026-10-19', end: '2026-10-25' }
    expect(volumeSeries(sessions, range, 'volume', 'session').map((p) => p.value)).toEqual([
      150, 200,
    ])
    expect(volumeSeries(sessions, range, 'sets', 'session').map((p) => p.value)).toEqual([3, 3])
    expect(volumeSeries(sessions, range, 'volume', 'week').map((p) => p.value)).toEqual([350])
  })
})

describe('动作力量', () => {
  it('每个训练日取最大重量与最大估算 1RM，PR 取历史最大单组', () => {
    const sessions = [session('s1', '2026-10-20'), session('s2', '2026-10-22')]
    const blocks = [block('b1', 's1', 'ex-bench'), block('b2', 's2', 'ex-bench')]
    const sets = [
      setEntry('a', 'b1', 100, 5),
      setEntry('b', 'b1', 90, 10),
      setEntry('c', 'b2', 105, 3),
    ]
    const range = { start: '2026-10-01', end: '2026-10-31' }
    const points = strengthSeries(sessions, blocks, sets, 'ex-bench', range)
    expect(points).toHaveLength(2)
    expect(points[0].maxWeight).toBe(100)
    expect(points[0].oneRepMax).toBeCloseTo(120, 1)
    expect(points[1].maxWeight).toBe(105)
    expect(exercisePR(sessions, blocks, sets, 'ex-bench').pr).toBe(105)
  })
})

describe('部位均衡', () => {
  it('只统计窗口内已完成组，百分比合计 100，并提示长期未练部位', () => {
    const sessions = [
      session('s1', '2026-10-20'),
      session('s2', '2026-10-23'),
      session('s3', '2026-09-14'),
    ]
    const blocks = [
      block('b1', 's1', 'ex-bench', '胸'),
      block('b2', 's2', 'ex-row', '背'),
      block('b3', 's3', 'ex-squat', '腿', '深蹲'),
    ]
    const sets = [
      setEntry('a', 'b1', 60, 8),
      setEntry('b', 'b1', 60, 8),
      setEntry('c', 'b1', 60, 8),
      setEntry('d', 'b2', 40, 10),
      setEntry('e', 'b3', 80, 5),
    ]
    const result = categoryDistribution(sessions, blocks, sets, '2026-10-24', 30)
    expect(result.totalSets).toBe(4)
    expect(result.slices[0]).toEqual({ category: '胸', sets: 3, percent: 75 })
    expect(result.slices[1]).toEqual({ category: '背', sets: 1, percent: 25 })
    expect(result.stale).toEqual([{ category: '腿', days: 40 }])
  })
})

describe('体重与热量', () => {
  it('体重按范围过滤并按日期排序', () => {
    const weights: BodyWeight[] = [
      { id: 'w1', date: '2026-10-20', weightKg: 70, createdAt: '' },
      { id: 'w2', date: '2026-10-22', weightKg: 69.5, createdAt: '' },
      { id: 'w3', date: '2026-09-01', weightKg: 72, createdAt: '' },
    ]
    expect(weightSeries(weights, { start: '2026-10-01', end: '2026-10-31' })).toEqual([
      { date: '2026-10-20', label: '10/20', weight: 70 },
      { date: '2026-10-22', label: '10/22', weight: 69.5 },
    ])
  })

  it('热量合计四餐并计算 7 日移动平均', () => {
    const logs: CalorieLog[] = [
      { id: 'c1', date: '2026-10-01', breakfast: 300, lunch: 400, dinner: 300, snack: 0, updatedAt: '' },
      { id: 'c2', date: '2026-10-02', breakfast: 500, lunch: 500, dinner: 500, snack: 500, updatedAt: '' },
      { id: 'c3', date: '2026-10-03', breakfast: 600, lunch: 600, dinner: 600, snack: 600, updatedAt: '' },
    ]
    const points = calorieSeries(logs, { start: '2026-10-01', end: '2026-10-31' })
    expect(points.map((point) => point.total)).toEqual([1000, 2000, 2400])
    expect(points.map((point) => point.movingAvg)).toEqual([1000, 1500, 1800])
  })

  it('空数据返回空序列', () => {
    expect(strengthSeries([], [], [], 'ex', { start: ALL_START, end: '2026-10-24' })).toEqual([])
    expect(weightSeries([], { start: ALL_START, end: '2026-10-24' })).toEqual([])
    expect(calorieSeries([], { start: ALL_START, end: '2026-10-24' })).toEqual([])
    expect(
      categoryDistribution([], [], [], '2026-10-24', 30),
    ).toEqual({ slices: [], stale: [], totalSets: 0 })
  })
})
