import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

interface HoldOptions<T> {
  /** 把 id 挪到第几个位置 */
  move: (id: T, to: number) => void
  /** 松手了，把这次的顺序存下来 */
  drop: () => void
}

/**
 * 一排小标签 / 一列要点：按住 0.4 秒就能拖着调顺序。
 * `axis` 是拖的方向：类型、时长是一横排（'x'），动作要点是一竖列（'y'）。
 * 手指先动起来的当成在滚动，不算长按；拖完那一下松手也不会顺手点中它。
 * `attr` 是每个标签身上的标记（`data-cat-id`、`data-dur`、`data-bullet-id`），用来量它们的位置。
 */
export function useHoldDrag<T extends string | number>(
  rowRef: RefObject<HTMLDivElement | null>,
  attr: string,
  axis: 'x' | 'y' = 'x',
) {
  const [dragging, setDragging] = useState<T | null>(null)
  const holdRef = useRef<{
    id: T
    startX: number
    startY: number
    active: boolean
  } | null>(null)
  // 刚拖完的那一下松手会顺带触发 click，别让它顺手选中
  const suppressClick = useRef(0)

  function startHold(
    e: ReactPointerEvent<HTMLElement>,
    id: T,
    opts: HoldOptions<T>,
  ) {
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const st = { id, startX: e.clientX, startY: e.clientY, active: false }
    holdRef.current = st
    let timer = 0

    function stop() {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('touchmove', blockScroll)
      if (holdRef.current === st) holdRef.current = null
    }

    // 进入拖动后拦住滚动，别让页面跟着手指跑
    function blockScroll(ev: TouchEvent) {
      if (st.active) ev.preventDefault()
    }

    function onMove(ev: PointerEvent) {
      if (holdRef.current !== st) return
      if (!st.active) {
        // 还没到时间就滑开了：她是在滚
        if (Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) > 10) stop()
        return
      }
      reorderTo(ev.clientX, ev.clientY)
    }

    function onUp() {
      if (holdRef.current !== st) return
      const wasActive = st.active
      stop()
      if (wasActive) {
        suppressClick.current = Date.now() + 400
        setDragging(null)
        opts.drop()
      }
    }

    /** 看手指到了哪两个标签中间，把正在拖的那个挪过去 */
    function reorderTo(x: number, y: number) {
      const row = rowRef.current
      if (!st.active || !row) return

      // 横排拖到边上时让这一行自己滚一点，够得着后面的
      if (axis === 'x') {
        const rr = row.getBoundingClientRect()
        if (x < rr.left + 36) row.scrollLeft -= 10
        else if (x > rr.right - 36) row.scrollLeft += 10
      }

      let to = 0
      for (const el of Array.from(row.querySelectorAll<HTMLElement>(`[${attr}]`))) {
        if (String(el.getAttribute(attr)) === String(st.id)) continue
        const r = el.getBoundingClientRect()
        const mid = axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2
        if ((axis === 'x' ? x : y) > mid) to++
      }
      opts.move(st.id, to)
    }

    timer = window.setTimeout(() => {
      if (holdRef.current !== st) return
      st.active = true
      setDragging(id)
    }, 420)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('touchmove', blockScroll, { passive: false })
  }

  return { dragging, suppressClick, startHold }
}
