import { useRef, useState } from 'react'
import { db, type Category, type Entry, type Movement } from '../db'
import { formatDuration, fromDateInput, toYMD, weekdayCN } from '../lib/time'
import { useBlobUrls } from '../hooks/useBlobUrls'

interface Tag {
  id?: number
  name: string
}

function entrySummary(e: Entry, movements: Movement[]): string {
  const names = e.movementIds
    .map((id) => movements.find((m) => m.id === id)?.name)
    .filter(Boolean)
    .join(' / ')
  const text = e.note.trim().split('\n')[0]
  if (names && text) return `${names} · ${text}`
  if (names) return names
  if (text) return text
  if (e.images.length) return `${e.images.length} 张照片`
  return e.durationMin > 0 ? '练习' : '记录'
}

export function EntrySheet({
  date,
  initialEntry,
  entries,
  categories,
  movements,
  frequent,
  onClose,
  onSaved,
}: {
  date: number
  initialEntry?: Entry
  entries: Entry[]
  categories: Category[]
  movements: Movement[]
  frequent: number[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const start = initialEntry ?? null
  const startTags: Tag[] = start
    ? start.movementIds
        .map((id) => movements.find((m) => m.id === id))
        .filter((m): m is Movement => !!m)
        .map((m) => ({ id: m.id, name: m.name }))
    : []

  const [editing, setEditing] = useState<Entry | null>(start)
  const [dateValue, setDateValue] = useState(toYMD(start ? start.date : date))
  const [duration, setDuration] = useState(start ? start.durationMin : 0)
  const [customOpen, setCustomOpen] = useState(
    !!start && start.durationMin > 0 && !frequent.includes(start.durationMin),
  )
  const [categoryId, setCategoryId] = useState<number | null>(start ? start.categoryId : null)
  const [tags, setTags] = useState<Tag[]>(startTags)
  const [tagInput, setTagInput] = useState('')
  const [note, setNote] = useState(start ? start.note : '')
  const [images, setImages] = useState<Blob[]>(start ? start.images : [])
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const urls = useBlobUrls(images)

  function reset(next: Entry | null) {
    setEditing(next)
    setDateValue(toYMD(next ? next.date : date))
    setDuration(next ? next.durationMin : 0)
    setCustomOpen(false)
    setCategoryId(next ? next.categoryId : null)
    setTags(
      next
        ? next.movementIds
            .map((id) => movements.find((m) => m.id === id))
            .filter((m): m is Movement => !!m)
            .map((m) => ({ id: m.id, name: m.name }))
        : [],
    )
    setTagInput('')
    setNote(next ? next.note : '')
    setImages(next ? next.images : [])
    setHint('')
  }

  function addTag(raw: string) {
    const name = raw.trim()
    if (!name) return
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setTagInput('')
      return
    }
    const existing = movements.find((m) => m.name.toLowerCase() === name.toLowerCase())
    setTags((prev) => [...prev, { id: existing?.id, name: existing?.name || name }])
    setTagInput('')
  }

  function addSuggestion(m: Movement) {
    if (tags.some((t) => t.id === m.id)) return
    setTags((prev) => [...prev, { id: m.id, name: m.name }])
  }

  async function save() {
    if (busy) return
    const hasContent = duration > 0 || note.trim().length > 0 || images.length > 0
    if (!hasContent) {
      setHint('至少记一样：时长、手记或照片')
      return
    }
    setBusy(true)
    try {
      const movementIds: number[] = []
      for (const t of tags) {
        if (t.id) {
          movementIds.push(t.id)
        } else {
          const existing = movements.find((m) => m.name.toLowerCase() === t.name.toLowerCase())
          movementIds.push(
            existing
              ? existing.id!
              : await db.movements.add({ name: t.name, createdAt: Date.now() }),
          )
        }
      }

      const payload = {
        date: fromDateInput(dateValue),
        durationMin: Math.max(0, Math.round(duration)),
        categoryId,
        movementIds,
        note: note.trim(),
        images,
        source: 'manual' as const,
      }

      if (editing) {
        await db.entries.update(editing.id!, payload)
      } else {
        await db.entries.add({ ...payload, createdAt: Date.now() })
      }
      onSaved(editing ? '已保存' : '记下了')
    } catch (err) {
      console.error(err)
      setHint('保存失败，再试一次')
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    if (!window.confirm('删除这一笔？删掉就找不回来了。')) return
    await db.entries.delete(editing.id!)
    onSaved('已删除')
  }

  const suggestions = movements
    .filter((m) => !tags.some((t) => t.id === m.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <div>
            <div className="sheet-kicker">{weekdayCN(fromDateInput(dateValue))}</div>
            <h2 className="sheet-title">{editing ? '改这一笔' : '记一笔'}</h2>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="sheet-body">
          {!editing && entries.length > 0 && (
            <div className="day-list">
              <div className="label">这一天</div>
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
            <div className="label">时长</div>
            <div className="chips">
              {frequent.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={'chip' + (duration === d ? ' chip-on' : '')}
                  onClick={() => {
                    setDuration(d)
                    setCustomOpen(false)
                  }}
                >
                  {d} 分
                </button>
              ))}
              <button
                type="button"
                className={'chip' + (customOpen ? ' chip-on' : '')}
                onClick={() => setCustomOpen((v) => !v)}
              >
                其他
              </button>
            </div>
            {customOpen && (
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
                <span>分钟</span>
              </div>
            )}
          </div>

          <div className="field">
            <div className="label">类型</div>
            <div className="chips chips-scroll">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={'chip chip-dot' + (categoryId === c.id ? ' chip-on' : '')}
                  onClick={() => setCategoryId(categoryId === c.id ? null : c.id!)}
                >
                  <i style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="label">动作</div>
            <div className="tag-box">
              {tags.map((t) => (
                <span key={t.name} className="tag">
                  {t.name}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x.name !== t.name))}
                    aria-label={`移除 ${t.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className="tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                    e.preventDefault()
                    addTag(tagInput)
                  } else if (e.key === 'Backspace' && !tagInput) {
                    setTags((prev) => prev.slice(0, -1))
                  }
                }}
                onBlur={() => addTag(tagInput)}
                placeholder={tags.length ? '' : '比如：皮鲁埃特'}
              />
            </div>
            {suggestions.length > 0 && (
              <div className="chips chips-scroll suggestions">
                {suggestions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chip chip-quiet"
                    onClick={() => addSuggestion(m)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <div className="label">手记</div>
            <textarea
              className="input textarea"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="今天练到什么、哪里卡住、老师说了什么…"
            />
          </div>

          <div className="field">
            <div className="label">照片</div>
            <div className="photos">
              {urls.map((u, i) => (
                <div className="photo" key={i}>
                  <img src={u} alt="" />
                  <button
                    type="button"
                    className="photo-x"
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="移除照片"
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

          {hint && <p className="sheet-hint">{hint}</p>}

          <div className="sheet-actions">
            {editing && (
              <button className="btn btn-quiet" onClick={remove}>
                删除
              </button>
            )}
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {editing ? '保存修改' : '记下'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
