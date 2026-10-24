import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCalorieLog, upsertCalorieLog } from '../../db/repo/health'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { useToast } from '../../components/ui/Toast'
import { formatDateLabel, todayKey } from '../../lib/date'

export function CaloriePanel({
  open,
  onClose,
  initialDate,
}: {
  open: boolean
  onClose: () => void
  initialDate?: string
}) {
  const toast = useToast()
  const [date, setDate] = useState(initialDate ?? todayKey())
  const [breakfast, setBreakfast] = useState<number | null>(null)
  const [lunch, setLunch] = useState<number | null>(null)
  const [dinner, setDinner] = useState<number | null>(null)
  const [snack, setSnack] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const log = useLiveQuery(() => getCalorieLog(date), [date])

  useEffect(() => {
    if (!open) return
    setDate(initialDate ?? todayKey())
  }, [open, initialDate])

  useEffect(() => {
    if (!log) {
      setBreakfast(null)
      setLunch(null)
      setDinner(null)
      setSnack(null)
      return
    }
    setBreakfast(log.breakfast || null)
    setLunch(log.lunch || null)
    setDinner(log.dinner || null)
    setSnack(log.snack || null)
  }, [log])

  const total = (breakfast ?? 0) + (lunch ?? 0) + (dinner ?? 0) + (snack ?? 0)

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      await upsertCalorieLog(date, {
        breakfast: breakfast ?? 0,
        lunch: lunch ?? 0,
        dinner: dinner ?? 0,
        snack: snack ?? 0,
      })
      toast('已保存热量记录')
      onClose()
    } catch {
      toast('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="热量打卡"
      footer={
        <Button fullWidth onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : `保存 · ${total} kcal`}
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[12px] text-ink3" htmlFor="calorie-date">
            日期
          </label>
          <input
            id="calorie-date"
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => setDate(e.target.value || todayKey())}
            className="h-11 w-full rounded-field bg-soft px-3 text-[14px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
          />
          <p className="mt-1 px-1 text-[11px] text-ink3">{formatDateLabel(date)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '早餐', value: breakfast, set: setBreakfast },
            { label: '午餐', value: lunch, set: setLunch },
            { label: '晚餐', value: dinner, set: setDinner },
            { label: '加餐', value: snack, set: setSnack },
          ].map((meal) => (
            <div key={meal.label}>
              <span className="mb-1 block text-[12px] text-ink3">{meal.label}</span>
              <NumberField
                value={meal.value}
                min={0}
                max={5000}
                placeholder="0"
                suffix="kcal"
                ariaLabel={`${meal.label}热量`}
                onChange={meal.set}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-field bg-soft px-3 py-3">
          <span className="text-[13px] text-ink2">当日合计</span>
          <span className="text-[17px] font-semibold text-ink tnum">{total} kcal</span>
        </div>
      </div>
    </Sheet>
  )
}
