import Dexie, { type Table } from 'dexie'
import { createBuiltinExercises } from './seed'
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

export const DB_NAME = 'jintianlianlema'
export const SCHEMA_VERSION = 1

export class FitDB extends Dexie {
  exercises!: Table<Exercise, string>
  templates!: Table<Template, string>
  templateExercises!: Table<TemplateExercise, string>
  planAssignments!: Table<PlanAssignment, number>
  sessions!: Table<TrainingSession, string>
  sessionExercises!: Table<SessionExercise, string>
  setEntries!: Table<SetEntry, string>
  bodyWeights!: Table<BodyWeight, string>
  calorieLogs!: Table<CalorieLog, string>
  goals!: Table<Goals, string>
  strengthGoals!: Table<StrengthGoal, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super(DB_NAME)
    this.version(SCHEMA_VERSION).stores({
      exercises: 'id, name, category, isBuiltin',
      templates: 'id, sortOrder',
      templateExercises: 'id, templateId, exerciseId',
      planAssignments: 'weekday',
      sessions: 'id, date, status, templateId',
      sessionExercises: 'id, sessionId, exerciseId',
      setEntries: 'id, sessionExerciseId, setIndex',
      bodyWeights: 'id, &date',
      calorieLogs: 'id, &date',
      goals: 'id',
      strengthGoals: 'id, exerciseId',
      settings: 'id',
    })

    this.on('populate', (tx) => {
      tx.table('exercises').bulkAdd(createBuiltinExercises())
      tx.table('settings').add({
        id: 'settings',
        unit: 'kg',
        onboardingDone: false,
        lastBackupAt: null,
      } satisfies AppSettings)
      tx.table('goals').add({
        id: 'goals',
        weeklySessionTarget: 4,
        weightTargetKg: null,
      } satisfies Goals)
      for (let weekday = 1; weekday <= 7; weekday += 1) {
        tx.table('planAssignments').add({ weekday, templateId: null } satisfies PlanAssignment)
      }
    })
  }
}

export const db = new FitDB()

/** 保留单例行：导入或清空后确保基础配置存在 */
export async function ensureSingletons(): Promise<void> {
  const settings = await db.settings.get('settings')
  if (!settings) {
    await db.settings.put({
      id: 'settings',
      unit: 'kg',
      onboardingDone: false,
      lastBackupAt: null,
    })
  }
  const goals = await db.goals.get('goals')
  if (!goals) {
    await db.goals.put({ id: 'goals', weeklySessionTarget: 4, weightTargetKg: null })
  }
  const assignments = await db.planAssignments.toArray()
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    if (!assignments.some((a) => a.weekday === weekday)) {
      await db.planAssignments.put({ weekday, templateId: null })
    }
  }
}

/** 清空全部业务数据（保留 UI 偏好），用于「清空所有数据」 */
export async function resetDatabase(): Promise<void> {
  await db.delete()
  await db.open()
}
