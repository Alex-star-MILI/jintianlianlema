import { db } from '../schema'
import { uid } from '../../lib/ids'
import { PRESET_TEMPLATES } from '../seed'
import type { Template, TemplateExercise } from '../types'

export interface TemplateItemInput {
  exerciseId: string
  targetSets: number
  targetReps: number
  targetWeight: number | null
}

export async function listTemplates(): Promise<Template[]> {
  return db.templates.orderBy('sortOrder').toArray()
}

export async function getTemplate(id: string): Promise<Template | undefined> {
  return db.templates.get(id)
}

export async function getTemplateItems(templateId: string): Promise<TemplateExercise[]> {
  const items = await db.templateExercises.where('templateId').equals(templateId).toArray()
  return items.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** 新建或整体保存模板及其动作（编辑器点保存时调用） */
export async function saveTemplateBundle(
  templateId: string | null,
  input: { name: string; note: string; items: TemplateItemInput[] },
): Promise<string> {
  const name = input.name.trim()
  if (!name) throw new Error('模板名称不能为空')
  if (!input.items.length) throw new Error('模板至少需要一个动作')
  const now = new Date().toISOString()

  return db.transaction(
    'rw',
    [db.templates, db.templateExercises],
    async () => {
      let id = templateId
      if (id) {
        const existing = await db.templates.get(id)
        if (!existing) throw new Error('模板不存在')
        await db.templates.update(id, { name, note: input.note.trim(), updatedAt: now })
      } else {
        const all = await db.templates.toArray()
        const maxOrder = all.reduce((max, t) => Math.max(max, t.sortOrder), 0)
        id = uid()
        await db.templates.add({
          id,
          name,
          note: input.note.trim(),
          sortOrder: maxOrder + 1,
          createdAt: now,
          updatedAt: now,
        })
      }
      await db.templateExercises.where('templateId').equals(id).delete()
      for (let index = 0; index < input.items.length; index += 1) {
        const item = input.items[index]
        await db.templateExercises.add({
          id: uid(),
          templateId: id,
          exerciseId: item.exerciseId,
          sortOrder: index,
          targetSets: Math.min(10, Math.max(1, Math.round(item.targetSets))),
          targetReps: Math.min(50, Math.max(1, Math.round(item.targetReps))),
          targetWeight: item.targetWeight,
        })
      }
      return id
    },
  )
}

/** 删除模板：周映射置为休息，历史记录保留快照 */
export async function deleteTemplate(id: string): Promise<void> {
  await db.transaction('rw', [db.templates, db.templateExercises, db.planAssignments], async () => {
    await db.templateExercises.where('templateId').equals(id).delete()
    await db.templates.delete(id)
    const assignments = await db.planAssignments.toArray()
    for (const assignment of assignments) {
      if (assignment.templateId === id) {
        await db.planAssignments.put({ weekday: assignment.weekday, templateId: null })
      }
    }
  })
}

/** 首次引导：一键导入预设模板，返回新建的模板 id（可按名称筛选） */
export async function createPresetTemplates(names?: string[]): Promise<string[]> {
  const presets = names?.length
    ? PRESET_TEMPLATES.filter((preset) => names.includes(preset.name))
    : PRESET_TEMPLATES
  const created: string[] = []
  for (const preset of presets) {
    const id = await saveTemplateBundle(null, {
      name: preset.name,
      note: '',
      items: preset.exercises.map((item) => ({
        exerciseId: item.exerciseId,
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        targetWeight: null,
      })),
    })
    created.push(id)
  }
  return created
}

export async function getExerciseUsageCount(exerciseId: string): Promise<number> {
  return db.templateExercises.where('exerciseId').equals(exerciseId).count()
}

/** 复制模板（用于计划页「复制」操作） */
export async function duplicateTemplate(id: string): Promise<string> {
  const template = await db.templates.get(id)
  if (!template) throw new Error('模板不存在')
  const items = await getTemplateItems(id)
  return saveTemplateBundle(null, {
    name: `${template.name} 副本`,
    note: template.note,
    items: items.map((item) => ({
      exerciseId: item.exerciseId,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
      targetWeight: item.targetWeight,
    })),
  })
}
