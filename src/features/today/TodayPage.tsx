import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db/schema'
import { listTemplates } from '../../db/repo/templates'
import { getAssignmentMap } from '../../db/repo/plan'
import {
  countCompletedSessionsBetween,
  getDraftForDate,
  getSessionBundle,
  listCompletedSessions,
  startEmptySession,
  startSessionFromTemplate,
} from '../../db/repo/sessions'
import { calorieTotal, getCalorieLog, getGoals } from '../../db/repo/health'
import type { Template } from '../../db/types'
import { Card, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { CaloriePanel } from './CaloriePanel'
import { WeightPanel } from './WeightPanel'
import {
  ChartIcon,
  ClockIcon,
  FlameIcon,
  PlusIcon,
  ScaleIcon,
  TrendUpIcon,
} from '../../components/icons'
import {
  formatDateLabel,
  formatDuration,
  todayKey,
  weekEndKey,
  weekStartKey,
  weekdayOf,
} from '../../lib/date'
import { toDisplayWeight, unitLabel } from '../../lib/units'
import { useUnit } from '../../lib/useUnit'
import { cx } from '../../lib/cx'

type Override = string | 'rest' | null

const overrideKey = (date: string) => `today-override-${date}`

function readOverride(date: string): Override {
  const raw = window.sessionStorage.getItem(overrideKey(date))
  if (!raw) return null
  return raw === 'rest' ? 'rest' : raw
}

export function TodayPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const unit = useUnit()
  const date = todayKey()
  const todayWeekday = weekdayOf(date)

  const data = useLiveQuery(async () => {
    const [assignmentMap, templates, templateItems, exercises, goals, calorie, draft, todaySessions, weekCount, completed] =
      await Promise.all([
        getAssignmentMap(),
        listTemplates(),
        db.templateExercises.toArray(),
        db.exercises.toArray(),
        getGoals(),
        getCalorieLog(date),
        getDraftForDate(date),
        db.sessions.where('date').equals(date).toArray(),
        countCompletedSessionsBetween(weekStartKey(date), weekEndKey(date)),
        listCompletedSessions(),
      ])
    const draftBundle = draft ? await getSessionBundle(draft.id) : null
    const completedToday =
      todaySessions
        .filter((session) => session.status === 'completed')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
    return {
      assignmentMap,
      templates,
      templateItems,
      exercises,
      goals,
      calorie,
      draftBundle,
      completedToday,
      weekCount,
      recent: completed[completed.length - 1] ?? null,
    }
  }, [date])

  const [override, setOverride] = useState<Override>(() => readOverride(date))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'override' | 'start'>('override')
  const [quickOpen, setQuickOpen] = useState(false)
  const [calorieOpen, setCalorieOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  function writeOverride(next: Override) {
    setOverride(next)
    if (next === null) window.sessionStorage.removeItem(overrideKey(date))
    else window.sessionStorage.setItem(overrideKey(date), next)
  }

  const templateMap = useMemo(() => {
    const map = new Map<string, Template>()
    for (const template of data?.templates ?? []) map.set(template.id, template)
    return map
  }, [data])

  const summary = useMemo(() => {
    const counts = new Map<string, { exerciseCount: number; totalSets: number }>()
    for (const item of data?.templateItems ?? []) {
      const current = counts.get(item.templateId) ?? { exerciseCount: 0, totalSets: 0 }
      current.exerciseCount += 1
      current.totalSets += item.targetSets
      counts.set(item.templateId, current)
    }
    return counts
  }, [data])

  const assignedId = data?.assignmentMap[todayWeekday] ?? null
  const effectiveId = override === 'rest' ? null : override ?? assignedId
  const effectiveTemplate = effectiveId ? templateMap.get(effectiveId) : undefined
  const effectiveSummary = effectiveId ? summary.get(effectiveId) : undefined

  const draftBundle = data?.draftBundle ?? null
  const completedToday = data?.completedToday ?? null
  const draftTotal = draftBundle?.sets.length ?? 0
  const draftDone = draftBundle?.sets.filter((set) => set.completed).length ?? 0

  const displayName = draftBundle
    ? draftBundle.session.templateNameSnapshot
    : completedToday
      ? completedToday.templateNameSnapshot
      : effectiveTemplate?.name

  const target = data?.goals.weeklySessionTarget ?? 4
  const weekCount = data?.weekCount ?? 0
  const pct = target > 0 ? Math.min(100, Math.round((weekCount / target) * 100)) : 0
  const calories = calorieTotal(data?.calorie ?? null)

  async function start(templateId: string | null) {
    if (busy) return
    setBusy(true)
    try {
      const existing = await getDraftForDate(date)
      if (existing) {
        toast('当天已有未完成训练，已为你打开')
        navigate(`/session/${existing.id}`)
        return
      }
      const id = templateId
        ? await startSessionFromTemplate(templateId, date)
        : await startEmptySession(date)
      navigate(`/session/${id}`)
    } catch {
      toast('创建训练失败，请重试')
      setBusy(false)
    }
  }

  function openPicker(mode: 'override' | 'start') {
    setPickerMode(mode)
    setPickerOpen(true)
  }

  function handlePickTemplate(templateId: string | null) {
    setPickerOpen(false)
    if (pickerMode === 'start') {
      void start(templateId)
      return
    }
    writeOverride(templateId)
    toast(templateId ? '今日已换一套，仅本次生效' : '今天已设为休息')
  }

  if (!data) {
    return <p className="py-16 text-center text-[13px] text-ink3">加载中…</p>
  }

  const isRest = !draftBundle && !completedToday && !effectiveTemplate

  return (
    <div className="pb-10">
      <header className="mb-4 flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">
            {formatDateLabel(date)}
          </h1>
          <p className="mt-1 text-[13px] text-ink2">
            {draftBundle ? '训练正在进行中' : completedToday ? '今天已经练完了' : '按计划来，一次一组'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-label="快速记录"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-soft text-ink2 active:bg-line"
        >
          <PlusIcon size={20} />
        </button>
      </header>

      <Card className="relative overflow-hidden">
        <CardTitle
          right={
            !draftBundle && !completedToday ? (
              <div className="flex items-center gap-1">
                {assignedId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openPicker('override')}
                      className="rounded-btn px-2 py-1 text-[12px] text-ink2 active:bg-soft"
                    >
                      换一套
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        writeOverride(override === 'rest' ? null : 'rest')
                      }
                      className="rounded-btn px-2 py-1 text-[12px] text-ink2 active:bg-soft"
                    >
                      {override === 'rest' ? '恢复安排' : '今天休息'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openPicker('override')}
                    className="rounded-btn px-2 py-1 text-[12px] text-ink2 active:bg-soft"
                  >
                    选个模板
                  </button>
                )}
              </div>
            ) : null
          }
        >
          今日训练
        </CardTitle>

        <div className={cx('rounded-[16px] p-4', isRest ? 'bg-soft' : 'bg-brandsoft')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className={cx(
                  'truncate text-[20px] font-semibold',
                  isRest ? 'text-ink2' : 'text-ink',
                )}
              >
                {displayName ?? '今天休息'}
              </p>
              {!isRest ? (
                <p className="mt-1 text-[12px] text-ink2">
                  {draftBundle
                    ? `已完成 ${draftDone} / ${draftTotal} 组`
                    : completedToday
                      ? `${completedToday.totalSets} 组 · ${Math.round(toDisplayWeight(completedToday.totalVolume, unit))} ${unitLabel(unit)} 容量`
                      : `${effectiveSummary?.exerciseCount ?? 0} 个动作 · 预计 ${effectiveSummary?.totalSets ?? 0} 组`}
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-ink2">
                  {override === 'rest' ? '今天临时休息，可随时恢复' : '没有安排训练，也可以临时练一套'}
                </p>
              )}
            </div>
            {!isRest ? (
              <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 text-[11px] font-medium text-brand">
                {draftBundle ? '进行中' : completedToday ? '已完成' : '待开始'}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            {draftBundle ? (
              <Button fullWidth onClick={() => navigate(`/session/${draftBundle.session.id}`)}>
                继续训练（已完成 {draftDone}/{draftTotal} 组）
              </Button>
            ) : completedToday ? (
              <Button
                fullWidth
                onClick={() => navigate(`/session/${completedToday.id}/summary`)}
              >
                查看本次总结
              </Button>
            ) : effectiveTemplate ? (
              <Button fullWidth onClick={() => start(effectiveTemplate.id)} disabled={busy}>
                {busy ? '正在开始…' : '开始训练'}
              </Button>
            ) : (
              <Button fullWidth onClick={() => openPicker('start')} disabled={busy}>
                临时练一套
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Card>
          <CardTitle>本周进度</CardTitle>
          <div className="flex items-center gap-4">
            <div
              className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(var(--c-green) ${pct}%, var(--c-line) 0)`,
              }}
            >
              <div className="absolute inset-[5px] flex flex-col items-center justify-center rounded-full bg-white">
                <span className="text-[17px] font-semibold leading-none text-ink tnum">
                  {weekCount}
                </span>
                <span className="text-[10px] text-ink3">/ {target} 次</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] text-ink2">
                {weekCount >= target ? '本周目标已完成' : `还差 ${target - weekCount} 次达标`}
              </p>
              <button
                type="button"
                onClick={() => navigate('/stats')}
                className="mt-1.5 flex items-center gap-1 text-[12px] text-brand"
              >
                看统计 <TrendUpIcon size={14} />
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle
            right={
              <button
                type="button"
                onClick={() => setCalorieOpen(true)}
                className="text-[12px] text-brand"
              >
                记录
              </button>
            }
          >
            今日热量
          </CardTitle>
          <button
            type="button"
            onClick={() => setCalorieOpen(true)}
            className="flex w-full items-center gap-3 text-left"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF4E5] text-[#E88C30]">
              <FlameIcon size={20} />
            </span>
            <span>
              <span className="block text-[20px] font-semibold leading-tight text-ink tnum">
                {calories}
                <span className="ml-1 text-[11px] font-normal text-ink3">kcal</span>
              </span>
              <span className="text-[11px] text-ink3">点这里补记四餐</span>
            </span>
          </button>
        </Card>
      </div>

      <div className="mt-3">
        <Card>
          <CardTitle>最近一次训练</CardTitle>
          {data.recent ? (
            <button
              type="button"
              onClick={() => navigate(`/records/${data.recent!.id}`)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-ink">
                  {data.recent.templateNameSnapshot}
                </span>
                <span className="mt-1 block text-[12px] text-ink3">
                  {formatDateLabel(data.recent.date)} · {data.recent.totalSets} 组
                  {data.recent.durationSec
                    ? ` · ${formatDuration(data.recent.durationSec)}`
                    : ''}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-medium text-ink tnum">
                {Math.round(toDisplayWeight(data.recent.totalVolume, unit))} {unitLabel(unit)}
              </span>
            </button>
          ) : (
            <EmptyState
              icon={<ClockIcon size={22} />}
              title="还没有训练记录"
              description="完成今天的第一练，这里会出现它的摘要。"
              className="py-6"
            />
          )}
        </Card>
      </div>

      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={pickerMode === 'start' ? '临时练一套' : '今天练哪套'}
      >
        <div className="space-y-2">
          {data.templates.length === 0 ? (
            <div>
              <p className="px-1 py-2 text-[13px] text-ink2">还没有训练模板。</p>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setPickerOpen(false)
                  navigate('/plan')
                }}
              >
                去计划页新建
              </Button>
            </div>
          ) : (
            data.templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handlePickTemplate(template.id)}
                className={cx(
                  'flex w-full items-center justify-between rounded-field px-3 py-3 text-left',
                  effectiveId === template.id ? 'bg-brandsoft' : 'bg-soft',
                )}
              >
                <span>
                  <span
                    className={cx(
                      'block text-[14px]',
                      effectiveId === template.id ? 'font-medium text-brand' : 'text-ink',
                    )}
                  >
                    {template.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink3">
                    {summary.get(template.id)?.exerciseCount ?? 0} 个动作 ·{' '}
                    {summary.get(template.id)?.totalSets ?? 0} 组
                  </span>
                </span>
                {effectiveId === template.id ? (
                  <span className="text-[11px] font-medium text-brand">当前</span>
                ) : null}
              </button>
            ))
          )}
          {pickerMode === 'override' ? (
            <button
              type="button"
              onClick={() => handlePickTemplate(null)}
              className="w-full rounded-field bg-soft px-3 py-3 text-left text-[14px] text-ink2"
            >
              今天休息
            </button>
          ) : (
            <Button variant="secondary" fullWidth onClick={() => handlePickTemplate(null)}>
              不选模板，自由训练
            </Button>
          )}
        </div>
      </Sheet>

      <Sheet open={quickOpen} onClose={() => setQuickOpen(false)} title="快速记录">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setQuickOpen(false)
              navigate('/records?add=1')
            }}
            className="flex w-full items-center gap-3 rounded-field bg-soft px-3 py-3 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand">
              <ChartIcon size={18} />
            </span>
            <span>
              <span className="block text-[14px] text-ink">补记训练</span>
              <span className="text-[11px] text-ink3">补一次以前的训练</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setQuickOpen(false)
              setWeightOpen(true)
            }}
            className="flex w-full items-center gap-3 rounded-field bg-soft px-3 py-3 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand">
              <ScaleIcon size={18} />
            </span>
            <span>
              <span className="block text-[14px] text-ink">记体重</span>
              <span className="text-[11px] text-ink3">同一天只保留最后一次</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setQuickOpen(false)
              setCalorieOpen(true)
            }}
            className="flex w-full items-center gap-3 rounded-field bg-soft px-3 py-3 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#E88C30]">
              <FlameIcon size={18} />
            </span>
            <span>
              <span className="block text-[14px] text-ink">记热量</span>
              <span className="text-[11px] text-ink3">早中晚加餐四餐合计</span>
            </span>
          </button>
        </div>
      </Sheet>

      <CaloriePanel open={calorieOpen} onClose={() => setCalorieOpen(false)} />
      <WeightPanel open={weightOpen} onClose={() => setWeightOpen(false)} />
    </div>
  )
}
