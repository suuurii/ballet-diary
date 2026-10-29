import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, type Category, type Entry, type Movement } from '../db'
import { entriesOnDay, frequentDurations, sumByDay } from '../lib/entries'
import { allTimeStats, getYearGoal, yearStats } from '../lib/goal'
import { formatHours, monthCN, startOfDay } from '../lib/time'
import { MonthCalendar } from '../components/MonthCalendar'
import { EntrySheet } from '../components/EntrySheet'
import { YearProgress } from '../components/YearProgress'
import { GoalSheet } from '../components/GoalSheet'
import { Toast } from '../components/Toast'
import { useToast } from '../hooks/useToast'

interface SheetState {
  date: number
  entry?: Entry
}

export function CalendarPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [goalHours, setGoalHours] = useState<number | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const { msg, show } = useToast()

  const today = startOfDay(Date.now())
  const year = new Date().getFullYear()

  async function load() {
    const [es, cs, ms, goal] = await Promise.all([
      db.entries.toArray(),
      db.categories.orderBy('order').toArray(),
      db.movements.toArray(),
      getYearGoal(),
    ])
    setEntries(es)
    setCategories(cs)
    setMovements(ms)
    setGoalHours(goal)
  }

  useEffect(() => {
    load()
    const onReady = () => load()
    window.addEventListener('ballet-ready', onReady)
    return () => window.removeEventListener('ballet-ready', onReady)
  }, [])

  const totals = useMemo(() => sumByDay(entries), [entries])

  const monthEntries = useMemo(() => {
    const from = new Date(cursor.year, cursor.month, 1).getTime()
    const to = new Date(cursor.year, cursor.month + 1, 1).getTime()
    return entries
      .filter((e) => e.date >= from && e.date < to)
      .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt)
  }, [entries, cursor])

  const monthMinutes = monthEntries.reduce((s, e) => s + e.durationMin, 0)
  const monthDays = new Set(monthEntries.filter((e) => e.durationMin > 0).map((e) => e.date)).size
  const frequent = useMemo(() => frequentDurations(entries), [entries])
  const stats = useMemo(() => yearStats(entries, year), [entries, year])
  const allTime = useMemo(() => allTimeStats(entries), [entries])

  const move = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const isCurrentMonth = cursor.year === new Date().getFullYear() && cursor.month === new Date().getMonth()

  return (
    <div className="page">
      <header className="topbar">
        <span className="wordmark">芭蕾手账</span>
        <Link to="/settings" className="icon-btn" aria-label="设置">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </header>

      <YearProgress
        year={year}
        yearMinutes={stats.minutes}
        yearSessions={stats.sessions}
        totalMinutes={allTime.minutes}
        totalSessions={allTime.sessions}
        firstDate={allTime.firstDate}
        goalHours={goalHours}
        onEditGoal={() => setGoalOpen(true)}
      />

      <section className="month-head">
        <div>
          <div className="month-year">{cursor.year}</div>
          <h1 className="month-name">{monthCN(cursor.month)}</h1>
        </div>
        <div className="month-nav">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="上个月">
            ‹
          </button>
          <button className="icon-btn" onClick={() => move(1)} aria-label="下个月">
            ›
          </button>
        </div>
      </section>

      <p className="month-sum">
        {monthDays > 0 ? (
          <>
            <b>{monthDays}</b> 天 · <b>{formatHours(monthMinutes)}</b>
          </>
        ) : (
          '这个月还没有练习'
        )}
        {!isCurrentMonth && (
          <button className="back-today" onClick={() => setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() })}>
            回到本月
          </button>
        )}
        <span className="heat-legend">
          <span>少</span>
          {[1, 2, 3, 4].map((l) => (
            <i key={l} data-level={l} />
          ))}
          <span>多</span>
        </span>
      </p>

      <MonthCalendar
        year={cursor.year}
        month={cursor.month}
        totals={totals}
        selected={sheet?.date ?? null}
        onSelect={(day) => setSheet({ date: day })}
      />

      <button className="cta" onClick={() => setSheet({ date: today })}>
        ＋ 记一笔
      </button>

      {entries.length === 0 && (
        <p className="empty empty-home">
          还没有记录。点日历上任意一天，或者「记一笔」开始。
        </p>
      )}

      {sheet && (
        <EntrySheet
          key={`${sheet.date}-${sheet.entry?.id ?? 'new'}`}
          date={sheet.date}
          initialEntry={sheet.entry}
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

      {goalOpen && (
        <GoalSheet
          year={year}
          goalHours={goalHours}
          onClose={() => setGoalOpen(false)}
          onSaved={(m) => {
            setGoalOpen(false)
            load()
            show(m)
          }}
        />
      )}

      <Toast msg={msg} />
    </div>
  )
}
