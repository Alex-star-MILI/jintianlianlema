export const CATEGORIES = ['胸', '背', '腿', '肩', '手臂', '核心', '其他'] as const
export type ExerciseCategory = (typeof CATEGORIES)[number]

export type Unit = 'kg' | 'lb'

export interface Exercise {
  id: string
  name: string
  category: ExerciseCategory
  isBuiltin: boolean
  hidden: boolean
  createdAt: string
}

export interface Template {
  id: string
  name: string
  note: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface TemplateExercise {
  id: string
  templateId: string
  exerciseId: string
  sortOrder: number
  targetSets: number
  targetReps: number
  targetWeight: number | null
}

/** 周映射：weekday 1=周一 … 7=周日；templateId 为 null 表示休息 */
export interface PlanAssignment {
  weekday: number
  templateId: string | null
}

export type SessionStatus = 'draft' | 'completed'

export interface TrainingSession {
  id: string
  date: string // YYYY-MM-DD（本地日期）
  templateId: string | null
  templateNameSnapshot: string
  startedAt: string // ISO
  endedAt: string | null
  durationSec: number | null
  status: SessionStatus
  note: string
  totalSets: number
  totalVolume: number
}

export interface SessionExercise {
  id: string
  sessionId: string
  exerciseId: string
  exerciseNameSnapshot: string
  categorySnapshot: ExerciseCategory
  sortOrder: number
  skipped: boolean
}

export interface SetEntry {
  id: string
  sessionExerciseId: string
  setIndex: number
  weightKg: number
  reps: number
  completed: boolean
}

export interface BodyWeight {
  id: string
  date: string
  weightKg: number
  createdAt: string
}

export interface CalorieLog {
  id: string
  date: string
  breakfast: number
  lunch: number
  dinner: number
  snack: number
  updatedAt: string
}

export interface Goals {
  id: string
  weeklySessionTarget: number
  weightTargetKg: number | null
}

export interface StrengthGoal {
  id: string
  exerciseId: string
  targetWeightKg: number
}

export interface AppSettings {
  id: string
  unit: Unit
  onboardingDone: boolean
  lastBackupAt: string | null
}

export interface SessionBundle {
  session: TrainingSession
  exercises: SessionExercise[]
  sets: SetEntry[]
}
