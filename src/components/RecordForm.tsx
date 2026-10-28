import { useState } from 'react'
import type { Category, PracticeRecord } from '../db'
import { toYMD } from '../lib/time'
import { CategoryPicker } from './CategoryPicker'
import { DurationWheel } from './WheelPicker'

export interface RecordFormValues {
  date: string
  hours: number
  minutes: number
  categoryId: number | null
  note: string
}

export function RecordForm({
  categories,
  initial,
  onSubmit,
  onCancel,
  onAddCategory,
}: {
  categories: Category[]
  initial?: PracticeRecord
  onSubmit: (v: RecordFormValues) => void
  onCancel?: () => void
  onAddCategory?: () => void
}) {
  const d0 = initial ? new Date(initial.startAt) : new Date()
  const dur0 = initial ? initial.durationMin : 60
  const [date, setDate] = useState(toYMD(d0.getTime()))
  const [hours, setHours] = useState(Math.floor(dur0 / 60))
  const [minutes, setMinutes] = useState(Math.round(dur0 % 60))
  const [categoryId, setCategoryId] = useState<number | null>(
    initial ? initial.categoryId : categories[0]?.id ?? null,
  )
  const [note, setNote] = useState(initial?.note || '')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ date, hours, minutes, categoryId, note })
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label className="field-label">日期</label>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label className="field-label">时长</label>
        <DurationWheel
          hours={hours}
          minutes={minutes}
          onChange={(h, m) => {
            setHours(h)
            setMinutes(m)
          }}
        />
      </div>

      <div className="field">
        <label className="field-label">分类</label>
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          allowNone
          onAdd={onAddCategory}
        />
      </div>

      <div className="field">
        <label className="field-label">备注（可选）</label>
        <textarea
          className="input"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="比如：今天重点练了转圈"
        />
      </div>

      <div className="btn-row">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
        )}
        <button type="submit" className="btn btn-primary">
          保存
        </button>
      </div>
    </form>
  )
}
