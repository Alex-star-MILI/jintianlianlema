import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '../schema'
import { createExercise, updateExercise } from '../repo/exercises'
import { saveTemplateBundle } from '../repo/templates'
import { getSessionBundle, startSessionFromTemplate } from '../repo/sessions'
import { todayKey } from '../../lib/date'

beforeEach(async () => {
  await resetDatabase()
})

async function makeHistory() {
  const exerciseId = await createExercise('我的划船', '背')
  const templateId = await saveTemplateBundle(null, {
    name: '测试模板',
    note: '',
    items: [{ exerciseId, targetSets: 1, targetReps: 8, targetWeight: null }],
  })
  const sessionId = await startSessionFromTemplate(templateId, todayKey())
  const bundle = (await getSessionBundle(sessionId))!
  return { exerciseId, sessionId, block: bundle.exercises[0] }
}

describe('动作重命名', () => {
  it('自定义动作改名后，历史记录中的动作名快照同步更新', async () => {
    const { exerciseId, sessionId } = await makeHistory()

    await updateExercise(exerciseId, { name: '坐姿划船' })

    expect((await db.exercises.get(exerciseId))?.name).toBe('坐姿划船')
    const after = (await getSessionBundle(sessionId))!
    expect(after.exercises[0].exerciseNameSnapshot).toBe('坐姿划船')
  })

  it('同时修改分类时，历史记录中的分类快照同步更新', async () => {
    const { exerciseId, sessionId } = await makeHistory()

    await updateExercise(exerciseId, { name: '坐姿划船', category: '手臂' })

    const after = (await getSessionBundle(sessionId))!
    expect(after.exercises[0].exerciseNameSnapshot).toBe('坐姿划船')
    expect(after.exercises[0].categorySnapshot).toBe('手臂')
  })

  it('只隐藏动作不会改动历史快照', async () => {
    const { exerciseId, sessionId, block } = await makeHistory()

    await updateExercise(exerciseId, { hidden: true })

    const after = (await getSessionBundle(sessionId))!
    expect(after.exercises[0].exerciseNameSnapshot).toBe(block.exerciseNameSnapshot)
    expect(after.exercises[0].categorySnapshot).toBe(block.categorySnapshot)
  })
})
