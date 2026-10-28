import { useEffect, useRef } from 'react'

const ITEM_H = 40
const HOURS = Array.from({ length: 25 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

function WheelColumn({
  items,
  value,
  onChange,
  format,
}: {
  items: number[]
  value: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const index = items.indexOf(value)
  const lastIndex = useRef(index)

  // 初始定位到当前值
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = index * ITEM_H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scrollToIndex(i: number, smooth: boolean) {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: i * ITEM_H, behavior: smooth ? 'smooth' : 'auto' })
  }

  function handleScroll() {
    const el = ref.current
    if (!el) return
    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)))
    if (i !== lastIndex.current) {
      lastIndex.current = i
      onChange(items[i])
    }
  }

  return (
    <div className="wheel-col">
      <div className="wheel-list" ref={ref} onScroll={handleScroll}>
        {items.map((it) => (
          <div
            key={it}
            className={'wheel-item' + (it === value ? ' wheel-item-active' : '')}
            onClick={() => scrollToIndex(items.indexOf(it), true)}
          >
            {format(it)}
          </div>
        ))}
      </div>
      <div className="wheel-mask" />
    </div>
  )
}

export function DurationWheel({
  hours,
  minutes,
  onChange,
}: {
  hours: number
  minutes: number
  onChange: (h: number, m: number) => void
}) {
  return (
    <div className="wheel">
      <WheelColumn
        items={HOURS}
        value={hours}
        onChange={(v) => onChange(v, minutes)}
        format={(v) => String(v)}
      />
      <div className="wheel-unit">小时</div>
      <WheelColumn
        items={MINUTES}
        value={minutes}
        onChange={(v) => onChange(hours, v)}
        format={(v) => String(v).padStart(2, '0')}
      />
      <div className="wheel-unit">分钟</div>
    </div>
  )
}
