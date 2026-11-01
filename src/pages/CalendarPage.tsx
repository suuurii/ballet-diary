import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, type Category, type Entry, type Movement, type Spend } from '../db'
import { entriesOnDay, frequentDurations, sumByDay } from '../lib/entries'
import {
  allTimeStats,
  claimYearGift,
  getYearGift,
  getYearGoal,
  goalReachedDay,
  yearStats,
  type YearGift,
} from '../lib/goal'
import { spendTotals } from '../lib/spend'
import { hoursShort, pad2 } from '../lib/time'
import { MonthCalendar } from '../components/MonthCalendar'
import { EntrySheet } from '../components/EntrySheet'
import { YearProgress } from '../components/YearProgress'
import { GoalSheet } from '../components/GoalSheet'
import { MonthPickerSheet } from '../components/MonthPickerSheet'
import { SpendSheet } from '../components/SpendSheet'
import { TypeDonut } from '../components/TypeDonut'
import { LangToggle } from '../components/LangToggle'
import { Toast } from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { t, useLang } from '../lib/i18n'

interface SheetState {
  date: number
  entry?: Entry
}

export function CalendarPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [spends, setSpends] = useState<Spend[]>([])
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [goalHours, setGoalHours] = useState<number | null>(null)
  const [gift, setGift] = useState<YearGift>({ text: '', claimedAt: null })
  const [lastBackup, setLastBackup] = useState<number | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [spendOpen, setSpendOpen] = useState(false)
  const { msg, show } = useToast()
  useLang()

  const year = new Date().getFullYear()

  async function load() {
    const [es, cs, ms, goal, g, sp, backup] = await Promise.all([
      db.entries.toArray(),
      db.categories.orderBy('order').toArray(),
      db.movements.toArray(),
      getYearGoal(),
      getYearGift(),
      db.spends.toArray(),
      db.settings.get('lastBackupAt'),
    ])
    setEntries(es)
    setCategories(cs)
    setMovements(ms)
    setGoalHours(goal)
    setGift(g)
    setSpends(sp)
    setLastBackup(backup && typeof backup.value === 'number' ? backup.value : null)
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
  const spend = useMemo(() => spendTotals(spends), [spends])
  /** 今年第一次越过目标的那天，日历上留个小记号 */
  const giftDay = useMemo(
    () => goalReachedDay(entries, year, goalHours),
    [entries, year, goalHours],
  )
  /** 备份拖太久了：从没备份过用满两周提醒，备份过就一个月提醒 */
  const backupDue = useMemo(() => {
    if (entries.length === 0) return false
    const now = Date.now()
    if (lastBackup) return now - lastBackup > 30 * 86400000
    const first = Math.min(...entries.map((e) => e.createdAt))
    return now - first > 14 * 86400000
  }, [entries, lastBackup])

  async function claimGift() {
    await claimYearGift()
    await load()
    show(t('礼物收下了', 'Gift collected'))
  }

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
        <span className="wordmark">{t('芭蕾手账', 'BALLET JOURNAL')}</span>
        <div className="topbar-tools">
          <LangToggle />
          <Link
            to="/settings"
            className="icon-btn"
            aria-label={backupDue ? t('设置，该备份了', 'Settings — backup due') : t('设置', 'Settings')}
          >
          {backupDue && <i className="gear-dot" aria-hidden="true" />}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
          </Link>
        </div>
      </header>

      <YearProgress
        year={year}
        yearMinutes={stats.minutes}
        yearSessions={stats.sessions}
        totalMinutes={allTime.minutes}
        totalSessions={allTime.sessions}
        firstDate={allTime.firstDate}
        goalHours={goalHours}
        gift={gift}
        spendTotal={spend.total}
        spendCats={spend.byCat}
        onEditGoal={() => setGoalOpen(true)}
        onClaimGift={claimGift}
        onOpenSpend={() => setSpendOpen(true)}
      />

      <section className="cal-panel">
        <div className="month-head">
          <div className="mh-bar">
            <div className="month-nav">
              <button className="icon-btn" onClick={() => move(-1)} aria-label={t('上个月', 'Previous month')}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <button className="icon-btn" onClick={() => move(1)} aria-label={t('下个月', 'Next month')}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mh-row">
            <div className="mh-title">
              <button className="month-num" onClick={() => setPickerOpen(true)} aria-label={t('选择年月', 'Pick month')}>
                {cursor.year}.{pad2(cursor.month + 1)}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            {monthDays > 0 ? (
              <div className="month-sum">
                <b>{monthDays}</b>
                <span>{t('天', 'days')}</span>
                <i>·</i>
                <b>{hoursShort(monthMinutes)}</b>
              </div>
            ) : (
              <div className="month-sum month-sum-empty">{t('还没练', 'none yet')}</div>
            )}
          </div>
        </div>

        <MonthCalendar
          year={cursor.year}
          month={cursor.month}
          totals={totals}
          giftDay={giftDay}
          selected={sheet?.date ?? null}
          onSelect={(day) => setSheet({ date: day })}
        />

        <div className="cal-foot">
          <p className="cal-hint">{t(
              '点日历上任意一天，记下那天的练习',
              'Tap any day to log that practice',
            )}</p>
          {!isCurrentMonth && (
            <button
              className="back-today"
              onClick={() => setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() })}
            >
              {t('回到本月 ›', 'Back to this month ›')}
            </button>
          )}
        </div>
      </section>

      <TypeDonut entries={entries} categories={categories} />

      {entries.length === 0 && (
        <p className="empty empty-home">
          {t(
            '还没有记录。点日历上任意一天就能开始。',
            'No entries yet. Tap any day on the calendar to start.',
          )}
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
          onCategoriesChanged={load}
          onSaved={(m) => {
            setSheet(null)
            load()
            show(m)
          }}
        />
      )}

      {spendOpen && (
        <SpendSheet
          spends={spends}
          onClose={() => setSpendOpen(false)}
          onChanged={load}
        />
      )}

      {pickerOpen && (
        <MonthPickerSheet
          year={cursor.year}
          month={cursor.month}
          onClose={() => setPickerOpen(false)}
          onPick={(y, m) => {
            setCursor({ year: y, month: m })
            setPickerOpen(false)
          }}
        />
      )}

      {goalOpen && (
        <GoalSheet
          year={year}
          goalHours={goalHours}
          giftText={gift.text}
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
