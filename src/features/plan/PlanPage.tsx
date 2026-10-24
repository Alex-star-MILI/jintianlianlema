import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db/schema'
import { deleteTemplate, duplicateTemplate, listTemplates } from '../../db/repo/templates'
import { getAssignmentMap, setWeekdayTemplate } from '../../db/repo/plan'
import type { ExerciseCategory, Template } from '../../db/types'
import { PageHeader, SectionLabel } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog, Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/Toast'
import {
  CalendarIcon,
  ChevronRightIcon,
  DumbbellIcon,
  PlusIcon,
  TrashIcon,
} from '../../components/icons'
import { todayKey, weekdayName, weekdayOf } from '../../lib/date'
import { cx } from '../../lib/cx'

interface TemplateSummary {
  exerciseCount: number
  totalSets: number
  categories: ExerciseCategory[]
}

export function PlanPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const data = useLiveQuery(async () => {
    const [templates, items, exercises, assignmentMap] = await Promise.all([
      listTemplates(),
      db.templateExercises.toArray(),
      db.exercises.toArray(),
      getAssignmentMap(),
    ])
    return { templates, items, exercises, assignmentMap }
  }, [])

  const summaries = useMemo(() => {
    const map = new Map<string, TemplateSummary>()
    const categoryOf = new Map(data?.exercises.map((e) => [e.id, e.category]) ?? [])
    for (const template of data?.templates ?? []) {
      map.set(template.id, { exerciseCount: 0, totalSets: 0, categories: [] })
    }
    for (const item of data?.items ?? []) {
      const summary = map.get(item.templateId)
      if (!summary) continue
      summary.exerciseCount += 1
      summary.totalSets += item.targetSets
      const category = categoryOf.get(item.exerciseId)
      if (category && !summary.categories.includes(category)) summary.categories.push(category)
    }
    return map
  }, [data])

  const templateMap = useMemo(() => {
    const map = new Map<string, Template>()
    for (const template of data?.templates ?? []) map.set(template.id, template)
    return map
  }, [data])

  const todayWeekday = weekdayOf(todayKey())

  const [editingWeekday, setEditingWeekday] = useState<number | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [copyDays, setCopyDays] = useState<number[]>([])
  const [savingPlan, setSavingPlan] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)

  function openDaySheet(weekday: number) {
    setEditingWeekday(weekday)
    setSelectedTemplateId(data?.assignmentMap[weekday] ?? null)
    setCopyDays([])
  }

  function toggleCopyDay(weekday: number) {
    setCopyDays((list) =>
      list.includes(weekday) ? list.filter((day) => day !== weekday) : [...list, weekday],
    )
  }

  async function savePlan() {
    if (editingWeekday === null || savingPlan) return
    setSavingPlan(true)
    try {
      await setWeekdayTemplate(editingWeekday, selectedTemplateId)
      for (const day of copyDays) {
        await setWeekdayTemplate(day, selectedTemplateId)
      }
      toast(copyDays.length ? '已更新并复制到其他天' : '已更新当天安排')
      setEditingWeekday(null)
    } catch {
      toast('保存失败，请重试')
    } finally {
      setSavingPlan(false)
    }
  }

  async function handleDuplicate(template: Template) {
    if (duplicating) return
    setDuplicating(template.id)
    try {
      const id = await duplicateTemplate(template.id)
      toast('已复制模板')
      navigate(`/plan/templates/${id}`)
    } catch {
      toast('复制失败，请重试')
    } finally {
      setDuplicating(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteTemplate(deleteTarget.id)
      toast('模板已删除，历史记录保留')
    } catch {
      toast('删除失败，请重试')
    } finally {
      setDeleteTarget(null)
    }
  }

  if (!data) {
    return <p className="py-16 text-center text-[13px] text-ink3">加载中…</p>
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="计划"
        subtitle="安排每周训练，改一次长期生效"
        right={
          <Button size="sm" onClick={() => navigate('/plan/templates/new')}>
            <PlusIcon size={16} /> 新建
          </Button>
        }
      />

      <Card>
        <CardTitle right={<span className="text-[11px] text-ink3">点某天调整</span>}>
          本周安排
        </CardTitle>
        <div className="divide-y divide-line">
          {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
            const templateId = data.assignmentMap[weekday]
            const template = templateId ? templateMap.get(templateId) : null
            const isToday = weekday === todayWeekday
            return (
              <button
                key={weekday}
                type="button"
                onClick={() => openDaySheet(weekday)}
                className="flex w-full items-center justify-between py-3 text-left active:bg-soft"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cx(
                      'text-[13px] font-medium',
                      isToday ? 'text-brand' : 'text-ink2',
                    )}
                  >
                    {weekdayName(weekday)}
                  </span>
                  {isToday ? (
                    <span className="rounded-full bg-brandsoft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                      今天
                    </span>
                  ) : null}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cx(
                      'truncate text-[14px]',
                      template ? 'text-ink' : 'text-ink3',
                    )}
                  >
                    {template ? template.name : '休息'}
                  </span>
                  <ChevronRightIcon size={16} className="shrink-0 text-ink3" />
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <SectionLabel>训练模板</SectionLabel>
      {data.templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarIcon size={22} />}
            title="还没有训练模板"
            description="先建一套「推 / 拉 / 腿」，再安排到每周。"
            action={<Button onClick={() => navigate('/plan/templates/new')}>新建模板</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {data.templates.map((template) => {
            const summary = summaries.get(template.id) ?? {
              exerciseCount: 0,
              totalSets: 0,
              categories: [],
            }
            return (
              <div key={template.id} className="rounded-card bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/plan/templates/${template.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold text-ink">
                        {template.name}
                      </span>
                      <ChevronRightIcon size={16} className="shrink-0 text-ink3" />
                    </div>
                    <p className="mt-1 text-[12px] text-ink3">
                      {summary.exerciseCount} 个动作 · 预计 {summary.totalSets} 组
                    </p>
                    {template.note ? (
                      <p className="mt-1 truncate text-[12px] text-ink2">{template.note}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {summary.categories.map((category) => (
                        <span
                          key={category}
                          className="rounded-full bg-brandsoft px-2 py-0.5 text-[11px] text-brand"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleDuplicate(template)}
                      disabled={duplicating === template.id}
                      className="rounded-btn px-2 py-1 text-[12px] text-ink2 active:bg-soft disabled:opacity-50"
                    >
                      {duplicating === template.id ? '复制中' : '复制'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(template)}
                      aria-label={`删除模板：${template.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-btn text-danger active:bg-soft"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Sheet
        open={editingWeekday !== null}
        onClose={() => setEditingWeekday(null)}
        title={editingWeekday ? `${weekdayName(editingWeekday)}练什么` : '安排训练'}
        footer={
          <Button fullWidth onClick={savePlan} disabled={savingPlan}>
            {savingPlan ? '保存中…' : '保存安排'}
          </Button>
        }
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setSelectedTemplateId(null)}
            className={cx(
              'flex w-full items-center justify-between rounded-field px-3 py-3 text-left',
              selectedTemplateId === null ? 'bg-brandsoft' : 'bg-soft',
            )}
          >
            <span className={selectedTemplateId === null ? 'text-brand' : 'text-ink2'}>
              休息
            </span>
            {selectedTemplateId === null ? (
              <span className="text-[12px] font-medium text-brand">已选</span>
            ) : null}
          </button>
          {data.templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelectedTemplateId(template.id)}
              className={cx(
                'flex w-full items-center justify-between rounded-field px-3 py-3 text-left',
                selectedTemplateId === template.id ? 'bg-brandsoft' : 'bg-soft',
              )}
            >
              <span
                className={
                  selectedTemplateId === template.id ? 'text-brand' : 'text-ink'
                }
              >
                {template.name}
              </span>
              {selectedTemplateId === template.id ? (
                <span className="text-[12px] font-medium text-brand">已选</span>
              ) : null}
            </button>
          ))}
          {data.templates.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-ink3">还没有模板，可以先将这天设为休息。</p>
          ) : null}

          <div className="pt-2">
            <p className="mb-2 px-1 text-[12px] font-medium text-ink3">同时复制到</p>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7]
                .filter((day) => day !== editingWeekday)
                .map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleCopyDay(day)}
                    className={cx(
                      'h-9 rounded-full px-3 text-[13px]',
                      copyDays.includes(day)
                        ? 'bg-brand text-white'
                        : 'bg-soft text-ink2',
                    )}
                  >
                    {weekdayName(day)}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除「${deleteTarget?.name ?? ''}」？`}
        description="模板删除后，周视图对应安排变为休息；已保存的历史训练记录不会受影响。"
        confirmText="删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-ink3">
        <DumbbellIcon size={14} /> 修改模板不会改写历史记录
      </div>
    </div>
  )
}
