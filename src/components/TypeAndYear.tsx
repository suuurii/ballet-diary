import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Entry } from '../db'
import { t, useLang } from '../lib/i18n'
import { TypeDonut } from './TypeDonut'
import { YearHeatmap } from './YearHeatmap'

/**
 * 一张卡，左右滑两页：
 *   第 1 页 类型分布环图
 *   第 2 页 一整年的热力图（年份可翻）
 *
 * 两页本来高低不一样：环图那一页高，热力图那一页矮。
 * 卡的高度跟着当前这一页走，热力图就不必被撑成一长条、上下留一堆空。
 */
export function TypeAndYear({ entries, categories }: { entries: Entry[]; categories: Category[] }) {
  useLang()
  const [page, setPage] = useState(0)
  /** 卡片高度用这个：等滑完再变，手指还在拖的时候不跟着跳 */
  const [heightPage, setHeightPage] = useState(0)
  /** 手指在滑的时候先按高的那一页撑开，不然矮页的高度会把高页截掉一截 */
  const [settled, setSettled] = useState(true)
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const trackRef = useRef<HTMLDivElement>(null)
  const slide0 = useRef<HTMLDivElement>(null)
  const slide1 = useRef<HTMLDivElement>(null)
  const slideRefs = useMemo(() => [slide0, slide1], [slide0, slide1])
  const [heights, setHeights] = useState<[number, number] | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  // 两页各自多高：内容变了、换语言、换筛选都会重新量
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const a = slideRefs[0].current
      const b = slideRefs[1].current
      if (!a || !b) return
      const h0 = Math.ceil(a.getBoundingClientRect().height)
      const h1 = Math.ceil(b.getBoundingClientRect().height)
      if (h0 <= 0 || h1 <= 0) return
      setHeights((prev) => (prev && prev[0] === h0 && prev[1] === h1 ? prev : [h0, h1]))
    })
    observer.current = ro
    for (const r of slideRefs) if (r.current) ro.observe(r.current)
    return () => {
      ro.disconnect()
      observer.current = null
      clearTimeout(idle.current)
    }
  }, [slideRefs])

  // 卡片要等记录读出来才出现，所以「挂上就量」比在 effect 里量稳妥
  const attach = useMemo(
    () =>
      [0, 1].map((i) => (el: HTMLDivElement | null) => {
        if (slideRefs[i].current) observer.current?.unobserve(slideRefs[i].current!)
        slideRefs[i].current = el
        if (el) observer.current?.observe(el)
      }),
    [slideRefs],
  )

  // 一条计过时长的都没有，整块不出现（和原来一样）
  if (!entries.some((e) => e.durationMin > 0)) return null

  function onScroll() {
    const el = trackRef.current
    if (!el) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== page) setPage(next)
    // 滑到另一页了才把卡片撑高，原地小幅拖动不会让它一跳
    if (next !== heightPage) setSettled(false)
    clearTimeout(idle.current)
    idle.current = setTimeout(() => {
      setHeightPage(next)
      setSettled(true)
    }, 140)
  }

  function go(i: number) {
    const el = trackRef.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <section className="split split-swipe" aria-label={t('类型分布和年度热力图', 'By class type and yearly heatmap')}>
      <div
        className="goal-track"
        ref={trackRef}
        onScroll={onScroll}
        style={
          heights
            ? { height: settled ? heights[heightPage] : Math.max(heights[0], heights[1]) }
            : undefined
        }
      >
        <div className="goal-slide" ref={attach[0]}>
          <TypeDonut entries={entries} categories={categories} />
        </div>
        <div className="goal-slide" ref={attach[1]}>
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
