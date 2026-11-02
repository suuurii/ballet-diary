import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

interface HoldOptions {
  /** 把 id 挪到第几个位置 */
  move: (id: number, to: number) => void
  /** 松手了，把这次的顺序存下来 */
  drop: () => void
}

/**
 * 一排小标签：按住 0.4 秒就能左右拖着调顺序。
 * 手指先动起来的当成在滚这一行，不算长按；拖完那一下松手也不会顺手点中它。
 * `attr` 是每个标签身上的标记（`data-cat-id`、`data-dur`），用来量它们的位置。
 */
export function useHoldDrag(rowRef: RefObject<HTMLDivElement | null>, attr: string) {
  const [dragging, setDragging] = useState<number | null>(null)
  const holdRef = useRef<{
    id: number
    startX: number
    startY: number
    active: boolean
  } | null>(null)
  // 刚拖完的那一下松手会顺带触发 click，别让它顺手选中
  const suppressClick = useRef(0)

  function startHold(e: ReactPointerEvent<HTMLElement>, id: number, opts: HoldOptions) {
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

    // 进入拖动后拦住这一行的滚动，别让页面跟着手指跑
    function blockScroll(ev: TouchEvent) {
      if (st.active) ev.preventDefault()
    }

    function onMove(ev: PointerEvent) {
      if (holdRef.current !== st) return
      if (!st.active) {
        // 还没到时间就滑开了：她是在滚这一行
        if (Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) > 10) stop()
        return
      }
      reorderTo(ev.clientX)
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
    function reorderTo(x: number) {
      const row = rowRef.current
      if (!st.active || !row) return

      // 拖到边上时让这一行自己滚一点，够得着后面的
      const rr = row.getBoundingClientRect()
      if (x < rr.left + 36) row.scrollLeft -= 10
      else if (x > rr.right - 36) row.scrollLeft += 10

      let to = 0
      for (const el of Array.from(row.querySelectorAll<HTMLElement>(`[${attr}]`))) {
        if (Number(el.getAttribute(attr)) === st.id) continue
        const r = el.getBoundingClientRect()
        if (x > r.left + r.width / 2) to++
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
