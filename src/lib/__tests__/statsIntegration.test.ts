import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '../../db/schema'
import { saveTemplateBundle } from '../../db/repo/templates'
import {
  completeSession,
  getSessionBundle,
  listCompletedSessions,
  startSessionFromTemplate,
  updateSet,
} from '../../db/repo/sessions'
import {
  categoryDistribution,
  countSetsByDate,
  exercisePR,
  resolveRange,
  strengthSeries,
  volumeSeries,
  weeklyTrainingCounts,
} from '../stats'
import { addDaysKey, todayKey } from '../date'

let templateId = ''

beforeEach(async () => {
  await resetDatabase()
  templateId = await saveTemplateBundle(null, {
    name: '推拉测试',
    note: '',
    items: [
      { exerciseId: 'ex-bench-press', targetSets: 3, targetReps: 8, targetWeight: null },
      { exerciseId: 'ex-squat', targetSets: 3, targetReps: 5, targetWeight: null },
    ],
  })
})

async function fillSession(
  date: string,
  plan: Array<{ blockIndex: number; setIndex: number; weightKg: number; reps: number; completed: boolean }>,
) {
  const sessionId = await startSessionFromTemplate(templateId, date)
  const bundle = (await getSessionBundle(sessionId))!
  for (const row of plan) {
    const block = bundle.exercises[row.blockIndex]
    const set = bundle.sets
      .filter((entry) => entry.sessionExerciseId === block.id)
      .sort((a, b) => a.setIndex - b.setIndex)[row.setIndex - 1]
    await updateSet(set.id, {
      weightKg: row.weightKg,
      reps: row.reps,
      completed: row.completed,
    })
  }
  return sessionId
}

describe('统计与真实训练数据一致', () => {
  it('容量、次数、力量、PR、1RM 与部位占比均按已完成组计算', async () => {
    const today = todayKey()
    const older = addDaysKey(today, -10)

    const todaySession = await fillSession(today, [
      { blockIndex: 0, setIndex: 1, weightKg: 60, reps: 8, completed: true },
      { blockIndex: 0, setIndex: 2, weightKg: 60, reps: 8, completed: true },
      { blockIndex: 0, setIndex: 3, weightKg: 80, reps: 5, completed: true },
      { blockIndex: 1, setIndex: 1, weightKg: 100, reps: 5, completed: true },
      { blockIndex: 1, setIndex: 2, weightKg: 100, reps: 5, completed: false },
    ])
    await completeSession(todaySession)

    const olderSession = await fillSession(older, [
      { blockIndex: 0, setIndex: 1, weightKg: 50, reps: 10, completed: true },
      { blockIndex: 0, setIndex: 2, weightKg: 50, reps: 10, completed: false },
      { blockIndex: 1, setIndex: 1, weightKg: 90, reps: 5, completed: true },
    ])
    await completeSession(olderSession)

    const sessions = await listCompletedSessions()
    expect(sessions).toHaveLength(2)
    const todayRow = sessions.find((session) => session.id === todaySession)!
    expect(todayRow.totalVolume).toBe(1860)
    expect(todayRow.totalSets).toBe(4)

    const bundle = (await getSessionBundle(todaySession))!
    expect(bundle.exercises).toHaveLength(2)
    const blocks = await db.sessionExercises.toArray()
    const sets = await db.setEntries.toArray()

    const range = resolveRange('all', today)
    const volume = volumeSeries(sessions, range, 'volume', 'session')
    expect(volume.reduce((sum, point) => sum + point.value, 0)).toBe(2810)

    const weekCounts = weeklyTrainingCounts(sessions, range)
    expect(weekCounts.reduce((sum, point) => sum + point.count, 0)).toBe(2)

    const bench = strengthSeries(sessions, blocks, sets, 'ex-bench-press', range)
    expect(bench).toHaveLength(2)
    expect(bench[1]).toMatchObject({ maxWeight: 80, oneRepMax: 93.3 })

    const pr = exercisePR(sessions, blocks, sets, 'ex-bench-press')
    expect(pr.pr).toBe(80)
    expect(pr.bestOneRepMax).toBe(93.3)

    const distribution = categoryDistribution(sessions, blocks, sets, today, 30)
    expect(distribution.totalSets).toBe(6)
    const chest = distribution.slices.find((slice) => slice.category === '胸')
    const legs = distribution.slices.find((slice) => slice.category === '腿')
    expect(chest?.sets).toBe(4)
    expect(legs?.sets).toBe(2)
    expect((chest?.percent ?? 0) + (legs?.percent ?? 0)).toBe(100)

    expect(countSetsByDate(sessions, blocks, sets)[today]).toBe(4)
  })

  it('草稿不计入统计与本周次数', async () => {
    const today = todayKey()
    const draftId = await fillSession(today, [
      { blockIndex: 0, setIndex: 1, weightKg: 60, reps: 8, completed: true },
    ])

    const sessions = await listCompletedSessions()
    expect(sessions).toHaveLength(0)
    expect(sessions.find((session) => session.id === draftId)).toBeUndefined()

    const range = resolveRange('all', today)
    expect(volumeSeries(sessions, range, 'volume', 'session')).toHaveLength(0)
    expect(weeklyTrainingCounts(sessions, range).every((point) => point.count === 0)).toBe(true)

    const bundle = (await getSessionBundle(draftId))!
    expect(countSetsByDate(sessions, bundle.exercises, bundle.sets)).toEqual({})
    const allBlocks = await db.sessionExercises.toArray()
    const allSets = await db.setEntries.toArray()
    expect(countSetsByDate(sessions, allBlocks, allSets)).toEqual({})
  })
})
