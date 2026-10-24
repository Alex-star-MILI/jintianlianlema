import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../db/schema'
import { listCompletedSessions } from '../../db/repo/sessions'
import { getGoals, listBodyWeights, listCalorieLogs, listStrengthGoals } from '../../db/repo/health'
import type { ExerciseCategory } from '../../db/types'
import { PageHeader } from '../../components/ui/PageHeader'
import { Card, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ChartIcon, FlameIcon, ScaleIcon, TrendUpIcon } from '../../components/icons'
import {
  calorieSeries,
  categoryDistribution,
  countSetsByDate,
  exercisePR,
  heatmapWeeks,
  resolveRange,
  strengthSeries,
  volumeSeries,
  weeklyTrainingCounts,
  weightSeries,
  type RangeKey,
} from '../../lib/stats'
import { todayKey } from '../../lib/date'
import { formatWeight } from '../../lib/metrics'
import { toDisplayWeight, unitLabel } from '../../lib/units'
import { useUnit } from '../../lib/useUnit'
import { cx } from '../../lib/cx'

const GREEN = '#22A06B'
const GREEN_SOFT = '#9BDCC1'
const GRAY = '#9CA3AF'
const GRID = '#EEF0F2'

const CATEGORY_COLORS: Record<ExerciseCategory, string> = {
  胸: '#22A06B',
  背: '#4F9CF9',
  腿: '#F2A93B',
  肩: '#8B7CF6',
  手臂: '#E56B6F',
  核心: '#2FB5A8',
  其他: '#9CA3AF',
}

const HEATMAP_COLORS = ['#F3F4F6', '#C9EBDC', '#74CFA9', '#22A06B']

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'quarter', label: '近3月' },
  { key: 'all', label: '全部' },
]

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #EEF0F2',
  fontSize: 12,
  boxShadow: '0 4px 16px rgba(17,24,39,0.06)',
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="flex rounded-full bg-soft p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-full px-2.5 py-1 text-[11px] transition-colors',
            value === option.value
              ? 'bg-white font-medium text-ink shadow-sm'
              : 'text-ink3',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function StatsPage() {
  const today = todayKey()
  const unit = useUnit()
  const [rangeKey, setRangeKey] = useState<RangeKey>('month')
  const [metric, setMetric] = useState<'volume' | 'sets'>('volume')
  const [aggregate, setAggregate] = useState<'session' | 'week'>('session')
  const [exerciseId, setExerciseId] = useState('')

  const data = useLiveQuery(async () => {
    const [sessions, blocks, sets, exercises, goals, strengthGoals, weights, calories] =
      await Promise.all([
        listCompletedSessions(),
        db.sessionExercises.toArray(),
        db.setEntries.toArray(),
        db.exercises.toArray(),
        getGoals(),
        listStrengthGoals(),
        listBodyWeights(),
        listCalorieLogs(),
      ])
    return { sessions, blocks, sets, exercises, goals, strengthGoals, weights, calories }
  }, [])

  const range = useMemo(() => resolveRange(rangeKey, today), [rangeKey, today])

  const exerciseOptions = useMemo(() => {
    if (!data) return []
    const completedIds = new Set(data.sessions.map((session) => session.id))
    const seen = new Map<string, string>()
    for (const block of data.blocks) {
      if (!completedIds.has(block.sessionId)) continue
      if (!seen.has(block.exerciseId)) seen.set(block.exerciseId, block.exerciseNameSnapshot)
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  }, [data])

  useEffect(() => {
    if (exerciseId || exerciseOptions.length === 0) return
    setExerciseId(exerciseOptions[0].id)
  }, [exerciseId, exerciseOptions])

  const activeExerciseId = exerciseOptions.some((option) => option.id === exerciseId)
    ? exerciseId
    : exerciseOptions[0]?.id ?? ''

  const counts = useMemo(
    () => (data ? countSetsByDate(data.sessions, data.blocks, data.sets) : {}),
    [data],
  )
  const weeks = useMemo(() => heatmapWeeks(counts, today), [counts, today])
  const weekly = useMemo(
    () => (data ? weeklyTrainingCounts(data.sessions, range) : []),
    [data, range],
  )
  const volumes = useMemo(
    () => (data ? volumeSeries(data.sessions, range, metric, aggregate) : []),
    [data, range, metric, aggregate],
  )
  const strength = useMemo(
    () =>
      data && activeExerciseId
        ? strengthSeries(data.sessions, data.blocks, data.sets, activeExerciseId, range)
        : [],
    [data, activeExerciseId, range],
  )
  const pr = useMemo(
    () =>
      data && activeExerciseId
        ? exercisePR(data.sessions, data.blocks, data.sets, activeExerciseId)
        : { pr: 0, bestOneRepMax: 0 },
    [data, activeExerciseId],
  )
  const distribution = useMemo(
    () =>
      data
        ? categoryDistribution(data.sessions, data.blocks, data.sets, today, 30)
        : { slices: [], stale: [], totalSets: 0 },
    [data, today],
  )
  const weights = useMemo(
    () => (data ? weightSeries(data.weights, range) : []),
    [data, range],
  )
  const calories = useMemo(
    () => (data ? calorieSeries(data.calories, range) : []),
    [data, range],
  )

  const displayVolumes = useMemo(
    () =>
      metric === 'volume'
        ? volumes.map((point) => ({ ...point, value: toDisplayWeight(point.value, unit) }))
        : volumes,
    [volumes, metric, unit],
  )
  const displayStrength = useMemo(
    () =>
      strength.map((point) => ({
        ...point,
        maxWeight: toDisplayWeight(point.maxWeight, unit),
        oneRepMax: toDisplayWeight(point.oneRepMax, unit),
      })),
    [strength, unit],
  )
  const displayWeights = useMemo(
    () => weights.map((point) => ({ ...point, weight: toDisplayWeight(point.weight, unit) })),
    [weights, unit],
  )

  if (!data) {
    return <p className="py-16 text-center text-[13px] text-ink3">加载中…</p>
  }

  const target = data.goals.weeklySessionTarget
  const weightTarget = data.goals.weightTargetKg
  const strengthTarget = data.strengthGoals.find(
    (goal) => goal.exerciseId === activeExerciseId,
  )
  const latestWeight = weights[weights.length - 1]?.weight
  const hasAnyTraining = data.sessions.length > 0

  return (
    <div className="pb-10">
      <PageHeader title="统计" subtitle="数据只来自你真实记录的训练" />

      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setRangeKey(option.key)}
            className={cx(
              'h-8 shrink-0 rounded-full px-3.5 text-[13px] transition-colors',
              rangeKey === option.key
                ? 'bg-brand text-white'
                : 'bg-soft text-ink2',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardTitle right={<span className="text-[10px] text-ink3">按每日完成组数分档</span>}>
            训练频率与打卡
          </CardTitle>
          {!hasAnyTraining ? (
            <EmptyState
              icon={<ChartIcon size={22} />}
              title="还没有训练记录"
              description="完成一次训练后，这里会出现热力图与每周次数。"
              className="py-6"
            />
          ) : (
            <>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {weeks.map((week, index) => (
                  <div key={index} className="flex shrink-0 flex-col gap-1">
                    {week.map((day, dayIndex) => (
                      <div
                        key={dayIndex}
                        title={day ? `${day.date} · ${day.count} 组` : ''}
                        className="h-3 w-3 rounded-[3px]"
                        style={{
                          backgroundColor: day
                            ? HEATMAP_COLORS[day.level]
                            : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-ink3">近 3 个月</span>
                <span className="flex items-center gap-1 text-[10px] text-ink3">
                  少
                  {HEATMAP_COLORS.map((color) => (
                    <span
                      key={color}
                      className="h-2.5 w-2.5 rounded-[2px]"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  多
                </span>
              </div>

              <div className="mt-3 h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly} margin={{ top: 8, right: 6, bottom: 0, left: -22 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [`${value} 次`, '已完成训练']}
                      labelFormatter={(label) => `${label} 当周`}
                    />
                    <ReferenceLine
                      y={target}
                      stroke={GRAY}
                      strokeDasharray="4 4"
                      label={{ value: `目标 ${target}`, position: 'insideTopRight', fontSize: 10, fill: '#9CA3AF' }}
                    />
                    <Bar dataKey="count" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11px] text-ink3">按周一至周日统计已完成训练次数</p>
            </>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle
            right={
              <div className="flex items-center gap-1.5">
                <Segmented
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: 'volume', label: '总重量' },
                    { value: 'sets', label: '总组数' },
                  ]}
                />
                <Segmented
                  value={aggregate}
                  onChange={setAggregate}
                  options={[
                    { value: 'session', label: '按次' },
                    { value: 'week', label: '按周' },
                  ]}
                />
              </div>
            }
          >
            训练容量趋势
          </CardTitle>
          {volumes.length < 2 ? (
            <p className="py-8 text-center text-[13px] text-ink3">
              {volumes.length === 0 ? '所选范围内还没有训练记录' : '再记录 1 次即可查看趋势'}
            </p>
          ) : (
            <>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayVolumes} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [
                        metric === 'volume'
                          ? `${value} ${unitLabel(unit)}`
                          : `${value} 组`,
                        metric === 'volume' ? '总容量' : '总组数',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={GREEN}
                      strokeWidth={2}
                      dot={{ r: 3, fill: GREEN, strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11px] text-ink3">总容量 = Σ(重量 × 次数)，仅统计已完成组</p>
            </>
          )}
        </Card>

        <Card>
          <CardTitle right={<span className="text-[10px] text-ink3">Epley 估算 1RM</span>}>
            动作力量曲线
          </CardTitle>
          {exerciseOptions.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink3">完成训练后可查看动作力量</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <select
                  value={activeExerciseId}
                  onChange={(e) => setExerciseId(e.target.value)}
                  aria-label="选择动作"
                  className="h-9 max-w-[60%] rounded-field bg-soft px-2 text-[13px] text-ink outline-none"
                >
                  {exerciseOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <span className="text-right text-[11px] text-ink3">
                  PR{' '}
                  <span className="font-semibold text-ink tnum">
                    {formatWeight(toDisplayWeight(pr.pr, unit))}
                    {unitLabel(unit)}
                  </span>
                </span>
              </div>
              {strength.length < 2 ? (
                <p className="py-8 text-center text-[13px] text-ink3">
                  {strength.length === 0 ? '所选范围内还没有该动作记录' : '再记录 1 次即可查看趋势'}
                </p>
              ) : (
                <>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={displayStrength} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value) => [`${value} ${unitLabel(unit)}`]}
                        />
                        {strengthTarget ? (
                          <ReferenceLine
                            y={toDisplayWeight(strengthTarget.targetWeightKg, unit)}
                            stroke={GRAY}
                            strokeDasharray="4 4"
                            label={{ value: '目标', position: 'insideTopRight', fontSize: 10, fill: '#9CA3AF' }}
                          />
                        ) : null}
                        <Line
                          type="monotone"
                          dataKey="maxWeight"
                          name="最大重量"
                          stroke={GREEN}
                          strokeWidth={2}
                          dot={{ r: 3, fill: GREEN, strokeWidth: 0 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="oneRepMax"
                          name="估算 1RM"
                          stroke={GREEN_SOFT}
                          strokeWidth={1.8}
                          strokeDasharray="5 4"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-[11px] text-ink3">
                    PR 取该动作历史最大单组重量 · 估算 1RM{' '}
                    {formatWeight(toDisplayWeight(pr.bestOneRepMax, unit))}
                    {unitLabel(unit)}
                  </p>
                </>
              )}
            </>
          )}
        </Card>

        <Card>
          <CardTitle right={<span className="text-[10px] text-ink3">近 30 天按已完成组</span>}>
            部位均衡
          </CardTitle>
          {distribution.totalSets === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink3">近 30 天还没有完成的组</p>
          ) : (
            <>
              <div className="h-[170px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution.slices}
                      dataKey="sets"
                      nameKey="category"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {distribution.slices.map((slice) => (
                        <Cell
                          key={slice.category}
                          fill={CATEGORY_COLORS[slice.category] ?? GRAY}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [`${value} 组`]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {distribution.slices.map((slice) => (
                  <span key={slice.category} className="flex items-center gap-1 text-[11px] text-ink2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[slice.category] ?? GRAY }}
                    />
                    {slice.category} {slice.percent}%
                  </span>
                ))}
              </div>
              {distribution.stale.length > 0 ? (
                <p className="mt-2 rounded-field bg-[#FFF4E5] px-2.5 py-2 text-[11px] text-[#B45309]">
                  {distribution.stale
                    .slice(0, 3)
                    .map((item) => `${item.category} ${item.days} 天未练`)
                    .join(' · ')}
                </p>
              ) : null}
            </>
          )}
        </Card>

        <Card>
          <CardTitle
            right={
              <span className="text-[11px] text-ink3">
                {latestWeight !== undefined
                  ? `当前 ${formatWeight(toDisplayWeight(latestWeight, unit))}${unitLabel(unit)}`
                  : ''}
              </span>
            }
          >
            体重曲线
          </CardTitle>
          {weights.length < 2 ? (
            <EmptyState
              icon={<ScaleIcon size={22} />}
              title={weights.length === 0 ? '所选范围内还没有体重记录' : '再记录 1 次体重即可查看趋势'}
              description="可在今日页右上角或设置里记录体重。"
              className="py-6"
            />
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayWeights} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={['dataMin - 1', 'dataMax + 1']}
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [`${value} ${unitLabel(unit)}`]}
                  />
                  {weightTarget ? (
                    <ReferenceLine
                      y={toDisplayWeight(weightTarget, unit)}
                      stroke={GRAY}
                      strokeDasharray="4 4"
                      label={{ value: '目标', position: 'insideTopRight', fontSize: 10, fill: '#9CA3AF' }}
                    />
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke={GREEN}
                    strokeWidth={2}
                    dot={{ r: 3, fill: GREEN, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle right={<span className="text-[10px] text-ink3">含 7 日移动平均</span>}>
            热量趋势
          </CardTitle>
          {calories.length === 0 ? (
            <EmptyState
              icon={<FlameIcon size={22} />}
              title="所选范围内还没有热量记录"
              description="在今日页记录四餐热量，这里会出现每日柱状图。"
              className="py-6"
            />
          ) : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={calories} margin={{ top: 10, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} kcal`]} />
                    <Bar dataKey="total" name="当日合计" fill={GREEN_SOFT} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Line
                      type="monotone"
                      dataKey="movingAvg"
                      name="7 日均线"
                      stroke={GREEN}
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-ink3">
                <TrendUpIcon size={12} /> 无记录日不显示柱子
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
