import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white active:bg-branddark disabled:bg-[#A9D6C2]',
  secondary: 'bg-brandsoft text-brand active:bg-[#DCEFE5] disabled:opacity-50',
  ghost: 'bg-transparent text-ink2 active:bg-soft disabled:opacity-50',
  danger: 'bg-danger text-white active:brightness-95 disabled:opacity-50',
}

const sizes: Record<Size, string> = {
  md: 'h-12 px-5 text-[15px]',
  sm: 'h-9 px-3.5 text-[13px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-btn font-medium transition-colors',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
