import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type Category, type Entry, type EntryPoint, type Movement } from '../db'
import { CATEGORY_COLORS } from '../lib/categories'
import { displayMove, matchScore, normName } from '../lib/movements'
import { BALLET_TERMS } from '../lib/balletTerms'
import { chipDuration, formatDuration, fromDateInput, toYMD, weekdayCN } from '../lib/time'
import { clearDurationPresets, loadDurationPresets, saveDurationPresets } from '../lib/durations'
import { useHoldDrag } from '../lib/holdDrag'
import { useBlobUrls } from '../hooks/useBlobUrls'
import { t, useLang } from '../lib/i18n'

/** 一条要点：level 0 是一级，1 是缩进一级的展开或举例 */
interface Bullet {
  /** 只在这一次编辑里用，用来认人：拖动排序、回车后把光标放回对的那一条 */
  id: string
  text: string
  level: number
}

/** 一个动作，和它底下的要点 */
interface PointGroup {
  key: string
  /** 新动作还没存进库，保存时才建 */
  movementId?: number
  name: string
  bullets: Bullet[]
}

let groupSeq = 0
const nextKey = () => `g${++groupSeq}`

let bulletSeq = 0
const nextBulletId = () => `b${++bulletSeq}`

const ORDER_KEY = 'categoryOrderManual'

/**
 * 新常用时长怎么读：带小数点、或者 6 以内，当小时（1.5 → 90 分）；
 * 其余的当分钟（45 → 45 分）。输入框旁边会实时显示换算结果，不会读错。
 */
function parseDurInput(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  const min = Math.round(s.includes('.') || n <= 6 ? n * 60 : n)
  if (min <= 0 || min > 24 * 60) return null
  return min
}

/**
 * 类型默认按「用过多少次」排，常用的排在前面。
 * 次数一样时按原来的顺序，没对通用过的类型自然落在后面。
 */
function sortByUse(list: Category[], use: Record<number, number>): Category[] {
  return [...list].sort(
    (a, b) => (use[b.id!] ?? 0) - (use[a.id!] ?? 0) || a.order - b.order || a.id! - b.id!,
  )
}

function groupsOf(entry: Entry | null, movements: Movement[]): PointGroup[] {
  if (!entry) return []
  const out: PointGroup[] = []
  const byId = new Map<number, PointGroup>()
  for (const p of entry.points || []) {
    let g = byId.get(p.movementId)
    if (!g) {
      const name = movements.find((m) => m.id === p.movementId)?.name
      g = {
        key: nextKey(),
        movementId: p.movementId,
        name: name || t('动作', 'Movement'),
        bullets: [],
      }
      byId.set(p.movementId, g)
      out.push(g)
    }
    g.bullets.push({ id: nextBulletId(), text: p.text, level: p.level === 1 ? 1 : 0 })
  }
  // 只打了标签、还没写要点的动作，也给一条空行让她接着写
  for (const id of entry.movementIds) {
    if (byId.has(id)) continue
    const name = movements.find((m) => m.id === id)?.name
    if (!name) continue
    out.push({
      key: nextKey(),
      movementId: id,
      name,
      bullets: [{ id: nextBulletId(), text: '', level: 0 }],
    })
  }
  return out
}

function entrySummary(e: Entry, movements: Movement[]): string {
  const names = e.movementIds
    .map((id) => movements.find((m) => m.id === id)?.name)
    .filter(Boolean)
    .map((n) => displayMove(n as string))
    .join(' / ')
  const text = e.points?.find((p) => p.text.trim())?.text || e.note.trim().split('\n')[0]
  if (names && text) return `${names} · ${text}`
  if (names) return names
  if (text) return text
  if (e.images.length) return t(`${e.images.length} 张照片`, `${e.images.length} photos`)
  return e.durationMin > 0 ? t('练习', 'Practice') : t('记录', 'Entry')
}

/**
 * 一行要点：跟着字长高。
 * 回车在光标处拆成两条；Shift+回车才是同一条里换行。
 * 光标放在行首按退格，交给外面并到上一条 / 删掉这条空行。
 * 光标要放回哪一条也由外面说，粘贴多行时整段拆成多条。
 */
function PointInput({
  value,
  onChange,
  onEnter,
  onBackspace,
  onIndent,
  onPasteText,
  placeholder,
  focus,
  onFocused,
  label,
}: {
  value: string
  onChange: (v: string) => void
  onEnter: (start: number, end: number) => void
  onBackspace?: () => void
  onIndent?: (dir: 1 | -1, caret: number) => void
  onPasteText?: (text: string, start: number, end: number) => void
  placeholder?: string
  /** 这次要抢光标的位置：行首、行尾，或者具体第几个字 */
  focus?: 'start' | 'end' | number
  onFocused?: () => void
  label: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  useEffect(() => {
    if (focus == null) return
    const el = ref.current
    if (!el) return
    el.focus()
    const pos = focus === 'start' ? 0 : focus === 'end' ? el.value.length : Math.min(focus, el.value.length)
    try {
      el.setSelectionRange(pos, pos)
    } catch {
      // 少数浏览器聚焦前不让设光标，停在默认位置也不影响接着打字
    }
    // 键盘弹起来会盖住下半屏，把刚拿到光标的那条挪进视野
    el.scrollIntoView({ block: 'nearest' })
    onFocused?.()
  }, [focus])

  return (
    <textarea
      ref={ref}
      className="point-input"
      rows={1}
      value={value}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // 中文输入法正在选字，回车是在选词，不能当成新的一条
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          const el = e.currentTarget
          onEnter(el.selectionStart ?? value.length, el.selectionEnd ?? value.length)
        } else if (e.key === 'Tab') {
          e.preventDefault()
          onIndent?.(e.shiftKey ? -1 : 1, e.currentTarget.selectionStart ?? value.length)
        } else if (e.key === 'Backspace') {
          const el = e.currentTarget
          if (el.selectionStart === 0 && el.selectionEnd === 0) {
            // 拦下默认的退格，不然合并完还会再吃掉上一条最后一个字
            e.preventDefault()
            onBackspace?.()
          }
        }
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text/plain')
        // 只有「真的有两行字」才自己拆；带点空行的单行还是照默认粘进这一条
        const lines = text.replace(/\r/g, '').split('\n').filter((s) => s.trim())
        if (!onPasteText || lines.length < 2) return
        // 默认粘贴会把换行塞进这一条里，拦下来自己拆成多条
        e.preventDefault()
        const el = e.currentTarget
        onPasteText(text, el.selectionStart ?? value.length, el.selectionEnd ?? value.length)
      }}
    />
  )
}

export function EntrySheet({
  date,
  initialEntry,
  entries,
  categories,
  movements,
  frequent,
  withPhotos = false,
  onClose,
  onCategoriesChanged,
  onSaved,
}: {
  date: number
  initialEntry?: Entry
  entries: Entry[]
  categories: Category[]
  movements: Movement[]
  frequent: number[]
  /** 只有从笔记页打开时才给照片；日历上的「记一笔」不显示照片 */
  withPhotos?: boolean
  onClose: () => void
  onCategoriesChanged?: () => void
  onSaved: (msg: string) => void
}) {
  useLang()
  const start = initialEntry ?? null

  const [editing, setEditing] = useState<Entry | null>(start)
  const [dateValue, setDateValue] = useState(toYMD(start ? start.date : date))
  const [duration, setDuration] = useState(start ? start.durationMin : 0)
  const [customOpen, setCustomOpen] = useState(
    !!start && start.durationMin > 0 && !frequent.includes(start.durationMin),
  )
  const [categoryId, setCategoryId] = useState<number | null>(start ? start.categoryId : null)
  // 类型就在这一页增删，不用跑去设置页；改完通知外面刷新
  const [cats, setCats] = useState<Category[]>(categories)
  const [catEdit, setCatEdit] = useState(false)
  const [catAdding, setCatAdding] = useState(false)
  const [catInput, setCatInput] = useState('')
  const catRowRef = useRef<HTMLDivElement>(null)
  // 每类用过多少次、有没有手动调过顺序
  const [catUse, setCatUse] = useState<Record<number, number>>({})
  const [orderManual, setOrderManual] = useState(false)
  const catsRef = useRef(cats)
  catsRef.current = cats
  // 长按调顺序：类型、时长各管各的一排
  const catDrag = useHoldDrag<number>(catRowRef, 'data-cat-id')

  // 时长快捷标签：她增删、排过就照她的名单，没动过就按常用算
  const [presets, setPresets] = useState<number[]>(frequent)
  const [durEdit, setDurEdit] = useState(false)
  const [durAdding, setDurAdding] = useState(false)
  const [durInput, setDurInput] = useState('')
  const durRowRef = useRef<HTMLDivElement>(null)
  const presetsRef = useRef(presets)
  presetsRef.current = presets
  const durDrag = useHoldDrag<number>(durRowRef, 'data-dur')
  // 一边填一边告诉她这个数被读成了多少（1.5 → 1.5h，45 → 45 分）
  const durPreview = parseDurInput(durInput)
  const [groups, setGroups] = useState<PointGroup[]>(() => groupsOf(start, movements))
  /** 编辑完一条要点后，光标要回到哪一条、哪个位置 */
  const [focusReq, setFocusReq] = useState<{ id: string; caret: 'start' | 'end' | number } | null>(
    null,
  )
  /** 正在改名的那个动作 */
  const [nameEdit, setNameEdit] = useState<{ key: string; draft: string } | null>(null)
  const nameCancel = useRef(false)
  // 长按圆点上下拖动：一次只拖一个动作底下的要点
  const groupRows = useRef(new Map<string, HTMLDivElement | null>())
  const dragRowRef = useRef<HTMLDivElement | null>(null)
  const bulletDrag = useHoldDrag<string>(dragRowRef, 'data-bullet-id', 'y')
  const [mvQuery, setMvQuery] = useState('')
  const [images, setImages] = useState<Blob[]>(start ? start.images : [])
  const [hint, setHint] = useState('')
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const urls = useBlobUrls(images)

  useEffect(() => () => clearTimeout(hintTimer.current), [])

  /** 说一句就收回去，别让提示一直挂在面板底下 */
  function flashHint(text: string) {
    setHint(text)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(''), 2600)
  }

  // 新加的类型排在最右边，加完把它滚进视野（等这一帧画完再量宽度）
  const catCount = useRef(cats.length)
  useEffect(() => {
    if (cats.length > catCount.current) {
      const el = catRowRef.current
      if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    }
    catCount.current = cats.length
  }, [cats.length])

  // 类型默认按用过的次数排；她手动调过顺序之后就照她调的来
  useEffect(() => {
    let alive = true
    const counts: Record<number, number> = {}
    Promise.all([
      db.settings.get(ORDER_KEY),
      db.entries
        .orderBy('categoryId')
        .each((e) => {
          if (e.categoryId != null) counts[e.categoryId] = (counts[e.categoryId] ?? 0) + 1
        })
        .then(() => counts),
    ])
      .then(([row, use]) => {
        if (!alive) return
        setCatUse(use)
        const manual = row?.value === true
        setOrderManual(manual)
        if (!manual) setCats((prev) => sortByUse(prev, use))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // 退出编辑时，把选中的那类滚回视野中间
  useEffect(() => {
    if (catEdit) return
    const el = catRowRef.current
    if (!el) return
    const on = el.querySelector('.chip-on') as HTMLElement | null
    if (!on) {
      el.scrollTo({ left: 0, behavior: 'smooth' })
      return
    }
    const r = on.getBoundingClientRect()
    const c = el.getBoundingClientRect()
    el.scrollBy({ left: r.left + r.width / 2 - (c.left + c.width / 2), behavior: 'smooth' })
  }, [catEdit])

  // 她排过、增删过的时长名单优先；没动过就用按常用算出来的那几个
  useEffect(() => {
    let alive = true
    loadDurationPresets()
      .then((saved) => {
        if (!alive || !saved) return
        setPresets(saved)
        // 改一笔时，时长不在快捷标签里也得让她看见——把自填那一格打开
        if (start && start.durationMin > 0) {
          setCustomOpen(!saved.includes(start.durationMin))
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [start])

  // 新加的时长排在最右边，加完把它滚进视野
  const durCount = useRef(presets.length)
  useEffect(() => {
    if (presets.length > durCount.current) {
      const el = durRowRef.current
      if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    }
    durCount.current = presets.length
  }, [presets.length])

  function reset(next: Entry | null) {
    setEditing(next)
    setDateValue(toYMD(next ? next.date : date))
    setDuration(next ? next.durationMin : 0)
    // 时长不在快捷标签里就把自填那一格打开，让她看得见这一笔记了多少
    setCustomOpen(!!next && next.durationMin > 0 && !presets.includes(next.durationMin))
    setCategoryId(next ? next.categoryId : null)
    setGroups(groupsOf(next, movements))
    setMvQuery('')
    setFocusReq(null)
    setNameEdit(null)
    setImages(next ? next.images : [])
    setHint('')
  }

  /* ---------- 类型 ---------- */

  async function addCategory() {
    const name = catInput.trim()
    setCatAdding(false)
    setCatInput('')
    if (!name) return
    if (cats.some((c) => c.name === name)) return
    const color = CATEGORY_COLORS[cats.length % CATEGORY_COLORS.length]
    const row: Category = { name, color, order: cats.length }
    const id = await db.categories.add(row)
    setCats((prev) => [...prev, { ...row, id }])
    setCategoryId(id)
    onCategoriesChanged?.()
  }

  async function removeCategory(c: Category) {
    const used = await db.entries.where('categoryId').equals(c.id!).count()
    const text =
      used > 0
        ? t(
            `「${c.name}」下还有 ${used} 条记录，删掉后这些记录会变成「没分类」。记录本身不会丢。`,
            `${used} entries use “${c.name}”. They become “Unfiled” — nothing is deleted.`,
          )
        : t(`删除「${c.name}」？`, `Delete “${c.name}”?`)
    if (!window.confirm(text)) return
    await db.categories.delete(c.id!)
    setCats((prev) => prev.filter((x) => x.id !== c.id))
    if (categoryId === c.id) setCategoryId(null)
    onCategoriesChanged?.()
  }

  /* ---------- 长按调顺序 ---------- */

  /** 把一个东西挪到第几个位置（拖动的结果） */
  function moveTo<T>(list: T[], from: number, to: number): T[] {
    if (from < 0 || from === to || from >= list.length) return list
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  }

  function moveCategory(id: number, to: number) {
    setCats((prev) => moveTo(prev, prev.findIndex((c) => c.id === id), to))
  }

  function movePreset(d: number, to: number) {
    setPresets((prev) => moveTo(prev, prev.indexOf(d), to))
  }

  /* ---------- 时长 ---------- */

  async function savePresets(next: number[]) {
    setPresets(next)
    try {
      await saveDurationPresets(next)
    } catch {
      // 这次没存上也不影响当前这一笔
    }
  }

  /** 编辑时长时点一下：从快捷标签里删掉（这一笔的时长不变） */
  function removePreset(d: number) {
    savePresets(presetsRef.current.filter((x) => x !== d))
    // 正好选着它：标签没了，但这一笔的分钟数还在——把自填那一格打开
    if (duration === d) setCustomOpen(true)
  }

  /** 编辑时长时用 ＋ 新建一个，排在最后；建完不自动选中，点一下才用 */
  function addPreset() {
    const n = parseDurInput(durInput)
    setDurAdding(false)
    setDurInput('')
    if (n == null) return
    if (presetsRef.current.includes(n)) return
    savePresets([...presetsRef.current, n])
  }

  /** 拖完之后把新的顺序存下来 */
  async function commitPresetOrder() {
    await savePresets(presetsRef.current)
  }

  /** 改回「按常用排」：名单删掉，重新按历史使用次数自动算 */
  async function sortDurationsByUse() {
    try {
      await clearDurationPresets()
    } catch {
      // 删不掉也不影响这次排序
    }
    setPresets(frequent)
  }

  async function commitOrder() {
    const rows = catsRef.current.map((c, i) => ({ ...c, order: i }))
    setCats(rows)
    try {
      await db.categories.bulkPut(rows)
      await db.settings.put({ key: ORDER_KEY, value: true })
      setOrderManual(true)
      onCategoriesChanged?.()
    } catch {
      // 顺序这次没存上就算了，下次打开还会按常用排
    }
  }

  /** 改回「按常用排」，手动顺序就作废了 */
  async function sortByFrequency() {
    try {
      await db.settings.delete(ORDER_KEY)
    } catch {
      // 删不掉也不影响这次排序
    }
    setOrderManual(false)
    setCats((prev) => sortByUse(prev, catUse))
    onCategoriesChanged?.()
  }

  /* ---------- 动作 ---------- */

  function addGroup(m: { id?: number; name: string }) {
    const name = m.name.trim().replace(/\s+/g, ' ')
    if (!name) return
    const dup = groups.some((g) =>
      m.id != null ? g.movementId === m.id : normName(g.name) === normName(name),
    )
    if (dup) {
      setMvQuery('')
      return
    }
    const key = nextKey()
    const first: Bullet = { id: nextBulletId(), text: '', level: 0 }
    setGroups((prev) => [...prev, { key, movementId: m.id, name, bullets: [first] }])
    setMvQuery('')
    setFocusReq({ id: first.id, caret: 'start' })
  }

  function removeGroup(g: PointGroup) {
    if (
      g.bullets.some((b) => b.text.trim()) &&
      !window.confirm(
        t(
          `删掉「${g.name}」这一条？下面的要点会一起删掉。`,
          `Remove “${g.name}”? Its notes go with it.`,
        ),
      )
    ) {
      return
    }
    if (nameEdit?.key === g.key) setNameEdit(null)
    setGroups((prev) => prev.filter((x) => x.key !== g.key))
  }

  /** 这一条在哪：找不到就什么也不做（比如刚被删掉） */
  function bulletAt(key: string, id: string) {
    const g = groups.find((x) => x.key === key)
    const i = g ? g.bullets.findIndex((b) => b.id === id) : -1
    return g && i >= 0 ? { g, i, b: g.bullets[i] } : null
  }

  function replaceBullets(key: string, bullets: Bullet[]) {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, bullets } : g)))
  }

  function setBullet(key: string, id: string, text: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.key === key
          ? { ...g, bullets: g.bullets.map((b) => (b.id === id ? { ...b, text } : b)) }
          : g,
      ),
    )
  }

  function setLevel(key: string, id: string, level: number) {
    setGroups((prev) =>
      prev.map((g) =>
        g.key === key
          ? {
              ...g,
              bullets: g.bullets.map((b) => (b.id === id ? { ...b, level } : b)),
            }
          : g,
      ),
    )
  }

  /** 点前面的小圆点：一级 ↔ 缩进一级 */
  function toggleLevel(key: string, id: string) {
    const hit = bulletAt(key, id)
    if (!hit) return
    setLevel(key, id, hit.b.level > 0 ? 0 : 1)
  }

  /** Tab / Shift+Tab：只改这一条的层级，光标留在原处 */
  function indentBullet(key: string, id: string, dir: 1 | -1, caret: number) {
    const hit = bulletAt(key, id)
    if (!hit) return
    const level = Math.max(0, Math.min(1, hit.b.level + dir))
    if (level !== hit.b.level) setLevel(key, id, level)
    // 层级变了会重画，把光标再放回原处，别让她重新点
    setFocusReq({ id, caret })
  }

  /**
   * 回车：在光标处把这行拆成两条，新的紧跟在下面。
   * - 行首回车：在上面插一条空的，原文不动
   * - 空行回车：缩进的就退回一级；一级的空行就收掉，焦点回上一条
   * - 新的一条跟着当前这条的层级走，缩进里回车还是缩进的
   */
  function handleEnter(key: string, id: string, start: number, end: number) {
    const hit = bulletAt(key, id)
    if (!hit) return
    const { g, i, b } = hit

    if (!b.text.trim()) {
      if (b.level > 0) {
        setLevel(key, id, 0)
        setFocusReq({ id, caret: 'end' })
        return
      }
      if (g.bullets.length > 1) {
        const back = g.bullets[i - 1] ?? g.bullets[i + 1]
        replaceBullets(
          key,
          g.bullets.filter((x) => x.id !== id),
        )
        setFocusReq({ id: back.id, caret: i > 0 ? 'end' : 'start' })
      }
      return
    }

    if (start === 0 && end === 0) {
      const nb: Bullet = { id: nextBulletId(), text: '', level: b.level }
      const bullets = [...g.bullets]
      bullets.splice(i, 0, nb)
      replaceBullets(key, bullets)
      setFocusReq({ id: nb.id, caret: 'start' })
      return
    }

    // 选中的那一段回车就没了，和普通输入框一样
    const nb: Bullet = { id: nextBulletId(), text: b.text.slice(end), level: b.level }
    const bullets = g.bullets.map((x, j) => (j === i ? { ...x, text: b.text.slice(0, start) } : x))
    bullets.splice(i + 1, 0, nb)
    replaceBullets(key, bullets)
    setFocusReq({ id: nb.id, caret: 'start' })
  }

  /**
   * 光标在行首按退格：有字就并到上一条，空行就删掉，
   * 两种情况焦点都回到上一条的末尾。
   */
  function handleBackspace(key: string, id: string) {
    const hit = bulletAt(key, id)
    if (!hit) return
    const { g, i, b } = hit
    if (i === 0) return
    const prev = g.bullets[i - 1]

    if (!b.text) {
      replaceBullets(
        key,
        g.bullets.filter((x) => x.id !== id),
      )
      setFocusReq({ id: prev.id, caret: 'end' })
      return
    }

    const join = prev.text.length
    replaceBullets(
      key,
      g.bullets
        .map((x) => (x.id === prev.id ? { ...x, text: x.text + b.text } : x))
        .filter((x) => x.id !== id),
    )
    setFocusReq({ id: prev.id, caret: join })
  }

  /** 粘贴一整段多行的文字：一行一条要点，行首的 - / • / 1. 都去掉 */
  function handlePaste(key: string, id: string, text: string, start: number, end: number) {
    const hit = bulletAt(key, id)
    if (!hit) return
    const { g, i, b } = hit
    const lines = text
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*•·–—]|\d+[.)])\s+/, '').trim())
    while (lines.length && !lines[0]) lines.shift()
    while (lines.length && !lines[lines.length - 1]) lines.pop()
    if (lines.length <= 1) return

    const before = b.text.slice(0, start)
    const after = b.text.slice(end)
    const made: Bullet[] = lines
      .slice(1)
      .map((line) => ({ id: nextBulletId(), text: line, level: b.level }))
    made[made.length - 1].text += after

    const bullets = g.bullets.map((x, j) => (j === i ? { ...x, text: before + lines[0] } : x))
    bullets.splice(i + 1, 0, ...made)
    replaceBullets(key, bullets)
    setFocusReq({ id: made[made.length - 1].id, caret: 'end' })
  }

  /** 「＋ 一条」：在这个动作的最后加一条，层级跟着最后一条 */
  function addBullet(key: string) {
    const g = groups.find((x) => x.key === key)
    if (!g) return
    const nb: Bullet = {
      id: nextBulletId(),
      text: '',
      level: g.bullets[g.bullets.length - 1]?.level ?? 0,
    }
    replaceBullets(key, [...g.bullets, nb])
    setFocusReq({ id: nb.id, caret: 'start' })
  }

  /** 长按圆点拖动：把这条要点挪到第几个位置 */
  function moveBullet(key: string, id: string, to: number) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.key !== key) return g
        const from = g.bullets.findIndex((b) => b.id === id)
        if (from < 0) return g
        const next = [...g.bullets]
        const [item] = next.splice(from, 1)
        next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
        return { ...g, bullets: next }
      }),
    )
  }

  /**
   * 改动作名：存着的动作名是所有记录共用的，改了就一起改；
   * 只有这一条记录用到它时不用问，多条记录共用的先说清后果再改。
   */
  async function commitName(g: PointGroup) {
    const pending = nameEdit
    if (!pending || pending.key !== g.key) return
    setNameEdit(null)
    const name = pending.draft.trim().replace(/\s+/g, ' ')
    if (!name || normName(name) === normName(g.name)) return
    if (groups.some((x) => x.key !== g.key && normName(x.name) === normName(name))) {
      flashHint(t('这个动作已经在上面了', 'That movement is already in this entry'))
      return
    }
    if (g.movementId != null) {
      try {
        const used = await db.entries.where('movementIds').equals(g.movementId).count()
        if (
          used > 1 &&
          !window.confirm(
            t(
              `「${displayMove(g.name)}」在 ${used} 条记录里都有。改名后这 ${used} 条会一起变成「${displayMove(name)}」。`,
              `“${displayMove(g.name)}” appears in ${used} entries. They will all be renamed to “${displayMove(name)}”.`,
            ),
          )
        ) {
          return
        }
      } catch {
        // 数不出来就不多问，照常改
      }
    }
    setGroups((prev) => prev.map((x) => (x.key === g.key ? { ...x, name } : x)))
  }

  const candidates = useMemo(() => {
    const q = mvQuery.trim()
    // 不打字就不提示「常用动作」，这一栏保持安静
    if (!q) return []
    const taken = new Set(groups.map((g) => normName(g.name)))
    const seen = new Set<string>()
    const pool: { id?: number; name: string }[] = []
    const collect = (item: { id?: number; name: string }) => {
      const k = normName(item.name)
      if (seen.has(k) || taken.has(k)) return
      seen.add(k)
      pool.push(item)
    }
    // 自己库里的动作排前面，再补上内置的法文术语
    for (const m of movements) collect({ id: m.id, name: m.name })
    for (const name of BALLET_TERMS) collect({ name })
    return pool
      .map((m) => ({ m, s: matchScore(m.name, q) }))
      .filter((x) => x.s >= 0)
      .sort(
        (a, b) =>
          a.s - b.s ||
          a.m.name.length - b.m.name.length ||
          a.m.name.localeCompare(b.m.name),
      )
      .slice(0, 8)
      .map((x) => x.m)
  }, [movements, groups, mvQuery])

  const newName = mvQuery.trim()
  // 重音不算区别：打 developpe 就等于 déjà 有 développé，不必再建一个
  const canCreate =
    newName.length > 0 &&
    !candidates.some((m) => normName(m.name) === normName(newName)) &&
    !groups.some((g) => normName(g.name) === normName(newName))

  /* ---------- 保存 ---------- */

  async function save() {
    if (busy) return
    const hasBullets = groups.some((g) => g.bullets.some((b) => b.text.trim()))
    // 老记录里「这节课」的文字已经不再编辑，但它还算这条记录的内容
    const hasLegacy = !!editing?.note.trim()
    const hasContent = duration > 0 || hasBullets || hasLegacy || images.length > 0
    if (!hasContent) {
      setHint(
        withPhotos
          ? t('至少记一样：时长、动作要点或照片', 'Add at least one: time, a note or a photo')
          : t('至少记一样：时长或动作要点', 'Add at least one: time or a note'),
      )
      return
    }
    setBusy(true)
    try {
      const movementIds: number[] = []
      const points: EntryPoint[] = []
      /** 在面板里改过名字的动作，保存时一起改掉（所有记录共用这个名字） */
      const renamed: string[] = []
      for (const g of groups) {
        const name = g.name.trim().replace(/\s+/g, ' ')
        let id = g.movementId

        if (id != null) {
          const lib = movements.find((m) => m.id === id)
          if (lib && normName(lib.name) !== normName(name)) {
            // 库里已经有同名的动作：改用那一个，不造两个一样的
            const same = movements.find((m) => m.id !== id && normName(m.name) === normName(name))
            if (same) {
              id = same.id!
            } else {
              await db.movements.update(id, { name })
              renamed.push(name)
            }
          }
        }

        if (id == null) {
          const existing = movements.find((m) => normName(m.name) === normName(name))
          id = existing ? existing.id! : await db.movements.add({ name, createdAt: Date.now() })
        }

        if (!movementIds.includes(id)) movementIds.push(id)
        for (const b of g.bullets) {
          const text = b.text.trim()
          if (text) points.push({ movementId: id, text, ...(b.level > 0 ? { level: b.level } : {}) })
        }
      }

      // 不再写 note：现在只在「动作 & 手记」里记，老记录的 note 原样留着
      const payload = {
        date: fromDateInput(dateValue),
        durationMin: Math.max(0, Math.round(duration)),
        categoryId,
        movementIds,
        points,
        images,
        // 改一条导入来的记录（比如补个类型）不该把它变成「手记的」，
        // 否则「清空手表记录」会漏掉它，常用时长也会被它的怪时长带偏
        source: editing ? editing.source : ('manual' as const),
      }

      if (editing) {
        await db.entries.update(editing.id!, payload)
      } else {
        await db.entries.add({ ...payload, note: '', createdAt: Date.now() })
      }
      onSaved(
        renamed.length > 0
          ? t('已保存，动作名也一起改了', 'Saved — movement renamed everywhere')
          : editing
            ? t('已保存', 'Saved')
            : t('记下了', 'Noted'),
      )
    } catch (err) {
      console.error(err)
      setHint(t('保存失败，再试一次', 'Could not save — try again'))
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    if (!window.confirm(t('删除这一笔？删掉就找不回来了。', 'Delete this entry? It can’t be undone.')))
      return
    await db.entries.delete(editing.id!)
    onSaved(t('已删除', 'Deleted'))
  }

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <div>
            <div className="sheet-kicker">{weekdayCN(fromDateInput(dateValue))}</div>
            <h2 className="sheet-title">{editing ? t('改这一笔', 'Edit entry') : t('记一笔', 'New entry')}</h2>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label={t('关闭', 'Close')}>
            ×
          </button>
        </header>

        <div className="sheet-body">
          {!editing && entries.length > 0 && (
            <div className="day-list">
              <div className="label">{t('这一天', 'This day')}</div>
              {entries.map((e) => (
                <button key={e.id} type="button" className="day-item" onClick={() => reset(e)}>
                  <span className="day-item-text">{entrySummary(e, movements)}</span>
                  {e.durationMin > 0 && (
                    <span className="day-item-dur">{formatDuration(e.durationMin)}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <input
            className="date-line"
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
          />

          <div className="field">
            <div className="label-row">
              <span className="label">{t('时长', 'Duration')}</span>
              <span className="label-actions">
                {!durEdit && (
                  <span className="label-hint">{t('长按调顺序', 'Hold to reorder')}</span>
                )}
                {durEdit && (
                  <button type="button" className="label-action" onClick={sortDurationsByUse}>
                    {t('按常用排序', 'By use')}
                  </button>
                )}
                <button
                  type="button"
                  className="label-action"
                  onClick={() => {
                    setDurEdit((v) => !v)
                    setDurAdding(false)
                    setDurInput('')
                  }}
                >
                  {durEdit ? t('完成', 'Done') : t('编辑', 'Edit')}
                </button>
              </span>
            </div>
            <div className="chips chips-scroll" ref={durRowRef}>
              {presets.map((d) =>
                durEdit ? (
                  <button
                    key={d}
                    type="button"
                    className="chip chip-drop"
                    onClick={() => removePreset(d)}
                    aria-label={t(`删掉 ${d} 分这个快捷时长`, `Remove the ${d} min preset`)}
                  >
                    {chipDuration(d)}
                    <span className="chip-x" aria-hidden="true">
                      ×
                    </span>
                  </button>
                ) : (
                  <button
                    key={d}
                    type="button"
                    data-dur={d}
                    className={
                      'chip' +
                      (duration === d ? ' chip-on' : '') +
                      (durDrag.dragging === d ? ' chip-dragging' : '')
                    }
                    style={durDrag.dragging === d ? { touchAction: 'none' } : undefined}
                    onPointerDown={(e) =>
                      durDrag.startHold(e, d, { move: movePreset, drop: commitPresetOrder })
                    }
                    onClick={() => {
                      if (Date.now() < durDrag.suppressClick.current) return
                      setDuration(d)
                      setCustomOpen(false)
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {chipDuration(d)}
                  </button>
                ),
              )}
              {durEdit ? (
                durAdding ? (
                  <>
                  <input
                    className="chip chip-input chip-input-num"
                    value={durInput}
                    autoFocus
                    inputMode="decimal"
                    placeholder={t('1.5 / 45', '1.5 / 45')}
                    aria-label={t(
                      '新的常用时长：1.5 表示 1.5 小时，45 表示 45 分钟',
                      'New preset: 1.5 means 1.5 hours, 45 means 45 minutes',
                    )}
                    onChange={(e) => setDurInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addPreset()
                      } else if (e.key === 'Escape') {
                        setDurAdding(false)
                        setDurInput('')
                      }
                    }}
                    onBlur={addPreset}
                  />
                  {durPreview != null && (
                    <span className="dur-hint">= {chipDuration(durPreview)}</span>
                  )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="chip chip-plus"
                    onClick={() => setDurAdding(true)}
                    aria-label={t('新的常用时长', 'New preset')}
                  >
                    ＋
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className={'chip chip-plus' + (customOpen ? ' chip-on' : '')}
                  onClick={() => setCustomOpen((v) => !v)}
                  aria-label={t('自己填时长', 'Enter minutes')}
                >
                  ＋
                </button>
              )}
            </div>
            {customOpen && !durEdit && (
              <div className="custom-dur">
                <input
                  className="num-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={duration || ''}
                  onChange={(e) => setDuration(Number(e.target.value) || 0)}
                  autoFocus
                />
                <span>{t('分钟', 'min')}</span>
              </div>
            )}
          </div>

          <div className="field">
            <div className="label-row">
              <span className="label">{t('类型', 'Class type')}</span>
              <span className="label-actions">
                {!catEdit && (
                  <span className="label-hint">{t('长按调顺序', 'Hold to reorder')}</span>
                )}
                {catEdit && (
                  <button type="button" className="label-action" onClick={sortByFrequency}>
                    {t('按常用排序', 'By use')}
                  </button>
                )}
                <button
                  type="button"
                  className="label-action"
                  onClick={() => {
                    setCatEdit((v) => !v)
                    setCatAdding(false)
                    setCatInput('')
                  }}
                >
                  {catEdit ? t('完成', 'Done') : t('编辑', 'Edit')}
                </button>
              </span>
            </div>
            <div className="chips chips-scroll" ref={catRowRef}>
              {cats.map((c) =>
                catEdit ? (
                  <button
                    key={c.id}
                    type="button"
                    className="chip chip-dot chip-drop"
                    onClick={() => removeCategory(c)}
                    aria-label={t(`删除类型 ${c.name}`, `Delete type ${c.name}`)}
                  >
                    <i style={{ background: c.color }} />
                    {c.name}
                    <span className="chip-x" aria-hidden="true">
                      ×
                    </span>
                  </button>
                ) : (
                  <button
                    key={c.id}
                    type="button"
                    data-cat-id={c.id}
                    className={
                      'chip chip-dot' +
                      (categoryId === c.id ? ' chip-on' : '') +
                      (catDrag.dragging === c.id ? ' chip-dragging' : '')
                    }
                    style={catDrag.dragging === c.id ? { touchAction: 'none' } : undefined}
                    onPointerDown={(e) =>
                      catDrag.startHold(e, c.id!, { move: moveCategory, drop: commitOrder })
                    }
                    onClick={() => {
                      if (Date.now() < catDrag.suppressClick.current) return
                      setCategoryId(categoryId === c.id ? null : c.id!)
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <i style={{ background: c.color }} />
                    {c.name}
                  </button>
                ),
              )}
              {catEdit &&
                (catAdding ? (
                  <input
                    className="chip chip-input"
                    value={catInput}
                    autoFocus
                    aria-label={t('新类型的名字', 'New type name')}
                    onChange={(e) => setCatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCategory()
                      } else if (e.key === 'Escape') {
                        setCatAdding(false)
                        setCatInput('')
                      }
                    }}
                    onBlur={addCategory}
                  />
                ) : (
                  <button
                    type="button"
                    className="chip chip-plus"
                    onClick={() => setCatAdding(true)}
                    aria-label={t('新类型', 'New type')}
                  >
                    ＋
                  </button>
                ))}
            </div>
          </div>

          <div className="field">
            <div className="label-row">
              <span className="label">{t('动作 & 手记', 'Movements & notes')}</span>
              {groups.length > 0 && (
                <span className="label-hint">
                  {t(
                    '点名字改名 · 圆点缩进 · 长按拖动',
                    'Tap name to rename · dot to indent · hold to drag',
                  )}
                </span>
              )}
            </div>

            {groups.map((g) => (
              <div className="mv" key={g.key}>
                <div className="mv-head">
                  {nameEdit?.key === g.key ? (
                    <input
                      className="mv-name-input"
                      value={nameEdit.draft}
                      autoFocus
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-label={t('动作名', 'Movement name')}
                      onChange={(e) => setNameEdit({ key: g.key, draft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          e.currentTarget.blur()
                        } else if (e.key === 'Escape') {
                          nameCancel.current = true
                          e.currentTarget.blur()
                        }
                      }}
                      onBlur={() => {
                        if (nameCancel.current) {
                          nameCancel.current = false
                          setNameEdit(null)
                        } else {
                          commitName(g)
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="mv-name"
                      onClick={() => setNameEdit({ key: g.key, draft: g.name })}
                      aria-label={t(`修改动作名 ${g.name}`, `Rename ${g.name}`)}
                    >
                      {displayMove(g.name)}
                    </button>
                  )}
                  <button
                    type="button"
                    className="mv-x"
                    onClick={() => removeGroup(g)}
                    aria-label={t(`移除动作 ${g.name}`, `Remove ${g.name}`)}
                  >
                    ×
                  </button>
                </div>

                <div
                  className="mv-points"
                  ref={(el) => {
                    groupRows.current.set(g.key, el)
                  }}
                >
                  {g.bullets.map((b, i) => (
                    <div
                      className={
                        'point' +
                        (b.level > 0 ? ' point-sub' : '') +
                        (bulletDrag.dragging === b.id ? ' point-dragging' : '')
                      }
                      key={b.id}
                      data-bullet-id={b.id}
                    >
                      <button
                        type="button"
                        className={'point-mark' + (b.level > 0 ? ' point-mark-sub' : '')}
                        onPointerDown={(e) => {
                          dragRowRef.current = groupRows.current.get(g.key) ?? null
                          bulletDrag.startHold(e, b.id, {
                            move: (id, to) => moveBullet(g.key, id, to),
                            drop: () => {},
                          })
                        }}
                        onClick={() => {
                          if (Date.now() < bulletDrag.suppressClick.current) return
                          toggleLevel(g.key, b.id)
                        }}
                        aria-label={
                          b.level > 0
                            ? t('这一条取消缩进（长按可上下拖动）', 'Outdent this line (hold to drag)')
                            : t('这一条缩进一级（长按可上下拖动）', 'Indent this line (hold to drag)')
                        }
                      >
                        {b.level > 0 ? '↳' : '•'}
                      </button>
                      <PointInput
                        value={b.text}
                        label={t(`${g.name} 第 ${i + 1} 条要点`, `${g.name} point ${i + 1}`)}
                        placeholder={i === 0 ? t('这个动作的要点', 'What to remember') : ''}
                        focus={focusReq?.id === b.id ? focusReq.caret : undefined}
                        onFocused={() => setFocusReq(null)}
                        onChange={(v) => setBullet(g.key, b.id, v)}
                        onEnter={(start, end) => handleEnter(g.key, b.id, start, end)}
                        onBackspace={() => handleBackspace(g.key, b.id)}
                        onIndent={(dir, caret) => indentBullet(g.key, b.id, dir, caret)}
                        onPasteText={(text, start, end) =>
                          handlePaste(g.key, b.id, text, start, end)
                        }
                      />
                    </div>
                  ))}
                </div>

                <button type="button" className="mv-add" onClick={() => addBullet(g.key)}>
                  {t('＋ 一条', '＋ point')}
                </button>
              </div>
            ))}

            <div className="tag-box mv-picker">
              <input
                className="tag-input"
                value={mvQuery}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setMvQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (candidates.length > 0) addGroup(candidates[0])
                    else if (canCreate) addGroup({ name: newName })
                  }
                }}
                placeholder={t(
                  '加动作：名字或首字母，比如 rond、rdj',
                  'Add a movement: name or initials, e.g. rond, rdj',
                )}
                aria-label={t('加动作', 'Add a movement')}
              />
            </div>
            {(candidates.length > 0 || canCreate) && (
              <div className="chips suggestions">
                {candidates.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chip chip-quiet"
                    onClick={() => addGroup(m)}
                  >
                    {displayMove(m.name)}
                  </button>
                ))}
                {/* 候选里没有一模一样的，就给她一个字不差的入口，不要只给最像的 */}
                {canCreate && (
                  <button
                    type="button"
                    className="chip chip-quiet chip-create"
                    onClick={() => addGroup({ name: newName })}
                  >
                    {t(`新建「${newName}」`, `Create “${newName}”`)}
                  </button>
                )}
              </div>
            )}
          </div>

          {withPhotos && (
            <div className="field">
              <div className="label">{t('照片', 'Photos')}</div>
              <div className="photos">
                {urls.map((u, i) => (
                  <div className="photo" key={i}>
                    <img src={u} alt="" />
                    <button
                      type="button"
                      className="photo-x"
                      onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={t('移除照片', 'Remove photo')}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className="photo-add" onClick={() => fileRef.current?.click()}>
                  ＋
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = e.target.files
                  if (files) setImages((prev) => [...prev, ...Array.from(files)])
                  e.target.value = ''
                }}
              />
            </div>
          )}

          {hint && <p className="sheet-hint">{hint}</p>}

          <div className="sheet-actions">
            {editing && (
              <button className="btn btn-quiet" onClick={remove}>
                {t('删除', 'Delete')}
              </button>
            )}
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {editing ? t('保存修改', 'Save changes') : t('记下', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
