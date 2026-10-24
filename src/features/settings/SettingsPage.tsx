import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, resetDatabase } from '../../db/schema'
import { getGoals, getLatestBodyWeight, updateGoals, updateSettings, upsertStrengthGoal, deleteStrengthGoal } from '../../db/repo/health'
import type { StrengthGoal, Unit } from '../../db/types'
import {
  APP_VERSION,
  downloadBackup,
  exportBackup,
  importBackup,
  summarizeBackup,
  validateBackup,
  type BackupFile,
  type BackupSummary,
} from '../../db/backup'
import { PageHeader, SectionLabel } from '../../components/ui/PageHeader'
import { Card, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Stepper, NumberField } from '../../components/ui/NumberField'
import { ConfirmDialog, Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/Toast'
import { ExercisePicker } from '../plan/ExercisePicker'
import { WeightPanel } from '../today/WeightPanel'
import {
  ChevronRightIcon,
  DumbbellIcon,
  InfoIcon,
  ScaleIcon,
  TargetIcon,
  TrashIcon,
} from '../../components/icons'
import { toDisplayWeight, toKg, unitLabel } from '../../lib/units'
import { useUnit } from '../../lib/useUnit'
import { formatWeight } from '../../lib/metrics'
import { formatDateLabel } from '../../lib/date'
import { cx } from '../../lib/cx'

interface GoalEditor {
  exerciseId: string
  name: string
  goalId?: string
  value: number | null
}

function backupTimeLabel(iso: string | null): string {
  if (!iso) return '还没有备份过'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '还没有备份过'
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(
    date.getHours(),
  ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function SettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const unit = useUnit()
  const fileRef = useRef<HTMLInputElement>(null)
  const [weightOpen, setWeightOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [goalEditor, setGoalEditor] = useState<GoalEditor | null>(null)
  const [goalToDelete, setGoalToDelete] = useState<StrengthGoal | null>(null)
  const [importPreview, setImportPreview] = useState<{
    file: BackupFile
    summary: BackupSummary
  } | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const data = useLiveQuery(async () => {
    const [settings, goals, strengthGoals, exercises, latestWeight, sessions, weights, calories] =
      await Promise.all([
        db.settings.get('settings'),
        getGoals(),
        db.strengthGoals.toArray(),
        db.exercises.toArray(),
        getLatestBodyWeight(),
        db.sessions.count(),
        db.bodyWeights.count(),
        db.calorieLogs.count(),
      ])
    return {
      settings,
      goals,
      strengthGoals,
      exercises,
      latestWeight,
      counts: { sessions, weights, calories },
    }
  }, [])

  if (!data) {
    return <p className="py-16 text-center text-[13px] text-ink3">加载中…</p>
  }

  const exerciseName = (exerciseId: string) =>
    data.exercises.find((exercise) => exercise.id === exerciseId)?.name ?? '已删除动作'

  async function handleUnitChange(next: Unit) {
    if (unit === next) return
    try {
      await updateSettings({ unit: next })
      toast(`已切换为 ${next}`)
    } catch {
      toast('切换失败，请重试')
    }
  }

  async function handleExport() {
    try {
      const file = await exportBackup()
      downloadBackup(file)
      toast('备份已导出')
    } catch {
      toast('导出失败，请重试')
    }
  }

  async function handleFilePicked(file: File) {
    try {
      const raw = JSON.parse(await file.text()) as unknown
      const result = validateBackup(raw)
      if (!result.ok) {
        toast(result.error)
        return
      }
      setImportPreview({ file: result.file, summary: summarizeBackup(result.file) })
    } catch {
      toast('文件不是有效的 JSON，未改动现有数据')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function confirmImport() {
    if (!importPreview || busy) return
    setBusy(true)
    try {
      await importBackup(importPreview.file)
      setImportPreview(null)
      toast('导入完成，数据已全量恢复')
    } catch {
      toast('导入失败，现有数据未改动')
    } finally {
      setBusy(false)
    }
  }

  async function confirmClear() {
    if (busy) return
    setBusy(true)
    try {
      await resetDatabase()
      toast('已清空全部数据')
      navigate('/welcome', { replace: true })
    } catch {
      toast('清空失败，请重试')
      setBusy(false)
    }
  }

  async function saveGoal() {
    if (!goalEditor || goalEditor.value === null || busy) return
    setBusy(true)
    try {
      await upsertStrengthGoal(goalEditor.exerciseId, toKg(goalEditor.value, unit))
      toast('力量目标已保存')
      setGoalEditor(null)
    } catch {
      toast('保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  async function removeGoal() {
    if (!goalToDelete) return
    try {
      await deleteStrengthGoal(goalToDelete.id)
      toast('已删除力量目标')
    } catch {
      toast('删除失败，请重试')
    } finally {
      setGoalToDelete(null)
    }
  }

  function openGoalForExercise(exerciseId: string) {
    if (!data) return
    setPickerOpen(false)
    const existing = data.strengthGoals.find((goal) => goal.exerciseId === exerciseId)
    setGoalEditor({
      exerciseId,
      name: exerciseName(exerciseId),
      goalId: existing?.id,
      value: existing ? toDisplayWeight(existing.targetWeightKg, unit) : null,
    })
  }

  return (
    <div className="pb-10">
      <PageHeader title="设置" subtitle="目标、单位与数据备份" />

      <SectionLabel>训练目标</SectionLabel>
      <Card>
        <CardTitle right={<span className="text-[11px] text-ink3">显示在今日页进度</span>}>
          每周训练次数
        </CardTitle>
        <Stepper
          value={data.goals.weeklySessionTarget}
          min={1}
          max={7}
          suffix="次 / 周"
          ariaLabel="每周训练次数目标"
          onChange={(value) => {
            updateGoals({ weeklySessionTarget: value }).catch(() => toast('保存失败'))
          }}
        />
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <div>
            <p className="text-[13px] text-ink">当前体重</p>
            <p className="mt-0.5 text-[11px] text-ink3">
              {data.latestWeight
                ? `${formatWeight(toDisplayWeight(data.latestWeight.weightKg, unit))} ${unitLabel(unit)} · ${formatDateLabel(data.latestWeight.date)}`
                : '还没有体重记录'}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setWeightOpen(true)}>
            <ScaleIcon size={15} /> 记录体重
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <div>
            <p className="text-[13px] text-ink">目标体重</p>
            <p className="mt-0.5 text-[11px] text-ink3">仅用于统计页目标线</p>
          </div>
          <div className="w-[130px]">
            <NumberField
              value={
                data.goals.weightTargetKg === null
                  ? null
                  : toDisplayWeight(data.goals.weightTargetKg, unit)
              }
              min={0}
              max={unit === 'lb' ? 1100 : 500}
              placeholder="选填"
              suffix={unitLabel(unit)}
              ariaLabel="目标体重"
              onChange={(value) =>
                updateGoals({ weightTargetKg: value === null ? null : toKg(value, unit) }).catch(
                  () => toast('保存失败'),
                )
              }
            />
          </div>
        </div>
      </Card>

      <SectionLabel>动作力量目标</SectionLabel>
      <Card>
        <CardTitle right={<span className="text-[11px] text-ink3">{data.strengthGoals.length} 个</span>}>
          目标重量
        </CardTitle>
        {data.strengthGoals.length === 0 ? (
          <p className="py-3 text-[13px] text-ink3">还没有设置力量目标，可为核心动作设一个。</p>
        ) : (
          <div className="divide-y divide-line">
            {data.strengthGoals.map((goal) => (
              <div key={goal.id} className="flex items-center justify-between gap-2 py-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setGoalEditor({
                      exerciseId: goal.exerciseId,
                      name: exerciseName(goal.exerciseId),
                      goalId: goal.id,
                      value: toDisplayWeight(goal.targetWeightKg, unit),
                    })
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[14px] text-ink">
                    {exerciseName(goal.exerciseId)}
                  </span>
                  <span className="text-[11px] text-ink3">
                    目标 {formatWeight(toDisplayWeight(goal.targetWeightKg, unit))} {unitLabel(unit)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setGoalToDelete(goal)}
                  aria-label={`删除目标：${exerciseName(goal.exerciseId)}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-danger active:bg-soft"
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <Button className="mt-2" size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
          ＋ 添加动作目标
        </Button>
      </Card>

      <SectionLabel>动作库</SectionLabel>
      <button
        type="button"
        onClick={() => navigate('/settings/exercises')}
        className="flex w-full items-center gap-3 rounded-card bg-white p-4 text-left shadow-card active:bg-soft"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brandsoft text-brand">
          <DumbbellIcon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">动作库管理</span>
          <span className="text-[11px] text-ink3">
            共 {data.exercises.length} 个动作 · 新增、重命名、隐藏
          </span>
        </span>
        <ChevronRightIcon size={18} className="text-ink3" />
      </button>

      <SectionLabel>单位</SectionLabel>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[14px] text-ink">重量显示单位</p>
            <p className="mt-0.5 text-[11px] text-ink3">内部统一按 kg 保存，切换只影响显示与输入</p>
          </div>
          <div className="flex rounded-full bg-soft p-0.5">
            {(['kg', 'lb'] as Unit[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleUnitChange(item)}
                className={cx(
                  'h-8 w-10 rounded-full text-[12px]',
                  unit === item ? 'bg-white font-medium text-ink shadow-sm' : 'text-ink3',
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <SectionLabel>数据</SectionLabel>
      <Card>
        <CardTitle right={<span className="text-[10px] text-ink3">仅存本机</span>}>备份与恢复</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={handleExport}>
            导出备份
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            导入恢复
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="选择备份文件"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFilePicked(file)
          }}
        />
        <p className="mt-2 text-[11px] text-ink3">
          最近备份：{backupTimeLabel(data.settings?.lastBackupAt ?? null)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <div>
            <p className="text-[13px] text-ink">当前数据量</p>
            <p className="mt-0.5 text-[11px] text-ink3">
              {data.counts.sessions} 次训练 · {data.counts.weights} 条体重 ·{' '}
              {data.counts.calories} 天热量
            </p>
          </div>
          <InfoIcon size={18} className="text-ink3" />
        </div>
        <Button
          className="mt-3"
          variant="ghost"
          fullWidth
          onClick={() => setClearOpen(true)}
        >
          <span className="text-danger">清空所有数据</span>
        </Button>
      </Card>

      <SectionLabel>关于</SectionLabel>
      <Card>
        <div className="flex items-start gap-2">
          <InfoIcon size={16} className="mt-0.5 shrink-0 text-ink3" />
          <div className="text-[12px] leading-6 text-ink2">
            <p className="font-medium text-ink">今天练了吗 · v{APP_VERSION}</p>
            <p className="mt-1">
              所有数据保存在本机浏览器的 IndexedDB 中，不会上传到任何服务器。清理浏览器数据会丢失记录，
              建议定期导出备份。
            </p>
            <p className="mt-1">
              安装到主屏幕：在手机浏览器菜单里选择「添加到主屏幕」，即可像 App 一样全屏打开。
            </p>
          </div>
        </div>
      </Card>

      <WeightPanel open={weightOpen} onClose={() => setWeightOpen(false)} />

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={openGoalForExercise}
        title="选择要设目标的动作"
      />

      <Sheet
        open={goalEditor !== null}
        onClose={() => setGoalEditor(null)}
        title="动作力量目标"
        footer={
          <Button
            fullWidth
            onClick={saveGoal}
            disabled={busy || goalEditor?.value === null || goalEditor?.value === undefined}
          >
            {busy ? '保存中…' : '保存目标'}
          </Button>
        }
      >
        {goalEditor ? (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
              <TargetIcon size={16} className="text-brand" /> {goalEditor.name}
            </p>
            <div>
              <span className="mb-1 block text-[12px] text-ink3">目标重量</span>
              <NumberField
                value={goalEditor.value}
                min={0}
                max={unit === 'lb' ? 1100 : 500}
                suffix={unitLabel(unit)}
                ariaLabel="动作目标重量"
                onChange={(value) =>
                  setGoalEditor((current) =>
                    current ? { ...current, value } : current,
                  )
                }
              />
            </div>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={importPreview !== null}
        onClose={() => setImportPreview(null)}
        title="确认导入备份"
        footer={
          <div className="flex gap-2">
            <Button fullWidth variant="secondary" onClick={() => setImportPreview(null)}>
              取消
            </Button>
            <Button fullWidth onClick={confirmImport} disabled={busy}>
              {busy ? '导入中…' : '覆盖并导入'}
            </Button>
          </div>
        }
      >
        {importPreview ? (
          <div className="space-y-2 text-[13px] text-ink2">
            <p>
              将覆盖当前全部数据，导入：
            </p>
            <ul className="space-y-1 rounded-field bg-soft p-3 text-[12px]">
              <li>训练记录：{importPreview.summary.sessions} 条</li>
              <li>训练模板：{importPreview.summary.templates} 套</li>
              <li>体重记录：{importPreview.summary.bodyWeights} 条</li>
              <li>热量记录：{importPreview.summary.calorieLogs} 天</li>
              <li>导出时间：{backupTimeLabel(importPreview.summary.exportedAt)}</li>
            </ul>
            <p className="text-[11px] text-danger">导入后无法撤销，建议先导出当前数据。</p>
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={clearOpen}
        title="清空所有数据？"
        description="训练、模板、体重、热量与设置都会被删除，并回到首次引导。此操作无法撤销。"
        confirmText="清空"
        onCancel={() => setClearOpen(false)}
        onConfirm={confirmClear}
      />

      <ConfirmDialog
        open={goalToDelete !== null}
        title="删除这个力量目标？"
        description="只删除目标线，已有的训练记录不受影响。"
        confirmText="删除"
        onCancel={() => setGoalToDelete(null)}
        onConfirm={removeGoal}
      />
    </div>
  )
}
