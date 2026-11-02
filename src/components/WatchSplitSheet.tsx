import { useEffect, useState } from 'react'
import { db, type Category, type Entry } from '../db'
import {
  applySplit,
  assignHours,
  assignSequence,
  loadSplitHours,
  loadSplitMode,
  loadWeights,
  quotasFor,
  saveSplitHours,
  saveSplitMode,
  saveWeights,
  uncategorizedImported,
  type SplitMode,
  type Weights,
} from '../lib/imports'
import { t, useLang } from '../lib/i18n'
import { Toast } from './Toast'
import { useToast } from '../hooks/useToast'

/**
 * 给手表导进来的记录补分类。
 * 不逐天问，只问「大概各占多少」：拖几个份数，一键摊开。
 */
export function WatchSplitSheet({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const [cats, setCats] = useState<Category[]>([])
  const [weights, setWeights] = useState<Weights>({})
  /** 填小时的时候存的是输入框里的原文，好让「12.」这种半截数字能打下去 */
  const [hours, setHours] = useState<Record<number, string>>({})
  const [mode, setMode] = useState<SplitMode>('parts')
  const [entries, setEntries] = useState<Entry[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const { msg, show } = useToast()
  useLang()

  useEffect(() => {
    let alive = true
    Promise.all([
      db.categories.orderBy('order').toArray(),
      loadWeights(),
      loadSplitHours(),
      loadSplitMode(),
      uncategorizedImported(),
    ]).then(([list, saved, savedHours, savedMode, rows]) => {
      if (!alive) return
      setCats(list)
      // 第一次用：每类先各给一份，她在上面加减就行，不至于面对一排 0
      setWeights(
        Object.keys(saved).length > 0
          ? saved
          : Object.fromEntries(list.map((c) => [c.id!, 1])),
      )
      setHours(Object.fromEntries(Object.entries(savedHours).map(([k, v]) => [k, String(v)])))
      setMode(savedMode)
      setEntries(rows)
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  const total = entries.length
  const durations = entries.map((e) => e.durationMin)
  const totalMinutes = durations.reduce((s, d) => s + d, 0)

  // 只算还在的类型：某个类型删了，它留下的份数不该继续占比例
  const active: Weights = {}
  for (const c of cats) {
    const w = weights[c.id!] ?? 0
    if (w > 0) active[c.id!] = w
  }
  const sum = Object.values(active).reduce((s, w) => s + w, 0)
  const plan = total > 0 && sum > 0 ? quotasFor(total, active) : []
  const countOf = (id: number) => plan.find((p) => p.categoryId === id)?.count ?? 0
  const pctOf = (id: number) => (sum > 0 ? Math.round(((active[id] ?? 0) / sum) * 100) : 0)

  /* ---------- 按小时 ---------- */

  const hoursNum: Record<number, number> = {}
  for (const c of cats) {
    const h = Number(hours[c.id!] ?? '')
    if (Number.isFinite(h) && h > 0) hoursNum[c.id!] = h
  }
  const hoursSum = Object.values(hoursNum).reduce((s, h) => s + h, 0)
  const minuteTargets: Weights = {}
  for (const [k, h] of Object.entries(hoursNum)) minuteTargets[Number(k)] = h * 60

  // 先空跑一遍，好让她看到「这么填大概会分到多少」
  const hoursSeq = mode === 'hours' && hoursSum > 0 ? assignHours(durations, minuteTargets) : []
  const hoursStat = new Map<number, { min: number; n: number }>()
  hoursSeq.forEach((id, i) => {
    const cur = hoursStat.get(id) ?? { min: 0, n: 0 }
    cur.min += durations[i]
    cur.n += 1
    hoursStat.set(id, cur)
  })
  const hoursPct = (id: number) =>
    hoursSum > 0 ? Math.round(((hoursNum[id] ?? 0) / hoursSum) * 100) : 0

  /** 数字带一位小数，90 → 1.5，别写出 1.5000000000002 */
  const hrs = (v: number) => String(Math.round(v * 10) / 10)

  function bump(id: number, delta: number) {
    const next = { ...weights }
    const v = Math.max(0, Math.min(9, (next[id] ?? 0) + delta))
    if (v === 0) delete next[id]
    else next[id] = v
    setWeights(next)
    saveWeights(next).catch(() => {})
  }

  function switchMode(next: SplitMode) {
    if (next === mode) return
    setMode(next)
    saveSplitMode(next).catch(() => {})
    // 第一次切到「按小时」：拿现在的份数折成小时，先给个能直接用的起点
    if (next === 'hours' && Object.keys(hours).length === 0 && totalMinutes > 0 && sum > 0) {
      const est: Record<number, string> = {}
      for (const c of cats) {
        const w = active[c.id!] ?? 0
        if (w > 0) {
          est[c.id!] = hrs(Math.max(0.5, Math.round(((w / sum) * totalMinutes) / 30) / 2))
        }
      }
      setHours(est)
    }
  }

  function setHourText(id: number, text: string) {
    // 只留数字和一个小数点，省得手机上输进奇怪的东西
    const digits = text.replace(/[^\d.]/g, '')
    const dot = digits.indexOf('.')
    const clean =
      dot < 0
        ? digits
        : digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, '')
    setHours((prev) => ({ ...prev, [id]: clean.slice(0, 5) }))
  }

  function commitHours() {
    const nums: Record<number, number> = {}
    for (const [k, v] of Object.entries(hours)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) nums[Number(k)] = n
    }
    saveSplitHours(nums).catch(() => {})
  }

  const canRun = total > 0 && (mode === 'hours' ? hoursSum > 0 : plan.length > 0)

  async function run() {
    if (busy || !canRun) return
    setBusy(true)
    try {
      if (mode === 'hours') commitHours()
      const seq = mode === 'hours' ? hoursSeq : assignSequence(total, plan)
      if (seq.length === 0) return
      const n = await applySplit(entries, seq)
      show(t(`分好了 ${n} 条`, `Sorted ${n}`))
      onDone()
      // 分完就没得再分了，把列表收干净
      setEntries([])
      setTimeout(onClose, 700)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet sheet-compact" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <div>
            <div className="sheet-kicker">{t('按比例分类', 'Sort by ratio')}</div>
            <h2 className="sheet-title">
              {total > 0
                ? t(`还有 ${total} 条导入的没分类`, `${total} imported, unfiled`)
                : t('都分好了', 'All sorted')}
            </h2>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label={t('关闭', 'Close')}>
            ×
          </button>
        </header>

        <div className="sheet-body">
          {total === 0 && (
            <p className="sheet-note">
              {t(
                '导进来的记录都已经有分类了。',
                'Every imported workout already has a category.',
              )}
            </p>
          )}

          {total > 0 && (
            <>
              <p className="sheet-note">
                {mode === 'parts'
                  ? t(
                      '给每类加减份数，按大致比例摊开分，每一段日期都大致对得上。分完还能在日历里点某天单独改。',
                      'Give each type a share and they’re spread across the dates, so every stretch of time roughly matches. You can still fix any single day in the calendar.',
                    )
                  : t(
                      '直接填每类大概多少小时（比如初级 60、软开 8），按这个比例摊到各天；总数差点也没关系，会多退少补。',
                      'Type roughly how many hours each type takes (e.g. Beginner 60, Stretch 8); the dates are spread to match, and a mismatch just scales.',
                    )}
              </p>

              {ready && (
                <div className="split-modes" role="group" aria-label={t('怎么给比例', 'How to set shares')}>
                  <button
                    type="button"
                    className={`split-mode${mode === 'parts' ? ' on' : ''}`}
                    aria-pressed={mode === 'parts'}
                    onClick={() => switchMode('parts')}
                  >
                    {t('按份数', 'By share')}
                  </button>
                  <button
                    type="button"
                    className={`split-mode${mode === 'hours' ? ' on' : ''}`}
                    aria-pressed={mode === 'hours'}
                    onClick={() => switchMode('hours')}
                  >
                    {t('按小时', 'By hours')}
                  </button>
                </div>
              )}

              {!ready ? (
                <p className="sheet-note">{t('正在读…', 'Loading…')}</p>
              ) : mode === 'parts' ? (
                <div className="split-list">
                  {cats.map((c) => {
                    const w = weights[c.id!] ?? 0
                    return (
                      <div key={c.id} className="split-row">
                        <span className="dot" style={{ background: c.color }} />
                        <span className="split-name">{c.name}</span>
                        <span className="split-pct">
                          {w > 0 ? `${pctOf(c.id!)}%` : ''}
                          {w > 0 ? ` · ${t(`约 ${countOf(c.id!)} 条`, `~${countOf(c.id!)}`)}` : ''}
                        </span>
                        <span className="split-step">
                          <button
                            type="button"
                            className="split-btn"
                            onClick={() => bump(c.id!, -1)}
                            disabled={w === 0}
                            aria-label={t(`少一点 ${c.name}`, `Less ${c.name}`)}
                          >
                            −
                          </button>
                          <span className="split-num">{w || '–'}</span>
                          <button
                            type="button"
                            className="split-btn"
                            onClick={() => bump(c.id!, 1)}
                            disabled={w >= 9}
                            aria-label={t(`多一点 ${c.name}`, `More ${c.name}`)}
                          >
                            ＋
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <>
                  <div className="split-list">
                    {cats.map((c) => {
                      const st = hoursStat.get(c.id!)
                      const pct = hoursPct(c.id!)
                      const sub: string[] = []
                      if (pct > 0) sub.push(t(`约占 ${pct}%`, `${pct}%`))
                      if (st && st.n > 0) {
                        sub.push(t(`约 ${hrs(st.min / 60)} 小时 · ${st.n} 条`, `~${hrs(st.min / 60)} h · ${st.n}`))
                      }
                      return (
                        <div key={c.id} className="split-row">
                          <span className="dot" style={{ background: c.color }} />
                          <span className="split-name">
                            {c.name}
                            {sub.length > 0 && <span className="split-sub">{sub.join(' · ')}</span>}
                          </span>
                          <span className="split-hours">
                            <input
                              className="split-input"
                              type="text"
                              inputMode="decimal"
                              value={hours[c.id!] ?? ''}
                              placeholder="0"
                              aria-label={t(`${c.name} 大概多少小时`, `${c.name} hours`)}
                              onChange={(e) => setHourText(c.id!, e.target.value)}
                              onBlur={commitHours}
                            />
                            <span className="split-unit">{t('小时', 'h')}</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {hoursSum > 0 ? (
                    <p className="sheet-note split-sum">
                      {(() => {
                        const impH = totalMinutes / 60
                        const close = impH > 0 && Math.abs(hoursSum - impH) <= impH * 0.1
                        return t(
                          `已填 ${hrs(hoursSum)} 小时，导入的记录共 ${hrs(impH)} 小时` +
                            (close ? '，大致对得上。' : '，会按你填的比例缩放（多退少补）。'),
                          `You typed ${hrs(hoursSum)} h; the imported records total ${hrs(impH)} h` +
                            (close ? ' — a direct match.' : ' — it scales to your shares.'),
                        )
                      })()}
                    </p>
                  ) : (
                    <p className="sheet-note split-sum">
                      {t('填个大概就行，不用很准。', 'Rough numbers are fine.')}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {total > 0 && (
          <div className="sheet-actions">
            <button className="btn btn-primary" onClick={run} disabled={busy || !canRun}>
              {mode === 'hours'
                ? t('按这个时长分', 'Sort by these hours')
                : t('按这个比例分', 'Sort by these shares')}
            </button>
          </div>
        )}

        <Toast msg={msg} />
      </div>
    </div>
  )
}
