import { useEffect, useRef, useState } from 'react'
import { cx } from '../../lib/cx'

export function NumberField({
  value,
  onChange,
  min = 0,
  max = 999,
  placeholder = '—',
  ariaLabel,
  suffix,
  className,
  align = 'center',
}: {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  placeholder?: string
  ariaLabel?: string
  suffix?: string
  className?: string
  align?: 'center' | 'left'
}) {
  const format = (v: number | null) => (v === null ? '' : String(v))
  const [text, setText] = useState(format(value))
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) {
      setText(format(value))
      setInvalid(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleChange(raw: string) {
    // 仅允许数字与小数点
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
    setText(raw)
    if (raw === '') {
      setInvalid(false)
      onChange(null)
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onChange(parsed)
  }

  return (
    <div className={cx('relative', className)}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
          setText(format(value))
          setInvalid(false)
        }}
        onChange={(e) => handleChange(e.target.value.trim())}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        className={cx(
          'h-11 w-full rounded-field bg-soft px-2 text-[16px] text-ink outline-none transition-colors tnum',
          align === 'center' ? 'text-center' : 'text-left',
          invalid
            ? 'ring-1 ring-danger'
            : 'focus:ring-1 focus:ring-brand focus:bg-white focus:shadow-[0_0_0_3px_rgba(34,160,107,0.10)]',
        )}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-ink3">
          {suffix}
        </span>
      ) : null}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 7,
  suffix,
  ariaLabel,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  suffix?: string
  ariaLabel?: string
}) {
  return (
    <div
      className="flex items-center gap-4"
      role="group"
      aria-label={ariaLabel ?? '数值调整'}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="减少"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-soft text-[18px] text-ink2 disabled:opacity-40"
      >
        −
      </button>
      <div className="min-w-[56px] text-center">
        <span className="text-[22px] font-semibold text-ink tnum">{value}</span>
        {suffix ? <span className="ml-1 text-[12px] text-ink2">{suffix}</span> : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="增加"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-soft text-[18px] text-ink2 disabled:opacity-40"
      >
        ＋
      </button>
    </div>
  )
}
