import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3 pt-2">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13px] text-ink2">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0 pt-1">{right}</div> : null}
    </header>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 px-1 text-[12px] font-medium uppercase tracking-wide text-ink3">
      {children}
    </h3>
  )
}
