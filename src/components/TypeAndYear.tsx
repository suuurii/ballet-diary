import { useRef, useState } from 'react'
import type { Category, Entry } from '../db'
import { t, useLang } from '../lib/i18n'
import { TypeDonut } from './TypeDonut'
import { YearHeatmap } from './YearHeatmap'

/**
 * 一张卡，左右滑两页：
 *   第 1 页 类型分布环图
 *   第 2 页 一整年的热力图（年份可翻）
 */
export function TypeAndYear({ entries, categories }: { entries: Entry[]; categories: Category[] }) {
  useLang()
  const [page, setPage] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  // 一条计过时长的都没有，整块不出现（和原来一样）
  if (!entries.some((e) => e.durationMin > 0)) return null

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
    <section className="split split-swipe" aria-label={t('类型分布和年度热力图', 'By class type and yearly heatmap')}>
      <div className="goal-track" ref={trackRef} onScroll={onScroll}>
        <div className="goal-slide">
          <TypeDonut entries={entries} categories={categories} />
        </div>
        <div className="goal-slide">
          <YearHeatmap entries={entries} />
        </div>
      </div>

      <div className="goal-dots">
        {[0, 1].map((i) => (
          <button
            key={i}
            className={'goal-dot' + (page === i ? ' goal-dot-on' : '')}
            onClick={() => go(i)}
            aria-label={i === 0 ? t('类型分布', 'By class type') : t('年度热力图', 'Yearly heatmap')}
          >
            <i />
          </button>
        ))}
      </div>
    </section>
  )
}
