import { db } from '../schema'
import { uid } from '../../lib/ids'
import type { AppSettings, BodyWeight, CalorieLog, Goals, StrengthGoal } from '../types'

// ---------- 设置 ----------

export async function getSettings(): Promise<AppSettings> {
  const settings = await db.settings.get('settings')
  return (
    settings ?? {
      id: 'settings',
      unit: 'kg',
      onboardingDone: false,
      lastBackupAt: null,
    }
  )
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'settings' })
}

// ---------- 目标 ----------

export async function getGoals(): Promise<Goals> {
  const goals = await db.goals.get('goals')
  return goals ?? { id: 'goals', weeklySessionTarget: 4, weightTargetKg: null }
}

export async function updateGoals(patch: Partial<Goals>): Promise<void> {
  const current = await getGoals()
  await db.goals.put({ ...current, ...patch, id: 'goals' })
}

export async function listStrengthGoals(): Promise<StrengthGoal[]> {
  return db.strengthGoals.toArray()
}

export async function upsertStrengthGoal(exerciseId: string, targetWeightKg: number): Promise<void> {
  const existing = await db.strengthGoals.where('exerciseId').equals(exerciseId).first()
  if (existing) {
    await db.strengthGoals.update(existing.id, { targetWeightKg })
    return
  }
  await db.strengthGoals.add({ id: uid(), exerciseId, targetWeightKg })
}

export async function deleteStrengthGoal(id: string): Promise<void> {
  await db.strengthGoals.delete(id)
}

// ---------- 体重 ----------

export async function listBodyWeights(): Promise<BodyWeight[]> {
  const list = await db.bodyWeights.toArray()
  return list.sort((a, b) => a.date.localeCompare(b.date))
}

export async function upsertBodyWeight(date: string, weightKg: number): Promise<void> {
  const existing = await db.bodyWeights.where('date').equals(date).first()
  if (existing) {
    await db.bodyWeights.update(existing.id, { weightKg, createdAt: new Date().toISOString() })
    return
  }
  await db.bodyWeights.add({
    id: uid(),
    date,
    weightKg,
    createdAt: new Date().toISOString(),
  })
}

export async function deleteBodyWeight(id: string): Promise<void> {
  await db.bodyWeights.delete(id)
}

export async function getLatestBodyWeight(): Promise<BodyWeight | null> {
  const list = await listBodyWeights()
  return list[list.length - 1] ?? null
}

// ---------- 热量 ----------

export async function listCalorieLogs(): Promise<CalorieLog[]> {
  const list = await db.calorieLogs.toArray()
  return list.sort((a, b) => a.date.localeCompare(b.date))
}

export async function getCalorieLog(date: string): Promise<CalorieLog | null> {
  return (await db.calorieLogs.where('date').equals(date).first()) ?? null
}

export async function upsertCalorieLog(
  date: string,
  values: Pick<CalorieLog, 'breakfast' | 'lunch' | 'dinner' | 'snack'>,
): Promise<void> {
  const existing = await db.calorieLogs.where('date').equals(date).first()
  const payload = {
    breakfast: Math.max(0, Math.round(values.breakfast || 0)),
    lunch: Math.max(0, Math.round(values.lunch || 0)),
    dinner: Math.max(0, Math.round(values.dinner || 0)),
    snack: Math.max(0, Math.round(values.snack || 0)),
    updatedAt: new Date().toISOString(),
  }
  if (existing) {
    await db.calorieLogs.update(existing.id, payload)
    return
  }
  await db.calorieLogs.add({ id: uid(), date, ...payload })
}

export function calorieTotal(log: CalorieLog | null): number {
  if (!log) return 0
  return log.breakfast + log.lunch + log.dinner + log.snack
}
