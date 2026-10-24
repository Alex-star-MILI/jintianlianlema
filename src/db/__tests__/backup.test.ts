import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '../schema'
import { saveTemplateBundle } from '../repo/templates'
import { completeSession, startSessionFromTemplate, getSessionBundle, updateSet } from '../repo/sessions'
import {
  APP_ID,
  exportBackup,
  importBackup,
  summarizeBackup,
  validateBackup,
} from '../backup'
import { upsertBodyWeight, upsertCalorieLog } from '../repo/health'

beforeEach(async () => {
  await resetDatabase()
})

async function seedOneSession() {
  const templateId = await saveTemplateBundle(null, {
    name: '推',
    note: '',
    items: [{ exerciseId: 'ex-bench-press', targetSets: 2, targetReps: 8, targetWeight: null }],
  })
  const sessionId = await startSessionFromTemplate(templateId, '2026-10-24')
  const bundle = (await getSessionBundle(sessionId))!
  await updateSet(bundle.sets[0].id, { weightKg: 70, reps: 8, completed: true })
  await completeSession(sessionId)
  return { templateId, sessionId }
}

describe('备份导出与校验', () => {
  it('导出包含全部业务表与元信息', async () => {
    await seedOneSession()
    await upsertBodyWeight('2026-10-24', 72.5)
    await upsertCalorieLog('2026-10-24', { breakfast: 400, lunch: 700, dinner: 600, snack: 100 })

    const file = await exportBackup()
    expect(file.app).toBe(APP_ID)
    expect(file.schemaVersion).toBe(1)
    expect(file.data.sessions.length).toBe(1)
    expect(file.data.setEntries.some((s) => s.weightKg === 70)).toBe(true)
    expect(file.data.bodyWeights.length).toBe(1)
    expect(file.data.calorieLogs[0].breakfast).toBe(400)
    expect(file.data.settings[0].lastBackupAt).toBe(file.exportedAt)

    const summary = summarizeBackup(file)
    expect(summary.sessions).toBe(1)
    expect(summary.templates).toBe(1)
  })

  it('拒绝非本应用、版本过高与缺表的文件', () => {
    expect(validateBackup(null).ok).toBe(false)
    expect(validateBackup({ app: 'other', schemaVersion: 1, data: {} }).ok).toBe(false)
    const missing = validateBackup({ app: APP_ID, schemaVersion: 1, data: {} })
    expect(missing.ok).toBe(false)

    const tooNew = validateBackup({
      app: APP_ID,
      schemaVersion: 99,
      appVersion: '9',
      exportedAt: new Date().toISOString(),
      data: {},
    })
    expect(tooNew.ok).toBe(false)
    if (!tooNew.ok) expect(tooNew.error).toContain('更高版本')
  })
})

describe('备份导入', () => {
  it('导出后清空再导入，数据完全一致', async () => {
    await seedOneSession()
    await upsertBodyWeight('2026-10-24', 72.5)
    await upsertCalorieLog('2026-10-24', { breakfast: 400, lunch: 700, dinner: 600, snack: 100 })
    const file = await exportBackup()

    await resetDatabase()
    expect(await db.sessions.count()).toBe(0)

    const parsed = JSON.parse(JSON.stringify(file))
    const checked = validateBackup(parsed)
    expect(checked.ok).toBe(true)
    if (checked.ok) await importBackup(checked.file)

    expect(await db.sessions.count()).toBe(1)
    expect(await db.templates.count()).toBe(1)
    expect(await db.setEntries.count()).toBe(2)
    expect((await db.bodyWeights.toArray())[0].weightKg).toBe(72.5)
    expect((await db.calorieLogs.toArray())[0].lunch).toBe(700)
    expect(await db.exercises.count()).toBe(file.data.exercises.length)
    expect(await db.planAssignments.count()).toBe(7)
  })

  it('导入中途失败会整体回滚，原数据不变', async () => {
    await seedOneSession()
    const file = await exportBackup()
    const before = await db.sessions.count()

    const broken = JSON.parse(JSON.stringify(file)) as typeof file
    // 缺少主键 id，写入会失败
    broken.data.setEntries = [{ sessionExerciseId: 'x', setIndex: 1, weightKg: 1, reps: 1 } as never]

    await expect(importBackup(broken)).rejects.toBeTruthy()
    expect(await db.sessions.count()).toBe(before)
    expect(await db.setEntries.count()).toBe(2)
  })
})
