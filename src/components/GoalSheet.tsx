import { useState } from 'react'
import { setYearGift, setYearGoal } from '../lib/goal'
import { t, useLang } from '../lib/i18n'

/** 设/改今年的练习目标，一个小抽屉就够；顺手写一句达成后给自己的礼物 */
export function GoalSheet({
  year,
  goalHours,
  giftText,
  onClose,
  onSaved,
}: {
  year: number
  goalHours: number | null
  giftText: string
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [value, setValue] = useState(goalHours ? String(goalHours) : '')
  const [gift, setGift] = useState(giftText)
  const [busy, setBusy] = useState(false)
  useLang()

  async function save() {
    if (busy) return
    setBusy(true)
    const n = Number(value)
    try {
      if (!value.trim() || !Number.isFinite(n) || n <= 0) {
        await setYearGoal(null)
        await setYearGift(gift)
        onSaved(t('目标已取消', 'Goal cleared'))
      } else {
        await setYearGoal(Math.round(n))
        await setYearGift(gift)
        onSaved(t('目标已保存', 'Goal saved'))
      }
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
            <div className="sheet-kicker">{t(`${year} 年`, `Year ${year}`)}</div>
            <h2 className="sheet-title">{t('今年想练多少小时', 'Hours for this year')}</h2>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label={t('关闭', 'Close')}>
            ×
          </button>
        </header>

        <div className="goal-input-row">
          <input
            className="num-input num-lg"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="100"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
            autoFocus
          />
          <span className="goal-unit">{t('小时', 'hours')}</span>
        </div>

        <p className="sheet-note">
          {t(
            '进度按今年记下的总时长算。留空保存就是不设目标。',
            'Progress counts this year’s practice. Save it empty to remove the goal.',
          )}
        </p>

        <label className="goal-gift-field">
          <span className="label">{t('达成后送自己什么', 'Your reward when you get there')}</span>
          <input
            className="input"
            type="text"
            maxLength={24}
            placeholder={t('比如：一双新的足尖鞋', 'e.g. a new pair of pointe shoes')}
            value={gift}
            onChange={(e) => setGift(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
        </label>

        <div className="sheet-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {t('保存目标', 'Save goal')}
          </button>
        </div>
      </div>
    </div>
  )
}
