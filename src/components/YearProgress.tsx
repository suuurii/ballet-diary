import { useRef, useState } from 'react'
import { hoursText } from '../lib/goal'

function ymd(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/**
 * 一张卡，左右滑两页：
 *   第 1 页 累计练习（全部时间）
 *   第 2 页 今年的练习进度（对着自己设的目标）
 */
export function YearProgress({
  year,
  yearMinutes,
  yearSessions,
  totalMinutes,
  totalSessions,
  firstDate,
  goalHours,
  onEditGoal,
}: {
  year: number
  yearMinutes: number
  yearSessions: number
  totalMinutes: number
  totalSessions: number
  firstDate: number | null
  goalHours: number | null
  onEditGoal: () => void
}) {
  const [page, setPage] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const yearHours = yearMinutes / 60
  const pct = goalHours ? Math.round((yearHours / goalHours) * 100) : 0
  const avgMin = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0

  function onScroll() {
    const el = trackRef.current
    if (!el) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== page) setPage(next)
  }

  function go(i: number) {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <section className="goal" aria-label="练习时长">
      <div className="goal-track" ref={trackRef} onScroll={onScroll}>
        <div className="goal-slide">
          <div className="goal-top">
            <span className="label goal-label">累计练习</span>
            <span className="goal-sessions">{totalSessions} 次练习</span>
          </div>

          <div className="goal-main">
            <span className="goal-hours">
              <b>{hoursText(totalMinutes)}</b> 小时
            </span>
            {totalSessions > 0 && <span className="goal-aside">平均 {avgMin} 分钟</span>}
          </div>

          <div className="goal-foot">
            {firstDate ? `从 ${ymd(firstDate)} 开始` : '还没有记过练习时长'}
          </div>
        </div>

        <div className="goal-slide">
          <div className="goal-top">
            <span className="label goal-label">今年 · {year}</span>
            <span className="goal-sessions">{yearSessions} 次练习</span>
          </div>

          <div className="goal-main">
            <span className="goal-hours">
              <b>{hoursText(yearMinutes)}</b> 小时
            </span>
            <button className="goal-edit" onClick={onEditGoal}>
              {goalHours ? `目标 ${goalHours} 小时 · ${pct}%` : '设一个目标 ›'}
            </button>
          </div>

          <div className="goal-foot">
            <div
              className="goal-bar"
              role="progressbar"
              aria-valuenow={Math.min(pct, 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="今年练习目标进度"
            >
              <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="goal-dots">
        {[0, 1].map((i) => (
          <button
            key={i}
            className={'goal-dot' + (page === i ? ' goal-dot-on' : '')}
            onClick={() => go(i)}
            aria-label={i === 0 ? '累计练习' : '今年练习'}
          >
            <i />
          </button>
        ))}
      </div>
    </section>
  )
}
