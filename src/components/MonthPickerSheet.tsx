import { useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'

const ITEM_H = 40

/** 一个会吸附的数字滚轮。点一下某一格也能滚过去（鼠标用户也能用） */
function Wheel({
  items,
  value,
  onChange,
  width,
}: {
  items: number[]
  value: number
  onChange: (v: number) => void
  width: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)

  // 打开时先滚到当前值
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const i = items.indexOf(value)
    if (i > 0) el.scrollTop = i * ITEM_H
    // 只在挂载时定位一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onScroll() {
    const el = ref.current
    if (!el) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)))
      if (items[i] !== value) onChange(items[i])
    }, 90)
  }

  function pick(i: number) {
    ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
    onChange(items[i])
  }

  return (
    <div className="wheel" ref={ref} onScroll={onScroll} style={{ width }}>
      {items.map((n, i) => (
        <button
          key={n}
          className={'wheel-item' + (n === value ? ' wheel-item-on' : '')}
          onClick={() => pick(i)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** 点月份标题打开的选月份抽屉：两个数字滚轮，年 · 月 */
export function MonthPickerSheet({
  year,
  month,
  onClose,
  onPick,
}: {
  year: number
  month: number
  onClose: () => void
  onPick: (year: number, month: number) => void
}) {
  const [y, setY] = useState(year)
  const [m, setM] = useState(month + 1)

  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => thisYear - 6 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet sheet-picker" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />

        <div className="wheel-row">
          <span className="wheel-band" aria-hidden="true" />
          <Wheel items={years} value={y} onChange={setY} width={96} />
          <span className="wheel-dot" aria-hidden="true">
            .
          </span>
          <Wheel items={months} value={m} onChange={setM} width={64} />
        </div>

        <div className="sheet-actions">
          <button className="btn btn-primary" onClick={() => onPick(y, m - 1)}>
            {t('完成', 'Done')}
          </button>
        </div>
      </div>
    </div>
  )
}
