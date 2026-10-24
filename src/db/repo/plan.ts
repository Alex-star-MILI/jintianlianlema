import { db } from '../schema'
import { weekdayOf } from '../../lib/date'
import type { PlanAssignment } from '../types'

export async function listAssignments(): Promise<PlanAssignment[]> {
  const all = await db.planAssignments.toArray()
  return all.sort((a, b) => a.weekday - b.weekday)
}

export async function setWeekdayTemplate(
  weekday: number,
  templateId: string | null,
): Promise<void> {
  await db.planAssignments.put({ weekday, templateId })
}

export async function getAssignmentMap(): Promise<Record<number, string | null>> {
  const assignments = await listAssignments()
  const map: Record<number, string | null> = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null }
  for (const item of assignments) map[item.weekday] = item.templateId
  return map
}

/** 根据日期推导当天模板 id（无则为休息） */
export function resolveTemplateId(dateKey: string, map: Record<number, string | null>): string | null {
  return map[weekdayOf(dateKey)] ?? null
}

export async function resolveTodayTemplateId(dateKey: string): Promise<string | null> {
  return resolveTemplateId(dateKey, await getAssignmentMap())
}

/** 首次引导：把若干个模板依次分配到工作日（跳过周末） */
export async function assignTemplatesToDays(
  templateIds: string[],
  weekdays: number[],
): Promise<void> {
  await db.transaction('rw', db.planAssignments, async () => {
    await db.planAssignments.clear()
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      await db.planAssignments.put({ weekday, templateId: null })
    }
    for (let index = 0; index < templateIds.length; index += 1) {
      const weekday = weekdays[index]
      if (weekday) await db.planAssignments.put({ weekday, templateId: templateIds[index] })
    }
  })
}
