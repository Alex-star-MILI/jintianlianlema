import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '../schema'
import { createBuiltinExercises } from '../seed'
import {
  addExerciseToSession,
  addSet,
  completeSession,
  countCompletedSessionsBetween,
  deleteSession,
  deleteSet,
  getDraftForDate,
  getLastCompletedSets,
  getSessionBundle,
  startSessionFromTemplate,
  updateSet,
} from '../repo/sessions'
import { saveTemplateBundle, deleteTemplate } from '../repo/templates'
import { getAssignmentMap, setWeekdayTemplate } from '../repo/plan'
import { listExercises } from '../repo/exercises'
import { weekEndKey, weekStartKey } from '../../lib/date'

beforeEach(async () => {
  await resetDatabase()
})

describe('数据层初始化', () => {
  it('首次建库写入内置动作、设置、目标与七天映射', async () => {
    const exercises = await db.exercises.toArray()
    expect(exercises.length).toBe(createBuiltinExercises().length)
    expect(exercises.every((e) => e.isBuiltin && !e.hidden)).toBe(true)
    expect(exercises.some((e) => e.id === 'ex-bench-press')).toBe(true)

    const settings = await db.settings.get('settings')
    expect(settings?.unit).toBe('kg')
    expect(settings?.onboardingDone).toBe(false)
    expect(settings?.lastBackupAt).toBeNull()

    const goals = await db.goals.get('goals')
    expect(goals?.weeklySessionTarget).toBe(4)

    expect(await db.planAssignments.count()).toBe(7)
  })

  it('隐藏动作不出现在未隐藏列表中', async () => {
    await db.exercises.update('ex-squat', { hidden: true })
    const visible = await listExercises(false)
    expect(visible.some((e) => e.id === 'ex-squat')).toBe(false)
    expect(visible.length).toBe(createBuiltinExercises().length - 1)
  })
})

describe('模板与周映射', () => {
  it('保存模板并按顺序写入动作', async () => {
    const id = await saveTemplateBundle(null, {
      name: '推',
      note: '',
      items: [
        { exerciseId: 'ex-bench-press', targetSets: 4, targetReps: 8, targetWeight: null },
        { exerciseId: 'ex-lateral-raise', targetSets: 3, targetReps: 15, targetWeight: 5 },
      ],
    })
    const items = await db.templateExercises.where('templateId').equals(id).toArray()
    items.sort((a, b) => a.sortOrder - b.sortOrder)
    expect(items.map((i) => i.exerciseId)).toEqual(['ex-bench-press', 'ex-lateral-raise'])
    expect(items[1].targetWeight).toBe(5)
  })

  it('空动作模板不允许保存', async () => {
    await expect(
      saveTemplateBundle(null, { name: '空', note: '', items: [] }),
    ).rejects.toThrow('模板至少需要一个动作')
  })

  it('设置周映射并读取', async () => {
    const id = await saveTemplateBundle(null, {
      name: '腿',
      note: '',
      items: [{ exerciseId: 'ex-squat', targetSets: 3, targetReps: 6, targetWeight: null }],
    })
    await setWeekdayTemplate(3, id)
    const map = await getAssignmentMap()
    expect(map[3]).toBe(id)
    expect(map[1]).toBeNull()
  })

  it('删除模板后周映射回到休息，历史记录保留', async () => {
    const id = await saveTemplateBundle(null, {
      name: '拉',
      note: '',
      items: [{ exerciseId: 'ex-barbell-row', targetSets: 3, targetReps: 8, targetWeight: null }],
    })
    await setWeekdayTemplate(2, id)
    const sessionId = await startSessionFromTemplate(id, '2026-10-20')
    await completeSession(sessionId)
    await deleteTemplate(id)

    const map = await getAssignmentMap()
    expect(map[2]).toBeNull()
    const session = await db.sessions.get(sessionId)
    expect(session?.templateNameSnapshot).toBe('拉')
    expect(await db.templates.get(id)).toBeUndefined()
  })
})

describe('训练流程', () => {
  async function makeTemplate() {
    return saveTemplateBundle(null, {
      name: '推',
      note: '',
      items: [
        { exerciseId: 'ex-bench-press', targetSets: 3, targetReps: 8, targetWeight: null },
        { exerciseId: 'ex-triceps-pushdown', targetSets: 2, targetReps: 12, targetWeight: null },
      ],
    })
  }

  it('开始训练按模板生成动作与默认组', async () => {
    const templateId = await makeTemplate()
    const sessionId = await startSessionFromTemplate(templateId, '2026-10-24')
    const bundle = await getSessionBundle(sessionId)
    expect(bundle).not.toBeNull()
    expect(bundle!.session.status).toBe('draft')
    expect(bundle!.exercises.length).toBe(2)
    expect(bundle!.sets.length).toBe(5)
    expect(bundle!.sets.every((s) => s.completed === false)).toBe(true)
    const benchSets = bundle!.sets.filter(
      (s) => s.sessionExerciseId === bundle!.exercises[0].id,
    )
    expect(benchSets.length).toBe(3)
    expect(benchSets.every((s) => s.reps === 8)).toBe(true)
    expect((await getDraftForDate('2026-10-24'))?.id).toBe(sessionId)
  })

  it('完成训练后计算组数与容量', async () => {
    const templateId = await makeTemplate()
    const sessionId = await startSessionFromTemplate(templateId, '2026-10-24')
    const bundle = (await getSessionBundle(sessionId))!
    const benchSets = bundle.sets.filter(
      (s) => s.sessionExerciseId === bundle.exercises[0].id,
    )
    await updateSet(benchSets[0].id, { weightKg: 60, reps: 8, completed: true })
    await updateSet(benchSets[1].id, { weightKg: 60, reps: 8, completed: true })
    await completeSession(sessionId)

    const after = (await getSessionBundle(sessionId))!
    expect(after.session.status).toBe('completed')
    expect(after.session.totalSets).toBe(2)
    expect(after.session.totalVolume).toBe(960)
    expect(after.session.endedAt).not.toBeNull()
    expect(after.session.durationSec).not.toBeNull()
  })

  it('下一次训练自动预填上次同组数据', async () => {
    const templateId = await makeTemplate()
    const first = await startSessionFromTemplate(templateId, '2026-10-22')
    const bundle = (await getSessionBundle(first))!
    const benchSets = bundle.sets.filter((s) => s.sessionExerciseId === bundle.exercises[0].id)
    await updateSet(benchSets[0].id, { weightKg: 60, reps: 8, completed: true })
    await updateSet(benchSets[1].id, { weightKg: 65, reps: 6, completed: true })
    await completeSession(first)

    const second = await startSessionFromTemplate(templateId, '2026-10-24')
    const secondBundle = (await getSessionBundle(second))!
    const secondBench = secondBundle.sets.filter(
      (s) => s.sessionExerciseId === secondBundle.exercises[0].id,
    )
    secondBench.sort((a, b) => a.setIndex - b.setIndex)
    expect(secondBench[0].weightKg).toBe(60)
    expect(secondBench[1].weightKg).toBe(65)
    expect(secondBench[2].weightKg).toBe(65)
    expect(secondBench[2].reps).toBe(6)
  })

  it('支持临时加动作、加组与删除组后重新编号', async () => {
    const templateId = await makeTemplate()
    const sessionId = await startSessionFromTemplate(templateId, '2026-10-24')
    const blockId = await addExerciseToSession(sessionId, 'ex-squat', 2)
    let sets = await db.setEntries.where('sessionExerciseId').equals(blockId).toArray()
    expect(sets.length).toBe(2)

    await addSet(blockId)
    sets = await db.setEntries.where('sessionExerciseId').equals(blockId).toArray()
    expect(sets.length).toBe(3)

    sets.sort((a, b) => a.setIndex - b.setIndex)
    await deleteSet(sets[1].id)
    const remaining = await db.setEntries.where('sessionExerciseId').equals(blockId).toArray()
    remaining.sort((a, b) => a.setIndex - b.setIndex)
    expect(remaining.map((s) => s.setIndex)).toEqual([1, 2])
    expect((await db.setEntries.where('sessionExerciseId').equals(blockId).count())).toBe(2)
  })

  it('删除训练同时清理动作与组，不留孤立数据', async () => {
    const templateId = await makeTemplate()
    const sessionId = await startSessionFromTemplate(templateId, '2026-10-24')
    const bundle = (await getSessionBundle(sessionId))!
    const blockIds = bundle.exercises.map((e) => e.id)
    await deleteSession(sessionId)

    expect(await db.sessions.get(sessionId)).toBeUndefined()
    expect(await db.sessionExercises.where('sessionId').equals(sessionId).count()).toBe(0)
    expect(await db.setEntries.where('sessionExerciseId').anyOf(blockIds).count()).toBe(0)
    expect(await getLastCompletedSets('ex-bench-press')).toEqual([])
  })

  it('本周训练次数以周一为界，只统计已完成训练', async () => {
    const templateId = await makeTemplate()

    const sunday = await startSessionFromTemplate(templateId, '2026-10-25')
    await completeSession(sunday)
    const monday = await startSessionFromTemplate(templateId, '2026-10-26')
    await completeSession(monday)
    await startSessionFromTemplate(templateId, '2026-10-27')

    expect(weekStartKey('2026-10-25')).toBe('2026-10-19')
    expect(weekEndKey('2026-10-25')).toBe('2026-10-25')
    expect(
      await countCompletedSessionsBetween(
        weekStartKey('2026-10-25'),
        weekEndKey('2026-10-25'),
      ),
    ).toBe(1)
    expect(
      await countCompletedSessionsBetween(
        weekStartKey('2026-10-26'),
        weekEndKey('2026-10-26'),
      ),
    ).toBe(1)
  })
})
