import { useEffect, useMemo, useState } from 'react'
import { db, type Category, type Entry, type Movement } from '../db'
import { entriesOnDay, frequentDurations, isNote } from '../lib/entries'
import { formatDuration, fromDateInput, monthCN, weekdayCN } from '../lib/time'
import { useBlobUrls } from '../hooks/useBlobUrls'
import { EntrySheet } from '../components/EntrySheet'
import { Toast } from '../components/Toast'
import { useToast } from '../hooks/useToast'

type TimeFilter = 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom'

const TIME_LABEL: Record<TimeFilter, string> = {
  thisMonth: '本月',
  lastMonth: '上月',
  thisYear: '今年',
  all: '全部',
  custom: '自定义',
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

function NoteCard({
  entry,
  movements,
  categories,
  onOpen,
  onView,
}: {
  entry: Entry
  movements: Movement[]
  categories: Category[]
  onOpen: () => void
  onView: (url: string) => void
}) {
  const urls = useBlobUrls(entry.images)
  const names = entry.movementIds
    .map((id) => movements.find((m) => m.id === id)?.name)
    .filter(Boolean)
  const cat = categories.find((c) => c.id === entry.categoryId)

  return (
    <article className="note" onClick={onOpen}>
      <header className="note-head">
        <span className="note-day">
          <b>{new Date(entry.date).getDate()}</b>
          <i>{weekdayCN(entry.date)}</i>
        </span>
        <span className="note-meta">
          {names.length > 0 && <span className="note-moves">{names.join(' · ')}</span>}
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
      {entry.note && <p className="note-text">{entry.note}</p>}
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
  const [sheet, setSheet] = useState<Entry | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
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
    return entries
      .filter((e) => isNote(e))
      .filter((e) => inRange(e, filter, from, to))
      .filter((e) => picked.size === 0 || e.movementIds.some((id) => picked.has(id)))
      .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt)
  }, [entries, filter, from, to, picked])

  const frequent = useMemo(() => frequentDurations(entries), [entries])

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  let lastGroup = ''

  return (
    <div className="page">
      <header className="topbar">
        <span className="wordmark">芭蕾手账</span>
      </header>

      <h1 className="page-title">笔记</h1>
      <p className="page-sub">这个月写了什么，练到哪个动作卡住，都在这里。</p>

      <div className="chips chips-scroll filter-row">
        {(Object.keys(TIME_LABEL) as TimeFilter[]).map((t) => (
          <button
            key={t}
            className={'chip' + (filter === t ? ' chip-on' : '')}
            onClick={() => setFilter(t)}
          >
            {TIME_LABEL[t]}
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
            全部动作
          </button>
          {movements.map((m) => (
            <button
              key={m.id}
              className={'chip chip-quiet' + (picked.has(m.id!) ? ' chip-on' : '')}
              onClick={() => toggle(m.id!)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      <p className="count">{notes.length} 条笔记</p>

      {notes.length === 0 ? (
        <p className="empty">这个范围里还没有笔记。换个时间，或者先去日历记一笔。</p>
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
                  onOpen={() => setSheet(e)}
                  onView={setViewing}
                />
              </div>
            )
          })}
        </div>
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
          onClose={() => setSheet(null)}
          onSaved={(m) => {
            setSheet(null)
            load()
            show(m)
          }}
        />
      )}

      <Toast msg={msg} />
    </div>
  )
}
