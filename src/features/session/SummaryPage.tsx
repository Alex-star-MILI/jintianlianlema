import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { findPreviousSession, getSessionBundle } from '../../db/repo/sessions'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { CheckIcon, ClockIcon, CloseIcon, DumbbellIcon, TrendUpIcon } from '../../components/icons'
import { formatDateLabel, formatDuration } from '../../lib/date'
import { formatWeight, totalVolume } from '../../lib/metrics'
import { toDisplayWeight, unitLabel } from '../../lib/units'
import { useUnit } from '../../lib/useUnit'

export function SummaryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const unit = useUnit()

  const data = useLiveQuery(async () => {
    const bundle = await getSessionBundle(id!)
    if (!bundle) return null
    const previous = await findPreviousSession(bundle.session)
    return { bundle, previous }
  }, [id])

  const groups = useMemo(() => {
    if (!data) return []
    return data.bundle.exercises.map((block) => {
      const sets = data.bundle.sets.filter((set) => set.sessionExerciseId === block.id)
      return {
        block,
        sets: sets.sort((a, b) => a.setIndex - b.setIndex),
        volume: totalVolume(sets),
      }
    })
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

  const { session, sets } = data.bundle
  if (session.status === 'draft') {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-16 text-center">
        <p className="text-[15px] font-medium text-ink">这次训练还没有结束</p>
        <Button className="mt-4" onClick={() => navigate(`/session/${session.id}`)}>
          继续训练
        </Button>
      </div>
    )
  }

  const doneSets = sets.filter((set) => set.completed).length
  const volume = Math.round(session.totalVolume)
  const displayVolume = Math.round(toDisplayWeight(session.totalVolume, unit))
  const previous = data.previous
  const diff =
    previous && previous.totalVolume > 0
      ? Math.round(((volume - previous.totalVolume) / previous.totalVolume) * 100)
      : null

  return (
    <div className="mx-auto min-h-screen max-w-[640px] px-4 pb-10 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[12px] text-ink3">训练总结 · {formatDateLabel(session.date)}</p>
          <h1 className="mt-0.5 text-[22px] font-bold text-ink">{session.templateNameSnapshot}</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="关闭"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 active:bg-soft"
        >
          <CloseIcon size={20} />
        </button>
      </header>

      <section className="rounded-card bg-brand p-5 text-white">
        <p className="text-[12px] text-white/80">总容量</p>
        <p className="mt-1 text-[34px] font-bold leading-none tnum">
          {displayVolume}
          <span className="ml-1 text-[13px] font-normal text-white/80">{unitLabel(unit)}</span>
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/20 pt-3 text-center">
          <div>
            <p className="text-[17px] font-semibold tnum">{doneSets}</p>
            <p className="text-[11px] text-white/80">完成组数</p>
          </div>
          <div>
            <p className="text-[17px] font-semibold tnum">
              {formatDuration(session.durationSec ?? 0)}
            </p>
            <p className="text-[11px] text-white/80">训练时长</p>
          </div>
          <div>
            <p className="text-[17px] font-semibold tnum">{data.bundle.exercises.length}</p>
            <p className="text-[11px] text-white/80">动作数</p>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-card bg-white p-4 shadow-card">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brandsoft text-brand">
            <TrendUpIcon size={16} />
          </span>
          <div>
            {previous ? (
              diff === null ? (
                <p className="text-[13px] text-ink">上次这套模板没有有效容量，暂不对比</p>
              ) : diff === 0 ? (
                <p className="text-[13px] text-ink">总容量与上次持平</p>
              ) : (
                <p className="text-[13px] text-ink">
                  比上次{' '}
                  <span className={diff > 0 ? 'font-semibold text-brand' : 'font-semibold text-danger'}>
                    {diff > 0 ? '↑' : '↓'} {Math.abs(diff)}%
                  </span>{' '}
                  {diff > 0 ? '更多' : '更少'}
                </p>
              )
            ) : (
              <p className="text-[13px] text-ink">首次完成这套模板，继续保持</p>
            )}
            {previous ? (
              <p className="mt-0.5 text-[11px] text-ink3">
                上次 {formatDateLabel(previous.date)} ·{' '}
                {Math.round(toDisplayWeight(previous.totalVolume, unit))} {unitLabel(unit)}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-card bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">动作明细</h2>
          <span className="text-[11px] text-ink3">仅统计已完成组</span>
        </div>
        {groups.length === 0 ? (
          <EmptyState
            icon={<DumbbellIcon size={22} />}
            title="本次没有动作"
            description="空训练也会被保存，可稍后在记录里删除。"
            className="py-6"
          />
        ) : (
          <div className="divide-y divide-line">
            {groups.map(({ block, sets: blockSets, volume: blockVolume }) => {
              const completed = blockSets.filter((set) => set.completed)
              return (
                <div key={block.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-ink">
                        {block.exerciseNameSnapshot}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink3">
                        {block.categorySnapshot} · {completed.length} 组
                      </p>
                    </div>
                    <span className="shrink-0 text-[12px] text-ink2 tnum">
                      {Math.round(toDisplayWeight(blockVolume, unit))} {unitLabel(unit)}
                    </span>
                  </div>
                  {completed.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {completed.map((set) => (
                        <span
                          key={set.id}
                          className="inline-flex items-center gap-0.5 rounded-full bg-soft px-2 py-0.5 text-[11px] text-ink2 tnum"
                        >
                          <CheckIcon size={11} className="text-brand" />
                          {formatWeight(toDisplayWeight(set.weightKg, unit))}
                          {unitLabel(unit)} × {set.reps}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-ink3">没有完成的组</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" fullWidth onClick={() => navigate(`/records/${session.id}`)}>
          查看记录
        </Button>
        <Button fullWidth onClick={() => navigate('/')}>
          完成
        </Button>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-ink3">
        <ClockIcon size={13} /> 数据已保存到本机
      </p>
    </div>
  )
}
