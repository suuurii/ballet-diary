import { useEffect, useMemo, useState } from 'react'
import { db, type Movement, type Note } from '../db'
import { formatDateCN } from '../lib/time'
import { useBlobUrls } from '../hooks/useBlobUrls'
import { NoteComposer, type NoteComposerValues } from '../components/NoteComposer'

type TimeFilter = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom'

const TIME_LABEL: Record<TimeFilter, string> = {
  all: '全部',
  thisMonth: '本月',
  lastMonth: '上月',
  thisYear: '今年',
  custom: '自定义',
}

function filterNotes(
  notes: Note[],
  timeFilter: TimeFilter,
  from: string,
  to: string,
  selMovements: Set<number>,
): Note[] {
  let list = notes

  if (selMovements.size > 0) {
    list = list.filter((n) => selMovements.has(n.movementId))
  }

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
  const startOfThisYear = new Date(now.getFullYear(), 0, 1).getTime()

  if (timeFilter === 'thisMonth') {
    list = list.filter((n) => n.createdAt >= startOfThisMonth)
  } else if (timeFilter === 'lastMonth') {
    list = list.filter((n) => n.createdAt >= startOfLastMonth && n.createdAt < startOfThisMonth)
  } else if (timeFilter === 'thisYear') {
    list = list.filter((n) => n.createdAt >= startOfThisYear)
  } else if (timeFilter === 'custom') {
    const f = from ? new Date(from + 'T00:00:00').getTime() : 0
    const t = to ? new Date(to + 'T23:59:59').getTime() : Infinity
    list = list.filter((n) => n.createdAt >= f && n.createdAt <= t)
  }

  return list
}

function NoteCard({
  note,
  movement,
  onEdit,
  onDelete,
  onView,
}: {
  note: Note
  movement?: Movement
  onEdit: () => void
  onDelete: () => void
  onView: (url: string) => void
}) {
  const urls = useBlobUrls(note.images)

  return (
    <section className="card note-card">
      <div className="note-head">
        <span className="note-movement">{movement?.name || '未命名动作'}</span>
        <span className="note-date">{formatDateCN(note.createdAt)}</span>
        <button className="link-btn" onClick={onEdit}>
          编辑
        </button>
        <button className="link-btn link-btn-danger" onClick={onDelete}>
          删除
        </button>
      </div>
      {note.content && <p className="note-content">{note.content}</p>}
      {urls.length > 0 && (
        <div className="note-photos">
          {urls.map((u, i) => (
            <img key={i} src={u} alt="" onClick={() => onView(u)} />
          ))}
        </div>
      )}
    </section>
  )
}

export function NotesPage() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<Note | null>(null)
  const [editMovementName, setEditMovementName] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selMovements, setSelMovements] = useState<Set<number>>(new Set())
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    load()
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  async function load() {
    const [moves, ns] = await Promise.all([
      db.movements.toArray(),
      db.notes.orderBy('createdAt').reverse().toArray(),
    ])
    setMovements(moves)
    setNotes(ns)
  }

  const filtered = useMemo(
    () => filterNotes(notes, timeFilter, from, to, selMovements),
    [notes, timeFilter, from, to, selMovements],
  )

  async function resolveMovement(name: string): Promise<number> {
    const trimmed = name.trim()
    const existing = movements.find((m) => m.name.trim().toLowerCase() === trimmed.toLowerCase())
    if (existing) return existing.id!
    return await db.movements.add({ name: trimmed, createdAt: Date.now() })
  }

  async function save(v: NoteComposerValues) {
    if (!v.movementName) {
      showToast('请填写动作名称')
      return
    }
    const movementId = await resolveMovement(v.movementName)
    const [y, m, d] = v.date.split('-').map(Number)
    const createdAt = new Date(y, m - 1, d, 12, 0, 0).getTime()
    await db.notes.add({ movementId, content: v.content, images: v.images, createdAt })
    setComposeOpen(false)
    await load()
    showToast('已保存')
  }

  async function saveEdit(v: NoteComposerValues) {
    if (!editing) return
    if (!v.movementName) {
      showToast('请填写动作名称')
      return
    }
    const movementId = await resolveMovement(v.movementName)
    const [y, m, d] = v.date.split('-').map(Number)
    const createdAt = new Date(y, m - 1, d, 12, 0, 0).getTime()
    await db.notes.update(editing.id!, { movementId, content: v.content, images: v.images, createdAt })
    setEditing(null)
    setComposeOpen(false)
    await load()
    showToast('已更新')
  }

  async function removeNote(n: Note) {
    if (!window.confirm('确认删除这条笔记？')) return
    await db.notes.delete(n.id!)
    await load()
  }

  function toggleMovement(id: number) {
    setSelMovements((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">芭蕾笔记</h1>
        <button
          className="btn btn-primary"
          style={{ width: 'auto', padding: '10px 18px', flexShrink: 0 }}
          onClick={() => {
            setEditing(null)
            setEditMovementName('')
            setComposeOpen(true)
          }}
        >
          ＋ 记录
        </button>
      </div>
      <p className="page-sub">手动打标动作，记录要点与照片，回顾进步</p>

      <section className="card filter-card">
        <div className="field-label">时间</div>
        <div className="chips">
          {(Object.keys(TIME_LABEL) as TimeFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              className={'chip' + (timeFilter === t ? ' chip-active' : '')}
              onClick={() => setTimeFilter(t)}
            >
              {TIME_LABEL[t]}
            </button>
          ))}
        </div>
        {timeFilter === 'custom' && (
          <div className="input-row" style={{ marginTop: 10 }}>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}

        <div className="field-label" style={{ marginTop: 14 }}>
          动作（可多选）
        </div>
        <div className="chips scroll-x">
          <button
            type="button"
            className={'chip' + (selMovements.size === 0 ? ' chip-active' : '')}
            onClick={() => setSelMovements(new Set())}
          >
            全部
          </button>
          {movements.map((m) => (
            <button
              key={m.id}
              type="button"
              className={'chip' + (selMovements.has(m.id!) ? ' chip-active' : '')}
              onClick={() => toggleMovement(m.id!)}
            >
              {m.name}
            </button>
          ))}
        </div>
      </section>

      <div className="note-count">共 {filtered.length} 条笔记</div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 40, marginBottom: 10 }}>📓</div>
          没有符合条件的笔记
        </div>
      ) : (
        filtered.map((n) => (
          <NoteCard
            key={n.id}
            note={n}
            movement={movements.find((m) => m.id === n.movementId)}
            onEdit={() => {
              setEditMovementName(movements.find((m) => m.id === n.movementId)?.name || '')
              setEditing(n)
              setComposeOpen(true)
            }}
            onDelete={() => removeNote(n)}
            onView={setViewImage}
          />
        ))
      )}

      {composeOpen && (
        <div className="modal-mask" onClick={() => setComposeOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{editing ? '编辑笔记' : '记录笔记'}</div>
            <NoteComposer
              movements={movements}
              initial={editing || undefined}
              initialMovementName={editing ? editMovementName : ''}
              onSubmit={editing ? saveEdit : save}
              onCancel={() => {
                setComposeOpen(false)
                setEditing(null)
              }}
            />
          </div>
        </div>
      )}

      {viewImage && (
        <div className="modal-mask" style={{ alignItems: 'center' }} onClick={() => setViewImage(null)}>
          <img
            src={viewImage}
            alt=""
            style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
