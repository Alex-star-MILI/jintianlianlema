import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../../db/schema'
import { getTemplate, getTemplateItems, saveTemplateBundle } from '../../db/repo/templates'
import type { ExerciseCategory } from '../../db/types'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { ExercisePicker } from './ExercisePicker'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DumbbellIcon,
  TrashIcon,
} from '../../components/icons'
import { uid } from '../../lib/ids'
import { cx } from '../../lib/cx'
import { formatWeight } from '../../lib/metrics'
import { toDisplayWeight, toKg, unitLabel } from '../../lib/units'
import { useUnit } from '../../lib/useUnit'

interface DraftItem {
  key: string
  exerciseId: string
  targetSets: number
  targetReps: number
  targetWeight: number | null
}

export function TemplateEditorPage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const toast = useToast()
  const unit = useUnit()

  const data = useLiveQuery(async () => {
    if (isNew) return { template: null, items: [] }
    const template = await getTemplate(id!)
    if (!template) return null
    return { template, items: await getTemplateItems(id!) }
  }, [id, isNew])

  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const exerciseMap = useMemo(() => {
    const map = new Map<string, { name: string; category: ExerciseCategory; hidden: boolean }>()
    for (const exercise of exercises ?? []) {
      map.set(exercise.id, {
        name: exercise.name,
        category: exercise.category,
        hidden: exercise.hidden,
      })
    }
    return map
  }, [exercises])

  const [name, setName] = useState('新模板')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(isNew)

  useEffect(() => {
    if (isNew || !data) return
    setName(data.template?.name ?? '')
    setNote(data.template?.note ?? '')
    setItems(
      data.items.map((item) => ({
        key: item.id,
        exerciseId: item.exerciseId,
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        targetWeight: item.targetWeight,
      })),
    )
    setInitialized(true)
  }, [data, isNew])

  function addExercise(exerciseId: string) {
    setItems((list) => [
      ...list,
      { key: uid(), exerciseId, targetSets: 3, targetReps: 10, targetWeight: null },
    ])
    setPickerOpen(false)
    toast('已添加动作')
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function removeItem(key: string) {
    setItems((list) => list.filter((item) => item.key !== key))
    if (expanded === key) setExpanded(null)
  }

  function moveItem(index: number, delta: number) {
    setItems((list) => {
      const target = index + delta
      if (target < 0 || target >= list.length) return list
      const next = [...list]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  async function handleSave() {
    if (saving) return
    if (!name.trim()) {
      toast('请填写模板名称')
      return
    }
    if (!items.length) {
      toast('请先添加动作')
      return
    }
    setSaving(true)
    try {
      await saveTemplateBundle(isNew ? null : id!, {
        name,
        note,
        items: items.map((item) => ({
          exerciseId: item.exerciseId,
          targetSets: item.targetSets,
          targetReps: item.targetReps,
          targetWeight: item.targetWeight,
        })),
      })
      toast('模板已保存')
      navigate('/plan')
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (data === undefined || !initialized) {
    return <p className="py-16 text-center text-[13px] text-ink3">加载中…</p>
  }

  if (data === null) {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate('/plan')}
          className="mb-2 flex h-10 w-10 items-center justify-center rounded-full text-ink2 active:bg-soft"
          aria-label="返回"
        >
          <ArrowLeftIcon size={22} />
        </button>
        <EmptyState
          icon={<DumbbellIcon size={22} />}
          title="模板不存在"
          description="它可能已被删除，返回计划页重新创建。"
          action={<Button onClick={() => navigate('/plan')}>返回计划</Button>}
        />
      </div>
    )
  }

  return (
    <div className="pb-10">
      <header className="mb-4 flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => navigate('/plan')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink2 active:bg-soft"
          aria-label="返回"
        >
          <ArrowLeftIcon size={22} />
        </button>
        <h1 className="flex-1 text-[17px] font-semibold text-ink">
          {isNew ? '新建模板' : '编辑模板'}
        </h1>
        <Button size="sm" onClick={handleSave} disabled={!items.length || saving}>
          {saving ? '保存中' : '保存'}
        </Button>
      </header>

      <div className="space-y-3">
        <div className="rounded-card bg-white p-4 shadow-card">
          <label className="text-[12px] font-medium text-ink3" htmlFor="template-name">
            模板名称
          </label>
          <input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：推 · 胸肩三头"
            className="mt-1 h-11 w-full rounded-field bg-soft px-3 text-[15px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
          />
          <label className="mt-3 block text-[12px] font-medium text-ink3" htmlFor="template-note">
            备注（选填）
          </label>
          <input
            id="template-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：重点练上胸"
            className="mt-1 h-11 w-full rounded-field bg-soft px-3 text-[14px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
          />
        </div>

        <div className="flex items-center justify-between px-1">
          <h2 className="text-[13px] font-medium text-ink2">动作列表</h2>
          <span className="text-[12px] text-ink3">
            {items.length} 个动作 · {items.reduce((sum, item) => sum + item.targetSets, 0)} 组
          </span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-card bg-white shadow-card">
            <EmptyState
              icon={<DumbbellIcon size={22} />}
              title="还没有动作"
              description="至少添加一个动作后才能保存模板。"
              action={
                <Button onClick={() => setPickerOpen(true)}>添加动作</Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => {
              const exercise = exerciseMap.get(item.exerciseId)
              const isExpanded = expanded === item.key
              return (
                <div key={item.key} className="rounded-card bg-white shadow-card">
                  <div className="flex items-center gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : item.key)}
                      aria-label={`编辑 ${exercise?.name ?? '动作'}`}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-soft text-[12px] font-medium text-ink2 tnum">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[14px] font-medium text-ink">
                            {exercise?.name ?? '已删除动作'}
                          </span>
                          {exercise?.hidden ? (
                            <span className="shrink-0 rounded-full bg-[#FFF4E5] px-1.5 py-0.5 text-[10px] text-[#B45309]">
                              已隐藏
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-ink3">
                          {exercise?.category ?? '其他'} · {item.targetSets} 组 × {item.targetReps} 次
                          {item.targetWeight !== null
                            ? ` · 目标 ${formatWeight(toDisplayWeight(item.targetWeight, unit))}${unitLabel(unit)}`
                            : ''}
                        </span>
                      </span>
                      <ChevronDownIcon
                        size={18}
                        className={cx('shrink-0 text-ink3 transition-transform', isExpanded && 'rotate-180')}
                      />
                    </button>
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        aria-label={`上移：${exercise?.name ?? '动作'}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ink3 active:bg-soft disabled:opacity-30"
                      >
                        <ChevronLeftIcon size={18} className="rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(index, 1)}
                        disabled={index === items.length - 1}
                        aria-label={`下移：${exercise?.name ?? '动作'}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ink3 active:bg-soft disabled:opacity-30"
                      >
                        <ChevronRightIcon size={18} className="rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.key)}
                        aria-label={`删除：${exercise?.name ?? '动作'}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-danger active:bg-soft"
                      >
                        <TrashIcon size={17} />
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-line px-4 pb-4 pt-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="mb-1 block text-[11px] text-ink3">目标组数</span>
                          <NumberField
                            value={item.targetSets}
                            min={1}
                            max={10}
                            ariaLabel="目标组数"
                            onChange={(value) =>
                              updateItem(item.key, { targetSets: value ?? item.targetSets })
                            }
                          />
                        </div>
                        <div>
                          <span className="mb-1 block text-[11px] text-ink3">目标次数</span>
                          <NumberField
                            value={item.targetReps}
                            min={1}
                            max={50}
                            ariaLabel="目标次数"
                            onChange={(value) =>
                              updateItem(item.key, { targetReps: value ?? item.targetReps })
                            }
                          />
                        </div>
                        <div>
                          <span className="mb-1 block text-[11px] text-ink3">
                            目标重量（{unitLabel(unit)}）
                          </span>
                          <NumberField
                            value={
                              item.targetWeight === null
                                ? null
                                : toDisplayWeight(item.targetWeight, unit)
                            }
                            min={0}
                            max={unit === 'lb' ? 1100 : 500}
                            placeholder="选填"
                            ariaLabel="目标重量"
                            onChange={(value) =>
                              updateItem(item.key, {
                                targetWeight: value === null ? null : toKg(value, unit),
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {items.length > 0 ? (
          <Button variant="secondary" fullWidth onClick={() => setPickerOpen(true)}>
            ＋ 添加动作
          </Button>
        ) : null}
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
      />
    </div>
  )
}
