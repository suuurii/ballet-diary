import { t, useLang } from '../lib/i18n'
import { dayKey, formatDateCN, hoursShort, monthGrid, startOfDay } from '../lib/time'

const WEEK_ZH = ['一', '二', '三', '四', '五', '六', '日']
const WEEK_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

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
  giftDay,
  onSelect,
}: {
  year: number
  month: number
  totals: Map<number, number>
  selected: number | null
  /** 今年第一次练够目标的那天，格子上留个小礼物 */
  giftDay?: number | null
  onSelect: (day: number) => void
}) {
  const lang = useLang()
  const WEEK = lang === 'en' ? WEEK_EN : WEEK_ZH
  const cells = monthGrid(year, month)
  const today = startOfDay(Date.now())

  return (
    <div className="cal">
      <div className="cal-week" aria-hidden="true">
        {WEEK.map((w, i) => (
          <span key={i}>{w}</span>
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
              aria-label={`${formatDateCN(ts)}${min > 0 ? t(`，${min} 分钟`, `, ${min} min`) : ''}`}
            >
              <span className="cal-num">{day}</span>
              {min > 0 && <span className="cal-hours">{hoursShort(min)}</span>}
              {ts === giftDay && (
                <span className="cal-gift" aria-hidden="true">
                  🩰
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
