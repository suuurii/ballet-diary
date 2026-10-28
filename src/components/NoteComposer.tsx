import { useRef, useState } from 'react'
import type { Movement, Note } from '../db'
import { toYMD } from '../lib/time'
import { useBlobUrls } from '../hooks/useBlobUrls'

export interface NoteComposerValues {
  movementName: string
  content: string
  date: string
  images: Blob[]
}

export function NoteComposer({
  movements,
  initial,
  initialMovementName,
  onSubmit,
  onCancel,
}: {
  movements: Movement[]
  initial?: Note
  initialMovementName?: string
  onSubmit: (v: NoteComposerValues) => void
  onCancel?: () => void
}) {
  const [movementName, setMovementName] = useState(initialMovementName || '')
  const [content, setContent] = useState(initial?.content || '')
  const [date, setDate] = useState(initial ? toYMD(initial.createdAt) : toYMD(Date.now()))
  const [images, setImages] = useState<Blob[]>(initial?.images || [])
  const fileRef = useRef<HTMLInputElement>(null)
  const urls = useBlobUrls(images)

  const recent = [...movements]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 12)

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setImages((prev) => [...prev, ...Array.from(files)])
  }

  function removeImage(i: number) {
    setImages((prev) => prev.filter((_, idx) => idx !== i))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ movementName: movementName.trim(), content: content.trim(), date, images })
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label className="field-label">动作名称</label>
        <input
          className="input"
          list="movement-list"
          value={movementName}
          onChange={(e) => setMovementName(e.target.value)}
          placeholder="输入动作名，如：piqué 转、大踢腿"
          required
        />
        <datalist id="movement-list">
          {movements.map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
        {recent.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {recent.map((m) => (
              <button
                type="button"
                key={m.id}
                className="chip"
                onClick={() => setMovementName(m.name)}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

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
        <label className="field-label">笔记内容</label>
        <textarea
          className="input"
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="记录要点、感受、需要改进的地方…"
        />
      </div>

      <div className="field">
        <label className="field-label">照片</label>
        <div className="compose-photos">
          {urls.map((u, i) => (
            <div className="compose-photo" key={i}>
              <img src={u} alt="" />
              <button
                type="button"
                className="compose-photo-remove"
                onClick={() => removeImage(i)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="compose-add" onClick={() => fileRef.current?.click()}>
            ＋
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
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
