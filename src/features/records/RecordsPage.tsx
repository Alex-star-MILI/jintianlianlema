import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../../db/schema'
import { listSessionsInMonth, getDraftForDate, startEmptySession, startSessionFromTemplate } from '../../db/repo/sessions'
import { listTemplates } from '../../db/repo/templates'
import type { TrainingSession } from '../../db/types'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/Toast'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
} from '../../components/icons'
import {
  formatDateLabel,
  formatDuration,
  monthLabel,
  parseDateKey,
  toDateKey,
  todayKey,
} from '../../lib/date'
import { toDisplayWeight, unitLabel } from '../../lib/units'
import { useUnit } from '../../lib/useUnit'

export function RecordsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const unit = useUnit()
  const [searchParams, setSearchParams] = useSearchParams()
  const [monthKey, setMonthKey] = useState(todayKey().slice(0, 7))
  const [keyword, setKeyword] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addDate, setAddDate] = useState(todayKey())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setAddOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const data = useLiveQuery(async () => {
    const [allSessions, templates] = await Promise.all([
      listSessionsInMonth(monthKey),
      listTemplates(),
    ])
    const sessions = allSessions.filter((session) => session.status === 'completed')
    const blocks = sessions.length
      ? await db.sessionExercises
          .where('sessionId')
          .anyOf(sessions.map((session) => session.id))
          .toArray()
      : []
    return { sessions, templates, blocks }
  }, [monthKey])

  const sessions = useMemo(() => {
    const list = data?.sessions ?? []
    const query = keyword.trim()
    if (!query) return list
    const matching = new Set(
      (data?.blocks ?? [])
        .filter((block) => block.exerciseNameSnapshot.includes(query))
        .map((block) => block.sessionId),
    )
    return list.filter((session) => matching.has(session.id))
  }, [data, keyword])

  const grouped = useMemo(() => {
    const map = new Map<string, TrainingSession[]>()
    for (const session of sessions) {
      const list = map.get(session.date) ?? []
      list.push(session)
      map.set(session.date, list)
    }
    return [...map.entries()]
  }, [sessions])

  const blockCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const block of data?.blocks ?? []) {
      map.set(block.sessionId, (map.get(block.sessionId) ?? 0) + 1)
    }
    return map
  }, [data])

  function shiftMonth(delta: number) {
    const base = parseDateKey(`${monthKey}-01`)
    const next = new Date(base.getFullYear(), base.getMonth() + delta, 1)
    setMonthKey(toDateKey(next).slice(0, 7))
  }

  async function startAdd(templateId: string | null) {
    if (busy) return
    setBusy(true)
    try {
      const existing = await getDraftForDate(addDate)
      if (existing) {
        toast('该日期已有未完成训练，已为你打开')
        setAddOpen(false)
        navigate(`/session/${existing.id}`)
        return
      }
      const id = templateId
        ? await startSessionFromTemplate(templateId, addDate)
        : await startEmptySession(addDate)
      setAddOpen(false)
      navigate(`/session/${id}`)
    } catch {
      toast('创建补记失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="记录"
        subtitle="每一次训练都留在这里"
        right={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon size={16} /> 补记
          </Button>
        }
      />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="上个月"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-soft text-ink2 active:bg-line"
        >
          <ChevronLeftIcon size={18} />
        </button>
        <span className="text-[14px] font-medium text-ink">{monthLabel(monthKey)}</span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="下个月"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-soft text-ink2 active:bg-line"
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      <div className="relative mt-3">
        <SearchIcon
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink3"
        />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜动作名，例如「深蹲」"
          aria-label="按动作搜索"
          className="h-11 w-full rounded-field bg-soft pl-10 pr-3 text-[14px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
        />
      </div>

      {!data ? (
        <p className="py-16 text-center text-[13px] text-ink3">加载中…</p>
      ) : sessions.length === 0 ? (
        <Card className="mt-3">
          <EmptyState
            icon={<ListIcon size={22} />}
            title={keyword.trim() ? '没有匹配的训练' : `${monthLabel(monthKey)}还没有训练记录`}
            description={
              keyword.trim()
                ? '换个动作名再试试，或清空搜索查看全部记录。'
                : '完成一次训练，或补记以前的训练。'
            }
            action={
              keyword.trim() ? (
                <Button variant="secondary" onClick={() => setKeyword('')}>
                  清空搜索
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setAddOpen(true)}>
                    补记训练
                  </Button>
                  <Button onClick={() => navigate('/')}>开始今天的训练</Button>
                </div>
              )
            }
          />
        </Card>
      ) : (
        <div className="mt-3 space-y-4">
          {grouped.map(([date, list]) => (
            <section key={date}>
              <h2 className="mb-2 px-1 text-[12px] font-medium text-ink3">
                {formatDateLabel(date)}
              </h2>
              <div className="space-y-2">
                {list.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => navigate(`/records/${session.id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-card bg-white p-4 text-left shadow-card active:bg-soft"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium text-ink">
                        {session.templateNameSnapshot}
                      </p>
                      <p className="mt-1 text-[12px] text-ink3">
                        {blockCount.get(session.id) ?? 0} 个动作 · {session.totalSets} 组
                        {session.durationSec
                          ? ` · ${formatDuration(session.durationSec)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <div className="text-right">
                        <p className="text-[15px] font-semibold text-ink tnum">
                          {Math.round(toDisplayWeight(session.totalVolume, unit))}
                        </p>
                        <p className="text-[10px] text-ink3">{unitLabel(unit)} 容量</p>
                      </div>
                      <ChevronRightIcon size={16} className="text-ink3" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="补记训练"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink3" htmlFor="record-date">
              训练日期
            </label>
            <input
              id="record-date"
              type="date"
              value={addDate}
              max={todayKey()}
              onChange={(e) => setAddDate(e.target.value || todayKey())}
              className="h-11 w-full rounded-field bg-soft px-3 text-[14px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 px-1 text-[11px] text-ink3">
              选择模板或自由训练后，会打开录入页面，填完结束即保存。
            </p>
          </div>

          <div className="space-y-2">
            {(data?.templates ?? []).map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => startAdd(template.id)}
                disabled={busy}
                className="w-full rounded-field bg-soft px-3 py-3 text-left active:bg-line disabled:opacity-50"
              >
                <span className="block text-[14px] text-ink">{template.name}</span>
                <span className="text-[11px] text-ink3">按模板开始补记</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => startAdd(null)}
              disabled={busy}
              className="w-full rounded-field bg-soft px-3 py-3 text-left active:bg-line disabled:opacity-50"
            >
              <span className="block text-[14px] text-ink">自由训练</span>
              <span className="text-[11px] text-ink3">从空训练开始，自行添加动作</span>
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
