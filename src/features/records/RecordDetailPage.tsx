import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../../db/schema'
import {
  addExerciseToSession,
  addSet,
  deleteSession,
  deleteSessionExercise,
  deleteSet,
  findPreviousSession,
  getSessionBundle,
  recalcSessionTotals,
  updateSession,
  updateSet,
} from '../../db/repo/sessions'
import type { SessionExercise } from '../../db/types'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { ConfirmDialog } from '../../components/ui/Sheet'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { ExercisePicker } from '../plan/ExercisePicker'
import {
  ArrowLeftIcon,
  CheckIcon,
  DumbbellIcon,
  PlusIcon,
  TrashIcon,
} from '../../components/icons'
import { formatDateLabel, formatDuration, todayKey } from '../../lib/date'
import { formatWeight, totalVolume } from '../../lib/metrics'
import { toDisplayWeight, toKg, unitLabel } from '../../lib/units'
import { useUnit } from '../../lib/useUnit'
import { cx } from '../../lib/cx'

export function RecordDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const unit = useUnit()
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deleteRecordOpen, setDeleteRecordOpen] = useState(false)
  const [deleteBlock, setDeleteBlock] = useState<SessionExercise | null>(null)
  const [deleteSetId, setDeleteSetId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const data = useLiveQuery(async () => {
    const bundle = await getSessionBundle(id!)
    if (!bundle) return null
    const previous = await findPreviousSession(bundle.session)
    const exerciseIds = [...new Set(bundle.exercises.map((block) => block.exerciseId))]
    const relatedBlocks = exerciseIds.length
      ? await db.sessionExercises.where('exerciseId').anyOf(exerciseIds).toArray()
      : []
    const relatedSets = relatedBlocks.length
      ? await db.setEntries
          .where('sessionExerciseId')
          .anyOf(relatedBlocks.map((block) => block.id))
          .toArray()
      : []
    const relatedSessions = await db.sessions.bulkGet([
      ...new Set(relatedBlocks.map((block) => block.sessionId)),
    ])
    const completedSessions = new Set(
      relatedSessions
        .filter((session) => session?.status === 'completed')
        .map((session) => session!.id),
    )
    const blockMap = new Map(relatedBlocks.map((block) => [block.id, block]))
    const maxByExercise: Record<string, number> = {}
    for (const set of relatedSets) {
      if (!set.completed) continue
      const block = blockMap.get(set.sessionExerciseId)
      if (!block || !completedSessions.has(block.sessionId)) continue
      maxByExercise[block.exerciseId] = Math.max(
        maxByExercise[block.exerciseId] ?? 0,
        set.weightKg,
      )
    }
    return { bundle, previous, maxByExercise }
  }, [id])

  const groups = useMemo(() => {
    if (!data) return []
    return data.bundle.exercises.map((block) => {
      const sets = data.bundle.sets
        .filter((set) => set.sessionExerciseId === block.id)
        .sort((a, b) => a.setIndex - b.setIndex)
      const completed = sets.filter((set) => set.completed)
      const best = completed.reduce<number>(
        (max, set) => Math.max(max, set.weightKg),
        0,
      )
      return { block, sets, best, volume: totalVolume(sets) }
    })
  }, [data])

  const [dateDraft, setDateDraft] = useState('')
  useEffect(() => {
    if (data) setDateDraft(data.bundle.session.date)
  }, [data])

  if (data === undefined) {
    return <p className="py-16 text-center text-[13px] text-ink3">加载中…</p>
  }
  if (data === null) {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate('/records')}
          aria-label="返回"
          className="mb-2 flex h-10 w-10 items-center justify-center rounded-full text-ink2 active:bg-soft"
        >
          <ArrowLeftIcon size={22} />
        </button>
        <EmptyState
          icon={<DumbbellIcon size={22} />}
          title="记录不存在"
          description="这条记录可能已被删除。"
          action={<Button onClick={() => navigate('/records')}>返回记录列表</Button>}
        />
      </div>
    )
  }

  const { session, exercises, sets } = data.bundle
  const volume = Math.round(toDisplayWeight(totalVolume(sets), unit))
  const doneSets = sets.filter((set) => set.completed).length
  const previous = data.previous
  const diff =
    previous && previous.totalVolume > 0
      ? Math.round(((totalVolume(sets) - previous.totalVolume) / previous.totalVolume) * 100)
      : null

  async function handleChangeDate(value: string) {
    if (!value || value > todayKey()) {
      toast('训练日期不能晚于今天')
      return
    }
    try {
      await updateSession(session.id, { date: value })
      setDateDraft(value)
    } catch {
      toast('修改日期失败')
    }
  }

  async function handleSave() {
    if (busy) return
    setBusy(true)
    try {
      await recalcSessionTotals(session.id)
      setEditing(false)
      toast('记录已更新')
    } catch {
      toast('保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteRecord() {
    if (busy) return
    setBusy(true)
    try {
      await deleteSession(session.id)
      toast('记录已删除')
      navigate('/records', { replace: true })
    } catch {
      toast('删除失败，请重试')
      setBusy(false)
    }
  }

  async function handleDeleteBlock() {
    if (!deleteBlock) return
    try {
      await deleteSessionExercise(deleteBlock.id)
      await recalcSessionTotals(session.id)
      toast('已删除该动作')
    } catch {
      toast('删除失败，请重试')
    } finally {
      setDeleteBlock(null)
    }
  }

  async function handleDeleteSet() {
    if (!deleteSetId) return
    try {
      await deleteSet(deleteSetId)
      await recalcSessionTotals(session.id)
      toast('已删除该组')
    } catch {
      toast('删除失败，请重试')
    } finally {
      setDeleteSetId(null)
    }
  }

  async function handleAddExercise(exerciseId: string) {
    setPickerOpen(false)
    try {
      await addExerciseToSession(session.id, exerciseId, 3)
      toast('已添加动作，记得填写数值')
    } catch {
      toast('添加失败，请重试')
    }
  }

  async function handleAddSet(block: SessionExercise) {
    try {
      await addSet(block.id)
    } catch {
      toast('添加失败，请重试')
    }
  }

  return (
    <div className="pb-10">
      <header className="mb-4 flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => navigate('/records')}
          aria-label="返回"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink2 active:bg-soft"
        >
          <ArrowLeftIcon size={22} />
        </button>
        <h1 className="flex-1 text-[17px] font-semibold text-ink">记录详情</h1>
        {editing ? (
          <Button size="sm" onClick={handleSave} disabled={busy}>
            {busy ? '保存中' : '保存'}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            编辑
          </Button>
        )}
      </header>

      <section className="rounded-card bg-white p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] text-ink3">
              {formatDateLabel(session.date)} ·{' '}
              {session.durationSec ? formatDuration(session.durationSec) : '未记录时长'}
            </p>
            <h2 className="mt-1 text-[19px] font-semibold text-ink">
              {session.templateNameSnapshot}
            </h2>
          </div>
          <span className="rounded-full bg-brandsoft px-2 py-0.5 text-[11px] text-brand">
            {session.status === 'completed' ? '已完成' : '草稿'}
          </span>
        </div>

        {editing ? (
          <div className="mt-3">
            <label className="mb-1 block text-[12px] text-ink3" htmlFor="record-date">
              训练日期
            </label>
            <input
              id="record-date"
              type="date"
              value={dateDraft}
              max={todayKey()}
              onChange={(e) => handleChangeDate(e.target.value)}
              className="h-11 w-full rounded-field bg-soft px-3 text-[14px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
            />
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-field bg-soft py-3 text-center">
          <div>
            <p className="text-[18px] font-semibold text-ink tnum">{doneSets}</p>
            <p className="text-[10px] text-ink3">完成组数</p>
          </div>
          <div>
            <p className="text-[18px] font-semibold text-ink tnum">{volume}</p>
            <p className="text-[10px] text-ink3">总容量 {unitLabel(unit)}</p>
          </div>
          <div>
            <p className="text-[18px] font-semibold text-ink tnum">{exercises.length}</p>
            <p className="text-[10px] text-ink3">动作数</p>
          </div>
        </div>

        {previous ? (
          <p className="mt-3 text-[12px] text-ink2">
            与上次同模板相比：
            {diff === null ? (
              <span className="text-ink3">上次没有有效容量</span>
            ) : diff === 0 ? (
              <span>持平</span>
            ) : (
              <span className={diff > 0 ? 'font-medium text-brand' : 'font-medium text-danger'}>
                {diff > 0 ? '↑' : '↓'} {Math.abs(diff)}%
              </span>
            )}
          </p>
        ) : (
          <p className="mt-3 text-[12px] text-ink3">这是这套模板的第一次记录</p>
        )}
      </section>

      <div className="mt-3 space-y-3">
        {groups.map(({ block, sets: blockSets, best, volume: blockVolume }) => {
          const historicalMax = data.maxByExercise[block.exerciseId] ?? 0
          return (
            <section key={block.id} className="rounded-card bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-[15px] font-semibold text-ink">
                      {block.exerciseNameSnapshot}
                    </h3>
                    <span className="rounded-full bg-soft px-1.5 py-0.5 text-[10px] text-ink3">
                      {block.categorySnapshot}
                    </span>
                    {best === historicalMax && best > 0 ? (
                      <span className="rounded-full bg-brandsoft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                        PR
                      </span>
                    ) : best > 0 ? (
                      <span className="rounded-full bg-soft px-1.5 py-0.5 text-[10px] text-ink3">
                        本次最佳 {formatWeight(toDisplayWeight(best, unit))}
                        {unitLabel(unit)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-ink3">
                    {blockSets.filter((set) => set.completed).length} 组 ·{' '}
                    {Math.round(toDisplayWeight(blockVolume, unit))} {unitLabel(unit)}
                  </p>
                </div>
                {editing ? (
                  <button
                    type="button"
                    onClick={() => setDeleteBlock(block)}
                    aria-label={`删除动作：${block.exerciseNameSnapshot}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-danger active:bg-soft"
                  >
                    <TrashIcon size={16} />
                  </button>
                ) : null}
              </div>

              <div className="mt-3 space-y-2">
                {blockSets.map((set) => (
                  <div
                    key={set.id}
                    className={cx(
                      'grid items-center gap-2',
                      editing ? 'grid-cols-[28px_1fr_1fr_32px_32px]' : 'grid-cols-[28px_1fr_1fr_32px]',
                    )}
                  >
                    <span className="text-center text-[12px] text-ink3 tnum">{set.setIndex}</span>
                    {editing ? (
                      <>
                        <NumberField
                          value={set.weightKg ? toDisplayWeight(set.weightKg, unit) : null}
                          min={0}
                          max={unit === 'lb' ? 1100 : 500}
                          ariaLabel={`${block.exerciseNameSnapshot} 第 ${set.setIndex} 组重量`}
                          onChange={(value) =>
                            updateSet(set.id, { weightKg: toKg(value ?? 0, unit) }).catch(() =>
                              toast('保存失败'),
                            )
                          }
                        />
                        <NumberField
                          value={set.reps || null}
                          min={1}
                          max={100}
                          ariaLabel={`${block.exerciseNameSnapshot} 第 ${set.setIndex} 组次数`}
                          onChange={(value) =>
                            updateSet(set.id, { reps: value ?? 0 }).catch(() =>
                              toast('保存失败'),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateSet(set.id, { completed: !set.completed }).catch(() =>
                              toast('保存失败'),
                            )
                          }
                          aria-label={`${block.exerciseNameSnapshot} 第 ${set.setIndex} 组完成状态`}
                          aria-pressed={set.completed}
                          className={cx(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            set.completed
                              ? 'bg-brand text-white'
                              : 'bg-soft text-ink3',
                          )}
                        >
                          <CheckIcon size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteSetId(set.id)}
                          aria-label={`删除第 ${set.setIndex} 组`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink3 active:bg-soft"
                        >
                          <TrashIcon size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className={cx(
                            'rounded-field py-2 text-center text-[13px] tnum',
                            set.completed ? 'bg-soft text-ink' : 'bg-soft/60 text-ink3',
                          )}
                        >
                          {formatWeight(toDisplayWeight(set.weightKg, unit))}
                          {unitLabel(unit)}
                        </span>
                        <span
                          className={cx(
                            'rounded-field py-2 text-center text-[13px] tnum',
                            set.completed ? 'bg-soft text-ink' : 'bg-soft/60 text-ink3',
                          )}
                        >
                          × {set.reps}
                        </span>
                        <span className="text-center">
                          {set.completed ? (
                            <CheckIcon size={16} className="mx-auto text-brand" />
                          ) : (
                            <span className="text-[10px] text-ink3">未完成</span>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {editing ? (
                <div className="mt-3">
                  <Button variant="secondary" size="sm" onClick={() => handleAddSet(block)}>
                    ＋ 加一组
                  </Button>
                </div>
              ) : null}
            </section>
          )
        })}

        {groups.length === 0 ? (
          <div className="rounded-card bg-white shadow-card">
            <EmptyState
              icon={<DumbbellIcon size={22} />}
              title="这次训练没有动作"
              description="可以在编辑模式里添加动作和组。"
              action={
                editing ? (
                  <Button onClick={() => setPickerOpen(true)}>添加动作</Button>
                ) : (
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    编辑记录
                  </Button>
                )
              }
            />
          </div>
        ) : null}
      </div>

      {editing ? (
        <Button
          className="mt-3"
          variant="secondary"
          fullWidth
          onClick={() => setPickerOpen(true)}
        >
          <PlusIcon size={16} /> 添加动作
        </Button>
      ) : null}

      {session.status === 'completed' ? (
        <Button
          className="mt-4"
          variant="ghost"
          fullWidth
          onClick={() => setDeleteRecordOpen(true)}
        >
          删除记录
        </Button>
      ) : (
        <Button
          className="mt-4"
          variant="ghost"
          fullWidth
          onClick={() => navigate(`/session/${session.id}`)}
        >
          继续这次训练
        </Button>
      )}

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handleAddExercise}
      />

      <ConfirmDialog
        open={deleteRecordOpen}
        title="删除这条记录？"
        description="训练及其所有组数据会被永久删除，统计会同步减少。"
        confirmText="删除"
        onCancel={() => setDeleteRecordOpen(false)}
        onConfirm={handleDeleteRecord}
      />

      <ConfirmDialog
        open={deleteBlock !== null}
        title={`删除「${deleteBlock?.exerciseNameSnapshot ?? ''}」？`}
        description="该动作下的所有组都会一起删除，汇总会立即重算。"
        confirmText="删除"
        onCancel={() => setDeleteBlock(null)}
        onConfirm={handleDeleteBlock}
      />

      <ConfirmDialog
        open={deleteSetId !== null}
        title="删除这一组？"
        description="删除后组号会自动重排，汇总会立即重算。"
        confirmText="删除"
        onCancel={() => setDeleteSetId(null)}
        onConfirm={handleDeleteSet}
      />
    </div>
  )
}
