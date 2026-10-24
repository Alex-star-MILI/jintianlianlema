import { db } from '../schema'
import { uid } from '../../lib/ids'
import { totalVolume } from '../../lib/metrics'
import { endOfMonthKey, startOfMonthKey } from '../../lib/date'
import type {
  Exercise,
  SessionBundle,
  SetEntry,
  TrainingSession,
} from '../types'

async function lastSetsFor(exerciseId: string, excludeSessionId?: string): Promise<SetEntry[]> {
  const blocks = await db.sessionExercises.where('exerciseId').equals(exerciseId).toArray()
  if (!blocks.length) return []
  const sessionIds = [...new Set(blocks.map((b) => b.sessionId))]
  const sessions = await db.sessions.bulkGet(sessionIds)
  const valid = sessions.filter(
    (s): s is TrainingSession =>
      !!s && s.status === 'completed' && s.id !== excludeSessionId,
  )
  if (!valid.length) return []
  valid.sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt))
  const target = valid[0]
  const block = blocks.find((b) => b.sessionId === target.id)
  if (!block) return []
  const sets = await db.setEntries.where('sessionExerciseId').equals(block.id).toArray()
  return sets.filter((s) => s.completed).sort((a, b) => a.setIndex - b.setIndex)
}

/** 某动作最近一次已完成训练的组数据（用于预填与参考行） */
export async function getLastCompletedSets(
  exerciseId: string,
  excludeSessionId?: string,
): Promise<SetEntry[]> {
  return lastSetsFor(exerciseId, excludeSessionId)
}

export interface ExerciseHint {
  weightKg: number
  reps: number
  sets: number
}

export async function getExerciseHint(exerciseId: string): Promise<ExerciseHint | null> {
  const sets = await getLastCompletedSets(exerciseId)
  if (!sets.length) return null
  const heaviest = sets.reduce((best, s) => (s.weightKg > best.weightKg ? s : best), sets[0])
  return { weightKg: heaviest.weightKg, reps: heaviest.reps, sets: sets.length }
}

async function addExerciseBlock(
  sessionId: string,
  exercise: Exercise,
  setCount: number,
  sortOrder: number,
  defaults: { reps: number; weightKg: number } = { reps: 10, weightKg: 0 },
): Promise<string> {
  const id = uid()
  await db.sessionExercises.add({
    id,
    sessionId,
    exerciseId: exercise.id,
    exerciseNameSnapshot: exercise.name,
    categorySnapshot: exercise.category,
    sortOrder,
    skipped: false,
  })
  const last = await lastSetsFor(exercise.id, sessionId)
  const count = Math.max(1, Math.min(10, setCount))
  for (let index = 0; index < count; index += 1) {
    const previous = last.find((s) => s.setIndex === index + 1) ?? last[last.length - 1]
    await db.setEntries.add({
      id: uid(),
      sessionExerciseId: id,
      setIndex: index + 1,
      weightKg: previous?.weightKg ?? defaults.weightKg,
      reps: previous?.reps ?? defaults.reps,
      completed: false,
    })
  }
  return id
}

/** 按模板开始一次训练，生成草稿并按历史预填 */
export async function startSessionFromTemplate(
  templateId: string,
  dateKey: string,
): Promise<string> {
  return db.transaction(
    'rw',
    [
      db.templates,
      db.templateExercises,
      db.exercises,
      db.sessions,
      db.sessionExercises,
      db.setEntries,
    ],
    async () => {
      const template = await db.templates.get(templateId)
      if (!template) throw new Error('模板不存在')
      const items = await db.templateExercises
        .where('templateId')
        .equals(templateId)
        .toArray()
      items.sort((a, b) => a.sortOrder - b.sortOrder)
      const sessionId = uid()
      await db.sessions.add({
        id: sessionId,
        date: dateKey,
        templateId,
        templateNameSnapshot: template.name,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationSec: null,
        status: 'draft',
        note: '',
        totalSets: 0,
        totalVolume: 0,
      })
      let order = 0
      for (const item of items) {
        const exercise = await db.exercises.get(item.exerciseId)
        if (!exercise) continue
        await addExerciseBlock(sessionId, exercise, item.targetSets, order, {
          reps: item.targetReps,
          weightKg: item.targetWeight ?? 0,
        })
        order += 1
      }
      return sessionId
    },
  )
}

/** 开始一次自由训练（无模板） */
export async function startEmptySession(
  dateKey: string,
  name = '自由训练',
): Promise<string> {
  const id = uid()
  await db.sessions.add({
    id,
    date: dateKey,
    templateId: null,
    templateNameSnapshot: name,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationSec: null,
    status: 'draft',
    note: '',
    totalSets: 0,
    totalVolume: 0,
  })
  return id
}

export async function getSession(id: string): Promise<TrainingSession | undefined> {
  return db.sessions.get(id)
}

export async function getSessionBundle(id: string): Promise<SessionBundle | null> {
  const session = await db.sessions.get(id)
  if (!session) return null
  const exercises = await db.sessionExercises.where('sessionId').equals(id).toArray()
  exercises.sort((a, b) => a.sortOrder - b.sortOrder)
  const sets = exercises.length
    ? await db.setEntries
        .where('sessionExerciseId')
        .anyOf(exercises.map((e) => e.id))
        .toArray()
    : []
  sets.sort((a, b) => a.setIndex - b.setIndex)
  return { session, exercises, sets }
}

export async function getDraftForDate(dateKey: string): Promise<TrainingSession | null> {
  const list = await db.sessions.where('date').equals(dateKey).toArray()
  return list.find((s) => s.status === 'draft') ?? null
}

export async function listSessionsInMonth(monthKey: string): Promise<TrainingSession[]> {
  const start = startOfMonthKey(`${monthKey}-01`)
  const end = endOfMonthKey(start)
  const list = await db.sessions.where('date').between(start, end, true, true).toArray()
  return list.sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt))
}

export async function listCompletedSessions(): Promise<TrainingSession[]> {
  const list = await db.sessions.where('status').equals('completed').toArray()
  return list.sort((a, b) => (a.date + a.startedAt).localeCompare(b.date + b.startedAt))
}

export async function addExerciseToSession(
  sessionId: string,
  exerciseId: string,
  setCount = 3,
): Promise<string> {
  return db.transaction(
    'rw',
    [db.sessions, db.sessionExercises, db.setEntries, db.exercises],
    async () => {
      const session = await db.sessions.get(sessionId)
      if (!session) throw new Error('训练不存在')
      const exercise = await db.exercises.get(exerciseId)
      if (!exercise) throw new Error('动作不存在')
      const existing = await db.sessionExercises
        .where('sessionId')
        .equals(sessionId)
        .toArray()
      return addExerciseBlock(sessionId, exercise, setCount, existing.length)
    },
  )
}

export async function addSet(sessionExerciseId: string): Promise<void> {
  const sets = await db.setEntries
    .where('sessionExerciseId')
    .equals(sessionExerciseId)
    .toArray()
  sets.sort((a, b) => a.setIndex - b.setIndex)
  const last = sets[sets.length - 1]
  await db.setEntries.add({
    id: uid(),
    sessionExerciseId,
    setIndex: sets.length + 1,
    weightKg: last?.weightKg ?? 0,
    reps: last?.reps ?? 10,
    completed: false,
  })
}

async function renumberSets(sessionExerciseId: string): Promise<void> {
  const sets = await db.setEntries
    .where('sessionExerciseId')
    .equals(sessionExerciseId)
    .toArray()
  sets.sort((a, b) => a.setIndex - b.setIndex)
  for (let index = 0; index < sets.length; index += 1) {
    if (sets[index].setIndex !== index + 1) {
      await db.setEntries.update(sets[index].id, { setIndex: index + 1 })
    }
  }
}

export async function updateSet(
  id: string,
  patch: Partial<Pick<SetEntry, 'weightKg' | 'reps' | 'completed'>>,
): Promise<void> {
  await db.setEntries.update(id, patch)
}

export async function deleteSet(id: string): Promise<void> {
  const entry = await db.setEntries.get(id)
  if (!entry) return
  await db.setEntries.delete(id)
  await renumberSets(entry.sessionExerciseId)
}

export async function setExerciseSkipped(
  sessionExerciseId: string,
  skipped: boolean,
): Promise<void> {
  await db.sessionExercises.update(sessionExerciseId, { skipped })
}

export async function deleteSessionExercise(sessionExerciseId: string): Promise<void> {
  await db.transaction('rw', [db.sessionExercises, db.setEntries], async () => {
    await db.setEntries.where('sessionExerciseId').equals(sessionExerciseId).delete()
    await db.sessionExercises.delete(sessionExerciseId)
  })
}

export async function recalcSessionTotals(sessionId: string): Promise<void> {
  const exercises = await db.sessionExercises
    .where('sessionId')
    .equals(sessionId)
    .toArray()
  const sets = exercises.length
    ? await db.setEntries
        .where('sessionExerciseId')
        .anyOf(exercises.map((e) => e.id))
        .toArray()
    : []
  await db.sessions.update(sessionId, {
    totalSets: sets.filter((s) => s.completed).length,
    totalVolume: Math.round(totalVolume(sets)),
  })
}

export async function completeSession(sessionId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.sessionExercises, db.setEntries],
    async () => {
      const session = await db.sessions.get(sessionId)
      if (!session) throw new Error('训练不存在')
      const exercises = await db.sessionExercises
        .where('sessionId')
        .equals(sessionId)
        .toArray()
      const sets = exercises.length
        ? await db.setEntries
            .where('sessionExerciseId')
            .anyOf(exercises.map((e) => e.id))
            .toArray()
        : []
      const endedAt = new Date().toISOString()
      const durationSec = Math.max(
        0,
        Math.round((Date.parse(endedAt) - Date.parse(session.startedAt)) / 1000),
      )
      await db.sessions.update(sessionId, {
        status: 'completed',
        endedAt,
        durationSec,
        totalSets: sets.filter((s) => s.completed).length,
        totalVolume: Math.round(totalVolume(sets)),
      })
    },
  )
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.sessionExercises, db.setEntries],
    async () => {
      const exercises = await db.sessionExercises
        .where('sessionId')
        .equals(sessionId)
        .toArray()
      if (exercises.length) {
        await db.setEntries
          .where('sessionExerciseId')
          .anyOf(exercises.map((e) => e.id))
          .delete()
      }
      await db.sessionExercises.where('sessionId').equals(sessionId).delete()
      await db.sessions.delete(sessionId)
    },
  )
}

export async function updateSession(
  id: string,
  patch: Partial<Pick<TrainingSession, 'date' | 'note' | 'templateNameSnapshot'>>,
): Promise<void> {
  await db.sessions.update(id, patch)
}

/** 同模板的上一次已完成训练（用于总结对比） */
export async function findPreviousSession(
  session: TrainingSession,
): Promise<TrainingSession | null> {
  const all = await db.sessions.where('status').equals('completed').toArray()
  const candidates = all.filter((s) => {
    if (s.id === session.id) return false
    if (s.startedAt >= session.startedAt) return false
    if (session.templateId) return s.templateId === session.templateId
    return s.templateId === null && s.templateNameSnapshot === session.templateNameSnapshot
  })
  candidates.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return candidates[0] ?? null
}

export async function findSessionIdsByExerciseName(query: string): Promise<string[]> {
  const keyword = query.trim()
  if (!keyword) return []
  const exercises = await db.exercises.toArray()
  const matchedIds = exercises.filter((e) => e.name.includes(keyword)).map((e) => e.id)
  if (!matchedIds.length) return []
  const blocks = await db.sessionExercises.where('exerciseId').anyOf(matchedIds).toArray()
  return [...new Set(blocks.map((b) => b.sessionId))]
}

export async function countCompletedSessionsBetween(
  fromKey: string,
  toKey: string,
): Promise<number> {
  const list = await db.sessions.where('date').between(fromKey, toKey, true, true).toArray()
  return list.filter((s) => s.status === 'completed').length
}
