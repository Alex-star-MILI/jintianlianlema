import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate } from 'react-router-dom'
import { db } from '../../db/schema'
import { PRESET_TEMPLATES } from '../../db/seed'
import { createPresetTemplates } from '../../db/repo/templates'
import { setWeekdayTemplate } from '../../db/repo/plan'
import { updateGoals, updateSettings } from '../../db/repo/health'
import { Button } from '../../components/ui/Button'
import { Stepper } from '../../components/ui/NumberField'
import { useToast } from '../../components/ui/Toast'
import { CheckIcon } from '../../components/icons'
import { weekdayName } from '../../lib/date'
import { cx } from '../../lib/cx'

const DEFAULT_DAYS = [1, 3, 5]

function defaultDayMap(): Record<string, number[]> {
  const map: Record<string, number[]> = {}
  PRESET_TEMPLATES.forEach((preset, index) => {
    map[preset.name] = [DEFAULT_DAYS[index] ?? 1 + index]
  })
  return map
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useLiveQuery(() => db.settings.get('settings'), [])

  const [step, setStep] = useState(1)
  const [weeklyTarget, setWeeklyTarget] = useState(4)
  const [selected, setSelected] = useState<string[]>(PRESET_TEMPLATES.map((p) => p.name))
  const [dayMap, setDayMap] = useState<Record<string, number[]>>(defaultDayMap)
  const [busy, setBusy] = useState(false)

  if (settings?.onboardingDone) {
    return <Navigate to="/" replace />
  }

  function togglePreset(name: string) {
    setSelected((list) =>
      list.includes(name) ? list.filter((item) => item !== name) : [...list, name],
    )
  }

  function toggleDay(name: string, day: number) {
    setDayMap((previous) => {
      const already = (previous[name] ?? []).includes(day)
      const next: Record<string, number[]> = {}
      for (const preset of PRESET_TEMPLATES) {
        const days = previous[preset.name] ?? []
        if (preset.name === name && !already) {
          next[preset.name] = [...days, day].sort((a, b) => a - b)
        } else {
          next[preset.name] = days.filter((item) => item !== day)
        }
      }
      return next
    })
  }

  async function finish(importPresets: boolean) {
    if (busy) return
    setBusy(true)
    try {
      await updateGoals({ weeklySessionTarget: weeklyTarget })
      if (importPresets && selected.length) {
        const ordered = PRESET_TEMPLATES.filter((preset) => selected.includes(preset.name))
        const ids = await createPresetTemplates(ordered.map((preset) => preset.name))
        for (let index = 0; index < ordered.length; index += 1) {
          const id = ids[index]
          const days = dayMap[ordered[index].name] ?? []
          for (const day of days) await setWeekdayTemplate(day, id)
        }
      }
      await updateSettings({ onboardingDone: true })
      navigate('/', { replace: true })
    } catch {
      toast('初始化失败，请重试')
      setBusy(false)
    }
  }

  const totalSets = (name: string) => {
    const preset = PRESET_TEMPLATES.find((item) => item.name === name)
    return preset?.exercises.reduce((sum, item) => sum + item.targetSets, 0) ?? 0
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col px-5 pb-8 pt-[calc(1.5rem+env(safe-area-inset-top))]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-brand text-white">
            <span className="text-[15px] font-bold">练</span>
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-tight text-ink">今天练了吗</div>
            <div className="text-[11px] text-ink3">三步完成初始设置</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => finish(false)}
          disabled={busy}
          className="rounded-btn px-2 py-1 text-[13px] text-ink3 active:bg-soft disabled:opacity-50"
        >
          跳过
        </button>
      </div>

      <div className="mb-6 flex gap-1.5">
        {[1, 2, 3].map((item) => (
          <span
            key={item}
            className={cx(
              'h-1 flex-1 rounded-full',
              item <= step ? 'bg-brand' : 'bg-soft',
            )}
          />
        ))}
      </div>

      <div className="flex-1">
        {step === 1 ? (
          <section>
            <h1 className="text-[26px] font-bold leading-tight text-ink">每周练几次？</h1>
            <p className="mt-2 text-[14px] leading-6 text-ink2">
              这个目标会显示在今日页的本周进度里，之后随时可以在设置中修改。
            </p>
            <div className="mt-8 rounded-card bg-white p-5 shadow-card">
              <p className="mb-4 text-[13px] text-ink2">每周训练次数目标</p>
              <Stepper
                value={weeklyTarget}
                onChange={setWeeklyTarget}
                min={1}
                max={7}
                suffix="次 / 周"
                ariaLabel="每周训练次数目标"
              />
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <h1 className="text-[26px] font-bold leading-tight text-ink">从哪套开始？</h1>
            <p className="mt-2 text-[14px] leading-6 text-ink2">
              推荐先用「推 / 拉 / 腿」循环，模板可以随时修改。也可以先自己建。
            </p>
            <div className="mt-6 space-y-2">
              {PRESET_TEMPLATES.map((preset) => {
                const active = selected.includes(preset.name)
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => togglePreset(preset.name)}
                    className={cx(
                      'flex w-full items-center justify-between rounded-card p-4 text-left shadow-card transition-colors',
                      active ? 'bg-brandsoft ring-1 ring-brand' : 'bg-white',
                    )}
                  >
                    <span>
                      <span className="block text-[15px] font-semibold text-ink">
                        {preset.name}
                      </span>
                      <span className="mt-1 block text-[12px] text-ink2">
                        {preset.exercises.length} 个动作 · {totalSets(preset.name)} 组
                      </span>
                    </span>
                    <span
                      className={cx(
                        'flex h-6 w-6 items-center justify-center rounded-full',
                        active ? 'bg-brand text-white' : 'bg-soft text-transparent',
                      )}
                    >
                      <CheckIcon size={14} />
                    </span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setSelected([])}
                className={cx(
                  'w-full rounded-card p-4 text-left text-[14px] shadow-card',
                  selected.length === 0
                    ? 'bg-brandsoft text-brand ring-1 ring-brand'
                    : 'bg-white text-ink2',
                )}
              >
                我自己建
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <h1 className="text-[26px] font-bold leading-tight text-ink">安排到周几？</h1>
            <p className="mt-2 text-[14px] leading-6 text-ink2">
              为每套模板选择训练日；同一天只会安排一套。之后可以在计划页调整。
            </p>
            {selected.length === 0 ? (
              <div className="mt-6 rounded-card bg-white p-5 shadow-card">
                <p className="text-[14px] text-ink">先不导入预设模板</p>
                <p className="mt-1 text-[12px] leading-5 text-ink2">
                  完成引导后，在计划页新建自己的模板即可。
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {PRESET_TEMPLATES.filter((preset) => selected.includes(preset.name)).map(
                  (preset) => (
                    <div key={preset.name} className="rounded-card bg-white p-4 shadow-card">
                      <p className="text-[14px] font-semibold text-ink">{preset.name}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                          const active = (dayMap[preset.name] ?? []).includes(day)
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleDay(preset.name, day)}
                              className={cx(
                                'h-9 rounded-full px-3 text-[13px]',
                                active ? 'bg-brand text-white' : 'bg-soft text-ink2',
                              )}
                            >
                              {weekdayName(day)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>
        ) : null}
      </div>

      <div className="mt-8 flex gap-3">
        {step > 1 ? (
          <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={busy}>
            上一步
          </Button>
        ) : null}
        {step < 3 ? (
          <Button fullWidth onClick={() => setStep(step + 1)}>
            下一步
          </Button>
        ) : (
          <Button fullWidth onClick={() => finish(true)} disabled={busy}>
            {busy ? '正在创建…' : '完成设置'}
          </Button>
        )}
      </div>
    </div>
  )
}
