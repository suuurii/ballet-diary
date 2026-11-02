import { useMemo, useState } from 'react'
import type { Entry } from '../db'
import { sumByDay } from '../lib/entries'
import { hoursShort, startOfDay } from '../lib/time'
import { t, useLang } from '../lib/i18n'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 0–4 档深浅，和月历同一套 */
function heatLevel(min: number): number {
  if (min <= 0) return 0
  if (min < 45) return 1
  if (min < 90) return 2
  if (min < 150) return 3
  return 4
}

/**
 * 一整年的热力图：12 个月各一小块，一个月里一天一格。
 * 一长条塞在手机上每格只剩三四个像素，看不清，所以拆成月历的形状。
 * 年份可以左右翻，从有记录的那年一直到今年。
 */
export function YearHeatmap({ entries }: { entries: Entry[] }) {
  useLang()
  const thisYear = new Date().getFullYear()
  const totals = useMemo(() => sumByDay(entries), [entries])

  /** 有记录的年份到今年为止，都能翻 */
  const years = useMemo(() => {
    let first = thisYear
    for (const e of entries) {
      const y = new Date(e.date).getFullYear()
      if (y < first) first = y
    }
    const out: number[] = []
    for (let y = first; y <= thisYear; y++) out.push(y)
    return out
  }, [entries, thisYear])

  const [picked, setPicked] = useState(thisYear)
  const year = years.includes(picked) ? picked : thisYear

  const grid = useMemo(() => {
    let totalMin = 0
    let activeDays = 0
    const months = Array.from({ length: 12 }, (_, m) => {
      const lead = (new Date(year, m, 1).getDay() + 6) % 7 // 周一算第一列
      const days = new Date(year, m + 1, 0).getDate()
      const cells: (number | null)[] = Array.from({ length: lead }, () => null)
      for (let d = 1; d <= days; d++) {
        const ts = startOfDay(new Date(year, m, d).getTime())
        const min = totals.get(ts) || 0
        if (min > 0) {
          totalMin += min
          activeDays++
        }
        cells.push(min)
      }
      return { month: m, cells }
    })
    return { months, totalMin, activeDays }
  }, [year, totals])

  const summary = t(
    `${grid.activeDays} 天 · ${hoursShort(grid.totalMin)}`,
    `${grid.activeDays} days · ${hoursShort(grid.totalMin)}`,
  )

  return (
    <div className="split-page yhm">
      <div className="split-head">
        <span className="split-title">{t('年度热力图', 'Yearly heatmap')}</span>
        <div className="yhm-nav">
          <button
            type="button"
            className="yhm-step"
            onClick={() => setPicked(year - 1)}
            disabled={year <= years[0]}
            aria-label={t('上一年', 'Previous year')}
          >
            ‹
          </button>
          <span className="yhm-year">{year}</span>
          <button
            type="button"
            className="yhm-step"
            onClick={() => setPicked(year + 1)}
            disabled={year >= thisYear}
            aria-label={t('下一年', 'Next year')}
          >
            ›
          </button>
        </div>
      </div>

      <div className="yhm-months" role="img" aria-label={`${year} · ${summary}`}>
        {grid.months.map((m) => (
          <div className="yhm-month" key={m.month}>
            <span className="yhm-month-label">
              {t(`${m.month + 1} 月`, MONTH_ABBR[m.month])}
            </span>
            <div className="yhm-month-grid">
              {m.cells.map((min, i) =>
                min === null ? (
                  <i className="yhm-blank" key={`b${i}`} />
                ) : (
                  <i className="yhm-cell" data-level={heatLevel(min)} key={i} />
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="yhm-foot">
        <span>{summary}</span>
        <span className="yhm-legend" aria-hidden="true">
          {t('少', 'Less')}
          <i data-level="0" />
          <i data-level="1" />
          <i data-level="2" />
          <i data-level="3" />
          <i data-level="4" />
          {t('多', 'More')}
        </span>
      </div>
    </div>
  )
}
