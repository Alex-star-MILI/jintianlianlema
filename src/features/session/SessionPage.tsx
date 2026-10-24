import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  addExerciseToSession,
  addSet,
  completeSession,
  deleteSession,
  getExerciseHint,
  getSessionBundle,
  setExerciseSkipped,
  updateSet,
  type ExerciseHint,
} from '../../db/repo/sessions'
import type { SessionExercise } from '../../db/types'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/Toast'
import { ExercisePicker } from '../plan/ExercisePicker'
import { CheckIcon, CloseIcon, PlusIcon } from '../../components/icons'
import { formatDateLabel, todayKey } from '../../lib/date'
import { toDisplayWeight, toKg, unitLabel } from '../../lib/units'
import { useUnit } from '../../lib/useUnit'
import { cx } from '../../lib/cx'

export function SessionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const unit = useUnit()

  const data = useLiveQuery(async () => {
    const bundle = await getSessionBundle(id!)
    if (!bundle) return null
    const hints: Record<string, ExerciseHint | null> = {}
    for (const block of bundle.exercises) {
      hints[block.exerciseId] = await getExerciseHint(block.exerciseId)
    }
    return { bundle, hints }
  }, [id])

  const [endOpen, setEndOpen] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => {
    if (!data) return []
    const map = new Map<string, typeof data.bundle.sets>()
    for (const block of data.bundle.exercises) map.set(block.id, [])
    for (const set of data.bundle.sets) {
      const list = map.get(set.sessionExerciseId)
      if (list) list.push(set)
    }
    for (const list of map.values()) list.sort((a, b) => a.setIndex - b.setIndex)
    return data.bundle.exercises.map((block) => ({
      block,
      sets: map.get(block.id) ?? [],
    }))
  }, [data])

  if (data === undefined) {
    return <p className="py-16 text-center text-[13px] text-ink3">加载中…</p>
  }
  if (data === null) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-16 text-center">
        <p className="text-[15px] font-medium text-ink">训练不存在</p>
        <Button className="mt-4" onClick={() => navigate('/')}>
          返回今日
        </Button>
      </div>
    )
  }
  if (data.bundle.session.status === 'completed') {
    return <Navigate to={`/session/${id}/summary`} replace />
  }

  const { session } = data.bundle
  const totalSets = data.bundle.sets.length
  const doneSets = data.bundle.sets.filter((set) => set.completed).length
  const incomplete = totalSets - doneSets

  async function handleSetChange(setId: string, patch: { weightKg?: number; reps?: number }) {
    try {
      await updateSet(setId, patch)
    } catch {
      toast('保存失败，请重试')
    }
  }

  async function toggleCompleted(setId: string, completed: boolean) {
    try {
      await updateSet(setId, { completed })
    } catch {
      toast('保存失败，请重试')
    }
  }

  async function handleAddSet(block: SessionExercise) {
    try {
      await addSet(block.id)
    } catch {
      toast('添加失败，请重试')
    }
  }

  async function handleToggleSkip(block: SessionExercise) {
    try {
      await setExerciseSkipped(block.id, !block.skipped)
    } catch {
      toast('操作失败，请重试')
    }
  }

  async function handleAddExercise(exerciseId: string) {
    setPickerOpen(false)
    try {
      await addExerciseToSession(session.id, exerciseId, 3)
      toast('已加入动作')
    } catch {
      toast('添加失败，请重试')
    }
  }

  async function finishKeep() {
    if (busy) return
    setBusy(true)
    try {
      await completeSession(session.id)
      if (doneSets === 0) toast('本次没有完成组，已记录为空训练')
      navigate(`/session/${session.id}/summary`, { replace: true })
    } catch {
      toast('结束训练失败，请重试')
      setBusy(false)
    }
  }

  async function discard() {
    if (busy) return
    setBusy(true)
    try {
      await deleteSession(session.id)
      toast('已丢弃本次训练')
      navigate('/', { replace: true })
    } catch {
      toast('删除失败，请重试')
      setBusy(false)
    }
  }

  function requestEnd() {
    if (incomplete > 0) {
      setEndOpen(true)
      return
    }
    void finishKeep()
  }

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="关闭训练"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 active:bg-soft"
          >
            <CloseIcon size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">
              {session.templateNameSnapshot}
            </p>
            <p className="text-[11px] text-ink3">
              {session.date === todayKey() ? '今天' : formatDateLabel(session.date)} · 已练{' '}
              {doneSets}/{totalSets} 组
            </p>
          </div>
          <Button size="sm" onClick={requestEnd} disabled={busy}>
            {busy ? '结束中…' : '结束训练'}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-[640px] space-y-3 px-4 py-4">
        {groups.map(({ block, sets }) => {
          const hint = data.hints[block.exerciseId]
          return (
            <section
              key={block.id}
              className={cx(
                'rounded-card bg-white p-4 shadow-card',
                block.skipped && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="text-[15px] font-semibold text-ink">
                      {block.exerciseNameSnapshot}
                    </h2>
                    <span className="rounded-full bg-soft px-1.5 py-0.5 text-[10px] text-ink3">
                      {block.categorySnapshot}
                    </span>
                    {block.skipped ? (
                      <span className="rounded-full bg-[#FFF4E5] px-1.5 py-0.5 text-[10px] text-[#B45309]">
                        已跳过
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12px] text-ink3">
                    {hint
                      ? `上次 ${toDisplayWeight(hint.weightKg, unit)}${unitLabel(unit)} × ${hint.reps} · ${hint.sets} 组`
                      : '首次记录'}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[28px_1fr_1fr_36px] items-center gap-2 px-1 text-[10px] text-ink3">
                  <span>组</span>
                  <span className="text-center">重量 {unitLabel(unit)}</span>
                  <span className="text-center">次数</span>
                  <span className="text-center">完成</span>
                </div>
                {sets.map((set) => (
                  <div
                    key={set.id}
                    className="grid grid-cols-[28px_1fr_1fr_36px] items-center gap-2"
                  >
                    <span className="text-center text-[12px] text-ink3 tnum">{set.setIndex}</span>
                    <NumberField
                      value={set.weightKg ? toDisplayWeight(set.weightKg, unit) : null}
                      min={0}
                      max={unit === 'lb' ? 1100 : 500}
                      ariaLabel={`${block.exerciseNameSnapshot} 第 ${set.setIndex} 组重量`}
                      onChange={(value) =>
                        handleSetChange(set.id, { weightKg: toKg(value ?? 0, unit) })
                      }
                    />
                    <NumberField
                      value={set.reps || null}
                      min={1}
                      max={100}
                      ariaLabel={`${block.exerciseNameSnapshot} 第 ${set.setIndex} 组次数`}
                      onChange={(value) => handleSetChange(set.id, { reps: value ?? 0 })}
                    />
                    <button
                      type="button"
                      onClick={() => toggleCompleted(set.id, !set.completed)}
                      aria-label={`${block.exerciseNameSnapshot} 第 ${set.setIndex} 组完成状态`}
                      aria-pressed={set.completed}
                      className={cx(
                        'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                        set.completed
                          ? 'bg-brand text-white'
                          : 'bg-soft text-ink3 active:bg-line',
                      )}
                    >
                      <CheckIcon size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleAddSet(block)}>
                  ＋ 加一组
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggleSkip(block)}>
                  {block.skipped ? '恢复该动作' : '跳过该动作'}
                </Button>
              </div>
            </section>
          )
        })}

        {groups.length === 0 ? (
          <div className="rounded-card bg-white p-6 text-center shadow-card">
            <p className="text-[14px] text-ink">还没有动作</p>
            <p className="mt-1 text-[12px] text-ink3">点下方「临时加动作」开始记录。</p>
          </div>
        ) : null}
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] gap-2 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button variant="secondary" fullWidth onClick={() => setPickerOpen(true)}>
            <PlusIcon size={16} /> 临时加动作
          </Button>
          <Button fullWidth onClick={requestEnd} disabled={busy}>
            结束训练
          </Button>
        </div>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handleAddExercise}
        title="临时加动作"
      />

      <Sheet
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title="还有未完成的组"
        footer={
          <Button fullWidth onClick={() => setEndOpen(false)} variant="secondary">
            继续训练
          </Button>
        }
      >
        <p className="text-[13px] leading-6 text-ink2">
          还有 {incomplete} 组没有勾选完成。结束训练会保留这些组的数据，但不会计入组数与容量；
          丢弃则删除本次训练及全部已填内容。
        </p>
        <div className="mt-4 space-y-2">
          <Button fullWidth onClick={finishKeep} disabled={busy}>
            {busy ? '处理中…' : '结束并保留未完成组'}
          </Button>
          <Button
            fullWidth
            variant="danger"
            onClick={() => {
              setEndOpen(false)
              setConfirmDiscard(true)
            }}
          >
            丢弃本次训练
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="确定丢弃本次训练？"
        footer={
          <div className="flex gap-2">
            <Button fullWidth variant="secondary" onClick={() => setConfirmDiscard(false)}>
              取消
            </Button>
            <Button fullWidth variant="danger" onClick={discard} disabled={busy}>
              确认丢弃
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-6 text-ink2">
          本次已填写的 {doneSets} 组数据会被永久删除，无法恢复。
        </p>
      </Sheet>
    </div>
  )
}
