import { db } from '../schema'
import { uid } from '../../lib/ids'
import type { Exercise, ExerciseCategory, SessionExercise } from '../types'

export async function listExercises(includeHidden = true): Promise<Exercise[]> {
  const all = await db.exercises.orderBy('name').toArray()
  return includeHidden ? all : all.filter((e) => !e.hidden)
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id)
}

export async function createExercise(
  name: string,
  category: ExerciseCategory,
): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('动作名称不能为空')
  const id = uid()
  await db.exercises.add({
    id,
    name: trimmed,
    category,
    isBuiltin: false,
    hidden: false,
    createdAt: new Date().toISOString(),
  })
  return id
}

export async function updateExercise(
  id: string,
  patch: Partial<Pick<Exercise, 'name' | 'category' | 'hidden'>>,
): Promise<void> {
  const next = { ...patch }
  if (next.name !== undefined) {
    const trimmed = next.name.trim()
    if (!trimmed) throw new Error('动作名称不能为空')
    next.name = trimmed
  }
  const snapshotPatch: Partial<
    Pick<SessionExercise, 'exerciseNameSnapshot' | 'categorySnapshot'>
  > = {}
  if (next.name !== undefined) snapshotPatch.exerciseNameSnapshot = next.name
  if (next.category !== undefined) snapshotPatch.categorySnapshot = next.category
  await db.transaction('rw', [db.exercises, db.sessionExercises], async () => {
    await db.exercises.update(id, next)
    if (Object.keys(snapshotPatch).length) {
      await db.sessionExercises.where('exerciseId').equals(id).modify(snapshotPatch)
    }
  })
}
