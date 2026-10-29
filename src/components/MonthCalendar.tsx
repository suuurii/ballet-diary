import { dayKey, monthGrid, startOfDay } from '../lib/time'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

/** 0–4 档深浅 */
function heatLevel(min: number): number {
  if (min <= 0) return 0
  if (min < 45) return 1
  if (min < 90) return 2
  if (min < 150) return 3
  return 4
}

export function MonthCalendar({
  year,
  month,
  totals,
  selected,
  onSelect,
}: {
  year: number
  month: number
  totals: Map<number, number>
  selected: number | null
  onSelect: (day: number) => void
}) {
  const cells = monthGrid(year, month)
  const today = startOfDay(Date.now())

  return (
    <div className="cal">
      <div className="cal-week" aria-hidden="true">
        {WEEK.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} className="cal-cell cal-blank" />
          const ts = dayKey(year, month, day)
          const min = totals.get(ts) || 0
          return (
            <button
              key={ts}
              type="button"
              className={
                'cal-cell' +
                (ts === today ? ' cal-today' : '') +
                (ts === selected ? ' cal-selected' : '')
              }
              data-level={heatLevel(min)}
              onClick={() => onSelect(ts)}
              aria-label={`${month + 1} 月 ${day} 日${min > 0 ? `，${min} 分钟` : ''}`}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
