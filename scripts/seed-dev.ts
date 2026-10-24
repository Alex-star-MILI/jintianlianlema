import { db } from '../src/db/schema'
import type {
  BodyWeight,
  CalorieLog,
  SessionExercise,
  SetEntry,
  Template,
  TemplateExercise,
  TrainingSession,
} from '../src/db/types'

const TEMPLATE_DEFS = [
  {
    id: 'seed-push',
    name: '推 · 胸肩三头',
    items: ['ex-bench-press', 'ex-db-shoulder-press', 'ex-cable-fly'],
  },
  {
    id: 'seed-pull',
    name: '拉 · 背二头',
    items: ['ex-barbell-row', 'ex-lat-pulldown', 'ex-seated-row'],
  },
  {
    id: 'seed-legs',
    name: '腿 · 蹲拉',
    items: ['ex-squat', 'ex-rdl', 'ex-leg-press'],
  },
] as const

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function shiftDays(base: Date, delta: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  next.setDate(next.getDate() + delta)
  return next
}

export interface SeedResult {
  sessions: number
  blocks: number
  sets: number
  weights: number
  calories: number
}

/**
 * 生成演示数据，仅供开发/性能检查使用。
 * 调用前请确保数据库已初始化（resetDatabase 会重新 populate 内置动作）。
 */
export async function seedDemoData(options: {
  sessions?: number
  today?: Date
  seedWeights?: boolean
} = {}): Promise<SeedResult> {
  const sessionCount = options.sessions ?? 500
  const today = options.today ?? new Date()
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const exercises = await db.exercises.toArray()
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const nowIso = new Date().toISOString()

  const templates: Template[] = TEMPLATE_DEFS.map((definition, index) => ({
    id: definition.id,
    name: definition.name,
    note: '演示数据',
    sortOrder: index,
    createdAt: nowIso,
    updatedAt: nowIso,
  }))
  const templateExercises: TemplateExercise[] = []
  const templateIndex = new Map<string, Template>()
  for (const [index, definition] of TEMPLATE_DEFS.entries()) {
    templateIndex.set(definition.id, templates[index])
    for (const [order, exerciseId] of definition.items.entries()) {
      templateExercises.push({
        id: `${definition.id}-item-${order}`,
        templateId: definition.id,
        exerciseId,
        sortOrder: order,
        targetSets: 3,
        targetReps: 8,
        targetWeight: null,
      })
    }
  }

  const sessions: TrainingSession[] = []
  const blocks: SessionExercise[] = []
  const sets: SetEntry[] = []

  for (let index = 0; index < sessionCount; index += 1) {
    const definition = TEMPLATE_DEFS[index % TEMPLATE_DEFS.length]
    const template = templateIndex.get(definition.id)!
    const date = dateKey(shiftDays(base, -(sessionCount - 1 - index) * 2))
    const sessionId = `seed-session-${index}`
    const weight = 50 + (index % 10) * 2.5
    const reps = 8
    let totalVolume = 0
    let totalSets = 0

    for (const [blockOrder, exerciseId] of definition.items.entries()) {
      const exercise = exerciseMap.get(exerciseId)
      if (!exercise) continue
      const blockId = `seed-block-${index}-${blockOrder}`
      blocks.push({
        id: blockId,
        sessionId,
        exerciseId,
        exerciseNameSnapshot: exercise.name,
        categorySnapshot: exercise.category,
        sortOrder: blockOrder,
        skipped: false,
      })
      for (let setIndex = 1; setIndex <= 3; setIndex += 1) {
        sets.push({
          id: `seed-set-${index}-${blockOrder}-${setIndex}`,
          sessionExerciseId: blockId,
          setIndex,
          weightKg: weight,
          reps,
          completed: true,
        })
        totalVolume += weight * reps
        totalSets += 1
      }
    }

    sessions.push({
      id: sessionId,
      date,
      templateId: template.id,
      templateNameSnapshot: template.name,
      startedAt: `${date}T10:00:00.000Z`,
      endedAt: `${date}T11:00:00.000Z`,
      durationSec: 3600,
      status: 'completed',
      note: '',
      totalSets,
      totalVolume: Math.round(totalVolume),
    })
  }

  const weights: BodyWeight[] = []
  const calories: CalorieLog[] = []
  if (options.seedWeights !== false) {
    for (let index = 0; index < 30; index += 1) {
      const date = dateKey(shiftDays(base, -index * 3))
      weights.push({
        id: `seed-weight-${index}`,
        date,
        weightKg: Math.round((72 - index * 0.05) * 10) / 10,
        createdAt: nowIso,
      })
    }
    for (let index = 0; index < 20; index += 1) {
      const date = dateKey(shiftDays(base, -index))
      calories.push({
        id: `seed-calorie-${index}`,
        date,
        breakfast: 500 + (index % 5) * 20,
        lunch: 700,
        dinner: 650,
        snack: 150 + (index % 3) * 30,
        updatedAt: nowIso,
      })
    }
  }

  await db.transaction(
    'rw',
    [db.templates, db.templateExercises, db.sessions, db.sessionExercises, db.setEntries, db.bodyWeights, db.calorieLogs],
    async () => {
      await db.templates.bulkPut(templates)
      await db.templateExercises.bulkPut(templateExercises)
      await db.sessions.bulkPut(sessions)
      await db.sessionExercises.bulkPut(blocks)
      await db.setEntries.bulkPut(sets)
      if (weights.length) await db.bodyWeights.bulkPut(weights)
      if (calories.length) await db.calorieLogs.bulkPut(calories)
    },
  )

  return {
    sessions: sessions.length,
    blocks: blocks.length,
    sets: sets.length,
    weights: weights.length,
    calories: calories.length,
  }
}
