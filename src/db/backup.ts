import { SCHEMA_VERSION, db, ensureSingletons } from './schema'
import { updateSettings } from './repo/health'
import type {
  AppSettings,
  BodyWeight,
  CalorieLog,
  Exercise,
  Goals,
  PlanAssignment,
  SessionExercise,
  SetEntry,
  StrengthGoal,
  Template,
  TemplateExercise,
  TrainingSession,
} from './types'

export const APP_ID = 'jintianlianlema'
export const APP_VERSION = '1.0.0'

export interface BackupData {
  exercises: Exercise[]
  templates: Template[]
  templateExercises: TemplateExercise[]
  planAssignments: PlanAssignment[]
  sessions: TrainingSession[]
  sessionExercises: SessionExercise[]
  setEntries: SetEntry[]
  bodyWeights: BodyWeight[]
  calorieLogs: CalorieLog[]
  goals: Goals[]
  strengthGoals: StrengthGoal[]
  settings: AppSettings[]
}

export interface BackupFile {
  app: string
  schemaVersion: number
  appVersion: string
  exportedAt: string
  data: BackupData
}

export const BACKUP_TABLES = Object.keys({
  exercises: 1,
  templates: 1,
  templateExercises: 1,
  planAssignments: 1,
  sessions: 1,
  sessionExercises: 1,
  setEntries: 1,
  bodyWeights: 1,
  calorieLogs: 1,
  goals: 1,
  strengthGoals: 1,
  settings: 1,
} as const) as Array<keyof BackupData>

export async function exportBackup(): Promise<BackupFile> {
  const exportedAt = new Date().toISOString()
  await updateSettings({ lastBackupAt: exportedAt })
  const data: BackupData = {
    exercises: await db.exercises.toArray(),
    templates: await db.templates.toArray(),
    templateExercises: await db.templateExercises.toArray(),
    planAssignments: await db.planAssignments.toArray(),
    sessions: await db.sessions.toArray(),
    sessionExercises: await db.sessionExercises.toArray(),
    setEntries: await db.setEntries.toArray(),
    bodyWeights: await db.bodyWeights.toArray(),
    calorieLogs: await db.calorieLogs.toArray(),
    goals: await db.goals.toArray(),
    strengthGoals: await db.strengthGoals.toArray(),
    settings: await db.settings.toArray(),
  }
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt,
    data,
  }
}

export type ValidationResult =
  | { ok: true; file: BackupFile }
  | { ok: false; error: string }

export function validateBackup(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '文件内容不是有效的 JSON 对象' }
  }
  const file = raw as Partial<BackupFile>
  if (file.app !== APP_ID) {
    return { ok: false, error: '这不是「今天练了吗」的备份文件' }
  }
  if (typeof file.schemaVersion !== 'number') {
    return { ok: false, error: '备份文件缺少版本信息' }
  }
  if (file.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: '备份文件来自更高版本，当前版本无法导入' }
  }
  if (!file.data || typeof file.data !== 'object') {
    return { ok: false, error: '备份文件缺少数据内容' }
  }
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray((file.data as unknown as Record<string, unknown>)[table])) {
      return { ok: false, error: `备份文件缺少数据表：${table}` }
    }
  }
  return { ok: true, file: file as BackupFile }
}

export interface BackupSummary {
  sessions: number
  templates: number
  bodyWeights: number
  calorieLogs: number
  exportedAt: string
}

export function summarizeBackup(file: BackupFile): BackupSummary {
  return {
    sessions: file.data.sessions.length,
    templates: file.data.templates.length,
    bodyWeights: file.data.bodyWeights.length,
    calorieLogs: file.data.calorieLogs.length,
    exportedAt: file.exportedAt,
  }
}

/** 全量覆盖导入：单事务，失败自动回滚 */
export async function importBackup(file: BackupFile): Promise<void> {
  if (!validateBackup(file).ok) throw new Error('备份文件校验失败')
  await db.transaction('rw', BACKUP_TABLES.map((name) => db.table(name)), async () => {
    for (const name of BACKUP_TABLES) {
      await db.table(name).clear()
    }
    for (const name of BACKUP_TABLES) {
      const rows = file.data[name] as unknown[]
      if (rows.length) {
        await db.table(name).bulkAdd(rows)
      }
    }
  })
  await ensureSingletons()
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `jintianlianlema-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}-${pad(date.getHours())}${pad(date.getMinutes())}.json`
}

export function downloadBackup(file: BackupFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backupFileName()
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
