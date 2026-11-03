import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, type Category, type Entry, type Movement } from '../db'
import { entriesOnDay, frequentDurations, isNote } from '../lib/entries'
import { formatDuration, fromDateInput, monthCN, pad2, startOfDay, weekdayCN } from '../lib/time'
import { useBlobUrls } from '../hooks/useBlobUrls'
import { EntrySheet } from '../components/EntrySheet'
import { ExportCardSheet } from '../components/ExportCardSheet'
import { LangToggle } from '../components/LangToggle'
import { Toast } from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { t, useLang } from '../lib/i18n'
import { displayMove, normName } from '../lib/movements'

type TimeFilter = 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom'

const TIME_LABEL: Record<TimeFilter, [string, string]> = {
  thisMonth: ['本月', 'This month'],
  lastMonth: ['上月', 'Last month'],
  thisYear: ['今年', 'This year'],
  all: ['全部', 'All'],
  custom: ['自定义', 'Custom'],
}

function inRange(e: Entry, filter: TimeFilter, from: string, to: string): boolean {
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
  const thisYear = new Date(now.getFullYear(), 0, 1).getTime()
  switch (filter) {
    case 'thisMonth':
      return e.date >= thisMonth
    case 'lastMonth':
      return e.date >= lastMonth && e.date < thisMonth
    case 'thisYear':
      return e.date >= thisYear
    case 'custom': {
      const f = from ? fromDateInput(from) : -Infinity
      const t = to ? fromDateInput(to) : Infinity
      return e.date >= f && e.date <= t
    }
    default:
      return true
  }
}

/** 这条记录里能搜到的字：动作名、每个要点、这节课的话 */
function searchText(e: Entry, movements: Movement[]): string {
  const names = e.movementIds.map((id) => movements.find((m) => m.id === id)?.name || '')
  const points = (e.points || []).map((p) => p.text)
  return normName([...names, ...points, e.note].join('\n'))
}

/** 把搜到的字圈出来。重音打不打都能搜到；情况太绕时就不圈，只保证搜得到 */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  if (!needle || !lower.includes(needle)) return <>{text}</>
  const out: ReactNode[] = []
  let from = 0
  let k = 0
  for (;;) {
    const at = lower.indexOf(needle, from)
    if (at < 0) {
      out.push(text.slice(from))
      break
    }
    if (at > from) out.push(text.slice(from, at))
    out.push(<mark key={k++}>{text.slice(at, at + needle.length)}</mark>)
    from = at + needle.length
  }
  return <>{out}</>
}

function NoteCard({
  entry,
  movements,
  categories,
  picked,
  q,
  onOpen,
  onView,
}: {
  entry: Entry
  movements: Movement[]
  categories: Category[]
  /** 筛了动作就只展开这几个动作的要点，整节课的话压暗 */
  picked: Set<number>
  /** 搜索词：非空时把搜到的字圈出来 */
  q: string
  onOpen: () => void
  onView: (url: string) => void
}) {
  const urls = useBlobUrls(entry.images)
  const names = entry.movementIds
    .map((id) => movements.find((m) => m.id === id)?.name)
    .filter((n): n is string => !!n)
    .map(displayMove)
  const cat = categories.find((c) => c.id === entry.categoryId)

  const byMove = new Map<number, { text: string; level: number }[]>()
  for (const p of entry.points || []) {
    const line = { text: p.text, level: p.level === 1 ? 1 : 0 }
    const arr = byMove.get(p.movementId)
    if (arr) arr.push(line)
    else byMove.set(p.movementId, [line])
  }
  const allBlocks = [...byMove.entries()]
    .map(([id, lines]) => ({
      id,
      name: displayMove(movements.find((m) => m.id === id)?.name || t('动作', 'Movement')),
      lines,
    }))
    .sort((a, b) => entry.movementIds.indexOf(a.id) - entry.movementIds.indexOf(b.id))
  const blocks = picked.size > 0 ? allBlocks.filter((b) => picked.has(b.id)) : allBlocks
  const classLines = entry.note
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)

  return (
    <article className="note" onClick={onOpen}>
      <header className="note-head">
        <span className="note-day">
          <b>{new Date(entry.date).getDate()}</b>
          <i>{weekdayCN(entry.date)}</i>
        </span>
        <span className="note-meta">
          {/* 下面按动作分段时不再重复列名字 */}
          {names.length > 0 && allBlocks.length === 0 && (
            <span className="note-moves">
              {names.map((n, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <Highlight text={n} q={q} />
                </span>
              ))}
            </span>
          )}
          {entry.durationMin > 0 && (
            <span className="note-dur">{formatDuration(entry.durationMin)}</span>
          )}
          {cat && (
            <span className="note-cat">
              <i className="dot" style={{ background: cat.color }} />
              {cat.name}
            </span>
          )}
        </span>
      </header>
      {blocks.length > 0 && (
        <div className="note-points">
          {blocks.map((b) => (
            <div className="note-points-block" key={b.id}>
              <div className="note-points-title">
                <Highlight text={b.name} q={q} />
              </div>
              <ul>
                {b.lines.map((line, i) => (
                  <li key={i} className={line.level > 0 ? 'is-sub' : undefined}>
                    <Highlight text={line.text} q={q} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {/* 以前写在「这节课」里的文字，现在只作为这条记录的话显示，不再有标题 */}
      {classLines.length > 0 && (
        <div className={'note-points' + (picked.size > 0 ? ' is-muted' : '')}>
          <ul>
            {classLines.map((line, i) => (
              <li key={i}>
                <Highlight text={line} q={q} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {urls.length > 0 && (
        <div className="note-photos">
          {urls.map((u, i) => (
            <img
              key={i}
              src={u}
              alt=""
              onClick={(ev) => {
                ev.stopPropagation()
                onView(u)
              }}
            />
          ))}
        </div>
      )}
    </article>
  )
}

export function NotesPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filter, setFilter] = useState<TimeFilter>('thisMonth')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  // 搜索：在现在的时间 / 动作筛选里找。搜不到时会提示换到「全部」再找
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<Entry | null>(null)
  // 从笔记页也能直接记一笔，默认记在今天
  const [adding, setAdding] = useState<number | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const { msg, show } = useToast()

  async function load() {
    const [es, ms, cs] = await Promise.all([
      db.entries.toArray(),
      db.movements.toArray(),
      db.categories.orderBy('order').toArray(),
    ])
    setEntries(es)
    setMovements(ms)
    setCategories(cs)
  }

  useEffect(() => {
    load()
  }, [])

  const notes = useMemo(() => {
    const needle = normName(query.trim())
    return entries
      .filter((e) => isNote(e))
      .filter((e) => !needle || searchText(e, movements).includes(needle))
      .filter((e) => inRange(e, filter, from, to))
      .filter((e) => picked.size === 0 || e.movementIds.some((id) => picked.has(id)))
      .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt)
  }, [entries, movements, query, filter, from, to, picked])

  // 一条笔记都没有时，搜索框先不出现，免得像在空房间里喊
  const hasAnyNote = useMemo(() => entries.some(isNote), [entries])
  const q = query.trim()

  const frequent = useMemo(() => frequentDurations(entries), [entries])

  // 导出时写在卡片标题上的时间范围
  const rangeLabel = useMemo(() => {
    const now = new Date()
    if (filter === 'thisMonth') return `${now.getFullYear()}.${pad2(now.getMonth() + 1)}`
    if (filter === 'lastMonth') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}`
    }
    if (filter === 'thisYear') return t(`${now.getFullYear()} 年`, `${now.getFullYear()}`)
    if (filter === 'all') return t('全部笔记', 'All notes')
    return `${from || t('最早', 'start')} — ${to || t('今天', 'today')}`
  }, [filter, from, to])

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  let lastGroup = ''
  useLang()

  return (
    <div className="page">
      <header className="topbar">
        <span className="wordmark">{t('芭蕾手账', 'BALLET JOURNAL')}</span>
        <div className="topbar-tools">
          <LangToggle inline />
          <button className="topbar-action" onClick={() => setAdding(startOfDay(Date.now()))}>
            {t('＋ 记一笔', '＋ New entry')}
          </button>
        </div>
      </header>

      <h1 className="page-title">{t('笔记', 'Notes')}</h1>
      <p className="page-sub">
        {t(
          '这个月写了什么，练到哪个动作卡住，都在这里。',
          'What you wrote this month, and where each movement got stuck.',
        )}
      </p>

      {hasAnyNote && (
        <div className="search-field">
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="6.8" cy="6.8" r="4.9" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
              else if (e.key === 'Enter') e.currentTarget.blur()
            }}
            placeholder={t('搜动作、搜要点里的字', 'Search movements and notes')}
            aria-label={t('搜索笔记', 'Search notes')}
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button
              className="search-clear"
              onClick={() => setQuery('')}
              aria-label={t('清空搜索', 'Clear search')}
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="chips chips-scroll filter-row">
        {(Object.keys(TIME_LABEL) as TimeFilter[]).map((key) => (
          <button
            key={key}
            className={'chip' + (filter === key ? ' chip-on' : '')}
            onClick={() => setFilter(key)}
          >
            {t(TIME_LABEL[key][0], TIME_LABEL[key][1])}
          </button>
        ))}
      </div>

      {filter === 'custom' && (
        <div className="range-row">
          <input
            className="input input-sm"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="range-dash">—</span>
          <input
            className="input input-sm"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      )}

      {movements.length > 0 && (
        <div className="chips chips-scroll filter-row">
          <button
            className={'chip chip-quiet' + (picked.size === 0 ? ' chip-on' : '')}
            onClick={() => setPicked(new Set())}
          >
            {t('全部动作', 'All movements')}
          </button>
          {movements.map((m) => (
            <button
              key={m.id}
              className={'chip chip-quiet' + (picked.has(m.id!) ? ' chip-on' : '')}
              onClick={() => toggle(m.id!)}
            >
              {displayMove(m.name)}
            </button>
          ))}
        </div>
      )}

      <div className="notes-tools">
        <span className="count">
          {q
            ? t(`搜到 ${notes.length} 条`, `${notes.length} found`)
            : t(`${notes.length} 条笔记`, `${notes.length} notes`)}
        </span>
        {notes.length > 0 && (
          <button className="notes-export" onClick={() => setExporting(true)}>
            {t('导出卡片 ›', 'Export cards ›')}
          </button>
        )}
      </div>

      {notes.length === 0 ? (
        q ? (
          <div className="empty">
            <p className="empty-inline">
              {t(`没有找到「${q}」。`, `Nothing found for “${q}”.`)}
            </p>
            {filter !== 'all' && (
              <button className="text-link" onClick={() => setFilter('all')}>
                {t('在全部时间里再找一次 ›', 'Search all time ›')}
              </button>
            )}
          </div>
        ) : (
          <p className="empty">
            {t(
              '这个范围里还没有笔记。换个时间，或者点右上角「记一笔」。',
              'No notes in this range. Try another period, or tap “New entry”.',
            )}
          </p>
        )
      ) : (
        <div className="notes">
          {notes.map((e) => {
            const d = new Date(e.date)
            const group = `${d.getFullYear()}-${d.getMonth()}`
            const showHeader = group !== lastGroup
            lastGroup = group
            return (
              <div key={e.id}>
                {showHeader && (
                  <h2 className="month-divider">
                    {monthCN(d.getMonth())}
                    <span>{d.getFullYear()}</span>
                  </h2>
                )}
                <NoteCard
                  entry={e}
                  movements={movements}
                  categories={categories}
                  picked={picked}
                  q={q}
                  onOpen={() => setSheet(e)}
                  onView={setViewing}
                />
              </div>
            )
          })}
        </div>
      )}

      {exporting && (
        <ExportCardSheet
          notes={notes}
          movements={movements}
          rangeLabel={rangeLabel}
          onClose={() => setExporting(false)}
        />
      )}

      {viewing && (
        <div className="lightbox" onClick={() => setViewing(null)}>
          <img src={viewing} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {sheet && (
        <EntrySheet
          key={sheet.id}
          date={sheet.date}
          initialEntry={sheet}
          entries={entriesOnDay(entries, sheet.date)}
          categories={categories}
          movements={movements}
          frequent={frequent}
          withPhotos
          onClose={() => setSheet(null)}
          onCategoriesChanged={load}
          onSaved={(m) => {
            setSheet(null)
            load()
            show(m)
          }}
        />
      )}

      {adding != null && (
        <EntrySheet
          key={`new-${adding}`}
          date={adding}
          entries={entriesOnDay(entries, adding)}
          categories={categories}
          movements={movements}
          frequent={frequent}
          withPhotos
          onClose={() => setAdding(null)}
          onCategoriesChanged={load}
          onSaved={(m) => {
            setAdding(null)
            load()
            show(m)
          }}
        />
      )}

      <Toast msg={msg} />
    </div>
  )
}
