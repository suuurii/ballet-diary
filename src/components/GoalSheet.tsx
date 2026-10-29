import { useState } from 'react'
import { setYearGoal } from '../lib/goal'

/** 设/改今年的练习目标，一个小抽屉就够 */
export function GoalSheet({
  year,
  goalHours,
  onClose,
  onSaved,
}: {
  year: number
  goalHours: number | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [value, setValue] = useState(goalHours ? String(goalHours) : '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    setBusy(true)
    const n = Number(value)
    try {
      if (!value.trim() || !Number.isFinite(n) || n <= 0) {
        await setYearGoal(null)
        onSaved('目标已取消')
      } else {
        await setYearGoal(Math.round(n))
        onSaved('目标已保存')
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
            <div className="sheet-kicker">{year} 年</div>
            <h2 className="sheet-title">今年想练多少小时</h2>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="关闭">
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
          <span>小时</span>
        </div>

        <p className="sheet-hint">
          进度按今年记下的总时长算。留空保存就是不设目标。
        </p>

        <div className="sheet-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            保存目标
          </button>
        </div>
      </div>
    </div>
  )
}
