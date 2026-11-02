import { useMemo, useState } from 'react'
import type { Entry } from '../db'
import { sumByDay } from '../lib/entries'
import { hoursShort, startOfDay } from '../lib/time'
import { t, useLang } from '../lib/i18n'

/** 0–4 档深浅，和月历同一套 */
function heatLevel(min: number): number {
  if (min <= 0) return 0
  if (min < 45) return 1
  if (min < 90) return 2
  if (min < 150) return 3
  return 4
}

/**
 * 一整年的热力图：一天一格，一列一周（周一在最上面）。
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
    const jan1 = new Date(year, 0, 1)
    const lead = (jan1.getDay() + 6) % 7 // 周一算一星期的开头
    const dec31 = new Date(year, 11, 31)
    const tail = 6 - ((dec31.getDay() + 6) % 7)

    const start = startOfDay(new Date(year, 0, 1 - lead).getTime())
    const end = startOfDay(new Date(year, 11, 31 + tail).getTime())
    const days = Math.round((end - start) / 86400000) + 1

    const cells: { ts: number; min: number; inYear: boolean }[] = []
    let totalMin = 0
    let activeDays = 0
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const ts = startOfDay(d.getTime())
      const inYear = d.getFullYear() === year
      const min = inYear ? totals.get(ts) || 0 : -1
      if (inYear && min > 0) {
        totalMin += min
        activeDays++
      }
      cells.push({ ts, min, inYear })
    }

    // 月份数字落在「这个月 1 号」所在的那一列上
    const weeks = days / 7
    const months = Array.from({ length: 12 }, (_, m) => {
      const ts = startOfDay(new Date(year, m, 1).getTime())
      const col = Math.floor(Math.round((ts - start) / 86400000) / 7)
      return { label: String(m + 1), left: (col / weeks) * 100 }
    })

    return { cells, months, totalMin, activeDays }
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

      <div className="yhm-body">
        <div className="yhm-months" aria-hidden="true">
          {grid.months.map((m) => (
            <span key={m.label} style={{ left: `${m.left}%` }}>
              {m.label}
            </span>
          ))}
        </div>

        <div className="yhm-grid" role="img" aria-label={`${year} · ${summary}`}>
          {grid.cells.map((c) => (
            <i
              key={c.ts}
              className="yhm-cell"
              data-level={c.inYear ? heatLevel(c.min) : -1}
            />
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
    </div>
  )
}
