import { useEffect, useMemo, useState } from 'react'
import { db, type Category, type PracticeRecord } from '../db'
import { ensureSeedCategories } from '../lib/categories'
import {
  byDay,
  byMonthByCategory,
  byWeek,
  categoryTotals,
  sumMinutes,
} from '../lib/stats'
import { formatDuration } from '../lib/time'
import {
  calendarHeatmapOption,
  donutOption,
  monthlyStackedOption,
  trendLineOption,
} from '../lib/chartOptions'
import { EChart } from '../components/EChart'
import { ChartCard } from '../components/ChartCard'

const VIS_KEY = 'ballet_chart_visibility'

type Visibility = { calendar: boolean; monthly: boolean; donut: boolean; trend: boolean }
const DEFAULT_VIS: Visibility = { calendar: true, monthly: true, donut: true, trend: true }

function loadVis(): Visibility {
  try {
    const raw = localStorage.getItem(VIS_KEY)
    if (raw) return { ...DEFAULT_VIS, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return DEFAULT_VIS
}

type Range = 'all' | 'thisYear' | 'thisMonth' | `year:${number}`

function filterRecords(records: PracticeRecord[], range: Range): PracticeRecord[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (range === 'thisYear') {
    return records.filter((r) => new Date(r.startAt).getFullYear() === y)
  }
  if (range === 'thisMonth') {
    return records.filter((r) => {
      const d = new Date(r.startAt)
      return d.getFullYear() === y && d.getMonth() === m
    })
  }
  if (typeof range === 'string' && range.startsWith('year:')) {
    const yy = Number(range.slice(5))
    return records.filter((r) => new Date(r.startAt).getFullYear() === yy)
  }
  return records
}

export function StatsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [records, setRecords] = useState<PracticeRecord[]>([])
  const [range, setRange] = useState<Range>('all')
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [vis, setVis] = useState<Visibility>(loadVis)

  useEffect(() => {
    ensureSeedCategories().then(load)
  }, [])

  async function load() {
    const [cats, recs] = await Promise.all([
      db.categories.orderBy('order').toArray(),
      db.practiceRecords.toArray(),
    ])
    setCategories(cats)
    setRecords(recs)
  }

  function toggle(k: keyof Visibility) {
    setVis((v) => {
      const nv = { ...v, [k]: !v[k] }
      localStorage.setItem(VIS_KEY, JSON.stringify(nv))
      return nv
    })
  }

  function showAll() {
    setVis(DEFAULT_VIS)
    localStorage.setItem(VIS_KEY, JSON.stringify(DEFAULT_VIS))
  }

  const years = useMemo(
    () =>
      Array.from(new Set(records.map((r) => new Date(r.startAt).getFullYear()))).sort(
        (a, b) => b - a,
      ),
    [records],
  )

  const filtered = useMemo(() => filterRecords(records, range), [records, range])
  const totalMin = sumMinutes(filtered)

  const byMonthCat = useMemo(() => byMonthByCategory(filtered), [filtered])
  const months = useMemo(() => [...byMonthCat.keys()].sort(), [byMonthCat])

  const weeksArr = useMemo(() => {
    const w = byWeek(filtered)
    return [...w.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])
  const weekKeys = weeksArr.map(([k]) => k)
  const weekVals = weeksArr.map(([, v]) => v)

  const calRecords = useMemo(
    () => records.filter((r) => new Date(r.startAt).getFullYear() === calYear),
    [records, calYear],
  )
  const calYearTotal = sumMinutes(calRecords)

  const totals = useMemo(() => categoryTotals(filtered, categories), [filtered, categories])

  const hidden = (Object.keys(DEFAULT_VIS) as (keyof Visibility)[]).filter((k) => !vis[k])

  return (
    <div>
      <h1 className="page-title">统计</h1>

      <div className="range-bar">
        <button
          className={'range-btn' + (range === 'all' ? ' range-btn-active' : '')}
          onClick={() => setRange('all')}
        >
          全部
        </button>
        <button
          className={'range-btn' + (range === 'thisYear' ? ' range-btn-active' : '')}
          onClick={() => setRange('thisYear')}
        >
          今年
        </button>
        <button
          className={'range-btn' + (range === 'thisMonth' ? ' range-btn-active' : '')}
          onClick={() => setRange('thisMonth')}
        >
          本月
        </button>
        <select
          className="range-select"
          value={range.startsWith('year:') ? range : 'all'}
          onChange={(e) => {
            const v = e.target.value
            setRange(v === 'all' ? 'all' : (`year:${v}` as Range))
          }}
        >
          <option value="all">按年选择…</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
      </div>

      {vis.calendar && (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">打卡日历</div>
              <div className="card-sub">
                {calYear} 年 · 共 {formatDuration(calYearTotal)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="range-select"
                value={calYear}
                onChange={(e) => setCalYear(Number(e.target.value))}
              >
                {(years.length ? years : [new Date().getFullYear()]).map((y) => (
                  <option key={y} value={y}>
                    {y} 年
                  </option>
                ))}
              </select>
              <button className="link-btn" onClick={() => toggle('calendar')}>
                隐藏
              </button>
            </div>
          </div>
          {calYearTotal > 0 ? (
            <EChart option={calendarHeatmapOption(byDay(calRecords), calYear)} height={190} />
          ) : (
            <div className="empty">这一年还没有记录</div>
          )}
        </section>
      )}

      <ChartCard
        title="月度汇总 · 分类构成"
        subtitle={`共 ${formatDuration(totalMin)}`}
        visible={vis.monthly}
        onToggle={() => toggle('monthly')}
      >
        {months.length > 0 ? (
          <EChart
            option={monthlyStackedOption(months, categories, byMonthCat)}
            height={240}
          />
        ) : (
          <div className="empty">该时间段暂无记录</div>
        )}
      </ChartCard>

      <ChartCard
        title="分类占比"
        subtitle={`共 ${formatDuration(totalMin)}`}
        visible={vis.donut}
        onToggle={() => toggle('donut')}
      >
        {totals.length > 0 ? (
          <EChart option={donutOption(totals)} height={230} />
        ) : (
          <div className="empty">该时间段暂无记录</div>
        )}
      </ChartCard>

      <ChartCard
        title="练习趋势（按周）"
        subtitle={`共 ${formatDuration(totalMin)} · 虚线为周均值`}
        visible={vis.trend}
        onToggle={() => toggle('trend')}
      >
        {weekVals.length > 0 ? (
          <EChart option={trendLineOption(weekKeys, weekVals)} height={220} />
        ) : (
          <div className="empty">该时间段暂无记录</div>
        )}
      </ChartCard>

      {hidden.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div className="card-title">已隐藏</div>
            <button className="link-btn" onClick={showAll}>
              全部显示
            </button>
          </div>
          <div className="hidden-list">
            {hidden.map((k) => (
              <button key={k} className="chip" onClick={() => toggle(k)}>
                显示 ·{' '}
                {{ calendar: '打卡日历', monthly: '月度汇总', donut: '分类占比', trend: '练习趋势' }[k]}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
