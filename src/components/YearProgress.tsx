import { useRef, useState } from 'react'
import { hoursText, type YearGift } from '../lib/goal'
import { money, type SpendCat } from '../lib/spend'
import { formatDateCN } from '../lib/time'
import { getLang, t, useLang } from '../lib/i18n'

function ymd(ts: number): string {
  const d = new Date(ts)
  if (getLang() === 'en') return formatDateCN(ts)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/**
 * 一张卡，左右滑两页：
 *   第 1 页 今年的练习进度（对着自己设的目标）
 *   第 2 页 累计练习（全部时间）
 */
export function YearProgress({
  year,
  yearMinutes,
  yearSessions,
  totalMinutes,
  totalSessions,
  firstDate,
  goalHours,
  gift,
  spendTotal,
  spendCats,
  onEditGoal,
  onClaimGift,
  onOpenSpend,
}: {
  year: number
  yearMinutes: number
  yearSessions: number
  totalMinutes: number
  totalSessions: number
  firstDate: number | null
  goalHours: number | null
  gift: YearGift
  spendTotal: number
  spendCats: SpendCat[]
  onEditGoal: () => void
  onClaimGift: () => void
  onOpenSpend: () => void
}) {
  useLang()
  const [page, setPage] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const yearHours = yearMinutes / 60
  const pct = goalHours ? Math.round((yearHours / goalHours) * 100) : 0
  const reached = !!goalHours && yearMinutes >= goalHours * 60

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
    <section className="goal" aria-label={t('练习时长', 'Practice time')}>
      <div className="goal-track" ref={trackRef} onScroll={onScroll}>
        <div className="goal-slide">
          <div className="goal-top">
            <span className="label goal-label">{t('今年', 'This year')} · {year}</span>
            <span className="goal-sessions">
              {t(`${yearSessions} 次练习`, `${yearSessions} sessions`)}
            </span>
          </div>

          <div className="goal-main">
            <span className="goal-hours">
              <b>{hoursText(yearMinutes)}</b>h
            </span>
            <button className="goal-edit" onClick={onEditGoal}>
              {goalHours
                ? t(`目标 ${goalHours}h · ${pct}%`, `Goal ${goalHours}h · ${pct}%`)
                : t('设一个目标 ›', 'Set a goal ›')}
            </button>
          </div>

          <div className="goal-foot">
            <div
              className="goal-bar"
              role="progressbar"
              aria-valuenow={Math.min(pct, 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('今年练习目标进度', 'Yearly goal progress')}
            >
              <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
          </div>

          {/* 目标达成后，这里就是那份礼物 */}
          {reached ? (
            <div className="goal-gift">
              <span className="goal-gift-mark" aria-hidden="true">
                🩰
              </span>
              <span className="goal-gift-text">
                {gift.text || t('今年的目标达成了', 'This year’s goal is done')}
              </span>
              {gift.text && !gift.claimedAt && (
                <button className="goal-gift-act" onClick={onClaimGift}>
                  {t('收下', 'Claim')}
                </button>
              )}
              {gift.text && gift.claimedAt && <span className="goal-gift-done">{t('已收下', 'Claimed')}</span>}
              {!gift.text && (
                <button className="goal-gift-act" onClick={onEditGoal}>
                  {t('挑一份 ›', 'Pick one ›')}
                </button>
              )}
            </div>
          ) : gift.text ? (
            <div className="goal-gift goal-gift-quiet">
              <span className="goal-gift-mark" aria-hidden="true">
                🩰
              </span>
              <span className="goal-gift-text">
                {t('达成后：', 'When reached: ')}
                {gift.text}
              </span>
            </div>
          ) : null}
        </div>

        <div className="goal-slide">
          {/* 左边练习、右边投入：标签一线、数字一线、小字一线，左右同一个格式 */}
          <div className="goal-top">
            <span className="label goal-label">{t('累计练习', 'All time')}</span>
            <span className="label goal-label">{t('累计投入', 'Spent')}</span>
          </div>

          <div className="goal-main">
            <span className="goal-hours">
              <b>{hoursText(totalMinutes)}</b>h
            </span>
            {/* 钱和时长分开记，这里只汇总一个总数，点开看流水 */}
            <button className="goal-hours goal-money" onClick={onOpenSpend}>
              {spendTotal > 0 ? <b>{money(spendTotal)}</b> : t('记一笔 ›', 'Add ›')}
            </button>
          </div>

          <div className="goal-foot goal-foot-split">
            <span>
              {t(`${totalSessions} 次`, `${totalSessions} sessions`)}
              {firstDate ? t(` · 从 ${ymd(firstDate)} 开始`, ` · since ${ymd(firstDate)}`) : ''}
            </span>
            {spendCats.length > 0 && (
              <span className="spend-hint">
                {spendCats[0].name} {money(spendCats[0].amount)}
                {spendCats.length > 1 && ` ＋${spendCats.length - 1}`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="goal-dots">
        {[0, 1].map((i) => (
          <button
            key={i}
            className={'goal-dot' + (page === i ? ' goal-dot-on' : '')}
            onClick={() => go(i)}
            aria-label={i === 0 ? t('今年练习', 'This year') : t('累计练习', 'All time')}
          >
            <i />
          </button>
        ))}
      </div>
    </section>
  )
}
