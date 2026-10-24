import type { HTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-card bg-white p-4 shadow-card', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardTitle({
  children,
  right,
}: {
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {right}
    </div>
  )
}
