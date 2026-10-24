import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/schema'
import { getLatestBodyWeight, upsertBodyWeight } from '../../db/repo/health'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { useToast } from '../../components/ui/Toast'
import { formatDateLabel, todayKey } from '../../lib/date'
import { toDisplayWeight, toKg, unitLabel } from '../../lib/units'
import { useUnit } from '../../lib/useUnit'

export function WeightPanel({
  open,
  onClose,
  initialDate,
}: {
  open: boolean
  onClose: () => void
  initialDate?: string
}) {
  const toast = useToast()
  const unit = useUnit()
  const [date, setDate] = useState(initialDate ?? todayKey())
  const [weight, setWeight] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const existing = useLiveQuery(
    () => db.bodyWeights.where('date').equals(date).first(),
    [date, open],
  )

  useEffect(() => {
    if (!open) return
    setDate(initialDate ?? todayKey())
  }, [open, initialDate])

  useEffect(() => {
    if (!open) return
    if (existing) {
      setWeight(toDisplayWeight(existing.weightKg, unit))
      return
    }
    let active = true
    getLatestBodyWeight().then((latest) => {
      if (active && latest) setWeight(toDisplayWeight(latest.weightKg, unit))
    })
    return () => {
      active = false
    }
  }, [existing, open, unit])

  async function handleSave() {
    if (weight === null || saving) return
    setSaving(true)
    try {
      await upsertBodyWeight(date, toKg(weight, unit))
      toast('已记录体重')
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
      title="记录体重"
      footer={
        <Button fullWidth onClick={handleSave} disabled={saving || weight === null}>
          {saving ? '保存中…' : '保存'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[12px] text-ink3" htmlFor="weight-date">
            日期
          </label>
          <input
            id="weight-date"
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => setDate(e.target.value || todayKey())}
            className="h-11 w-full rounded-field bg-soft px-3 text-[14px] text-ink outline-none focus:bg-white focus:ring-1 focus:ring-brand"
          />
          <p className="mt-1 px-1 text-[11px] text-ink3">
            {formatDateLabel(date)}
            {existing ? ' · 该日期已有记录，保存将覆盖' : ''}
          </p>
        </div>
        <div>
          <span className="mb-1 block text-[12px] text-ink3">体重</span>
          <NumberField
            value={weight}
            min={0}
            max={unit === 'lb' ? 1100 : 500}
            placeholder={unit === 'lb' ? '例如 155' : '例如 70.5'}
            suffix={unitLabel(unit)}
            ariaLabel="体重"
            onChange={setWeight}
          />
        </div>
      </div>
    </Sheet>
  )
}
