import type { ReactNode } from 'react'

export function ChartCard({
  title,
  subtitle,
  visible,
  onToggle,
  children,
}: {
  title: string
  subtitle?: string
  visible: boolean
  onToggle: () => void
  children: ReactNode
}) {
  if (!visible) return null
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="card-sub">{subtitle}</div>}
        </div>
        <button className="link-btn" onClick={onToggle}>
          隐藏
        </button>
      </div>
      {children}
    </section>
  )
}
