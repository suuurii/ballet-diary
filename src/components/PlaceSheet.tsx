import { useRef, useState } from 'react'
import { db, type Place, type PlaceType } from '../db'
import { fromDateInput, toYMD } from '../lib/time'
import { useBlobUrls } from '../hooks/useBlobUrls'

export const PLACE_TYPE_LABEL: Record<PlaceType, string> = {
  studio: '舞房',
  shop: '体服店',
  other: '其他',
}

export function PlaceSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Place
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [city, setCity] = useState(initial?.city || '')
  const [type, setType] = useState<PlaceType>(initial?.type || 'studio')
  const [rating, setRating] = useState(initial?.rating || 0)
  const [review, setReview] = useState(initial?.review || '')
  const [photos, setPhotos] = useState<Blob[]>(initial?.photos || [])
  const [visited, setVisited] = useState(toYMD(initial?.visitedAt || Date.now()))
  const [hint, setHint] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const urls = useBlobUrls(photos)

  async function save() {
    if (!name.trim()) {
      setHint('给它起个名字吧')
      return
    }
    const payload = {
      name: name.trim(),
      city: city.trim(),
      type,
      rating,
      review: review.trim(),
      photos,
      visitedAt: fromDateInput(visited),
    }
    if (initial) {
      await db.places.update(initial.id!, payload)
      onSaved('已保存')
    } else {
      await db.places.add({ ...payload, createdAt: Date.now() })
      onSaved('已记下这个地方')
    }
  }

  async function remove() {
    if (!initial) return
    if (!window.confirm('删除这个地点？')) return
    await db.places.delete(initial.id!)
    onSaved('已删除')
  }

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <div>
            <div className="sheet-kicker">流浪地图</div>
            <h2 className="sheet-title">{initial ? '编辑地点' : '记下一个地方'}</h2>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="sheet-body">
          <div className="field">
            <div className="label">名字</div>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="比如：梧桐芭蕾工作室"
            />
          </div>

          <div className="field">
            <div className="label">城市</div>
            <input
              className="input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="上海"
            />
          </div>

          <div className="field">
            <div className="label">类型</div>
            <div className="chips">
              {(Object.keys(PLACE_TYPE_LABEL) as PlaceType[]).map((t) => (
                <button
                  key={t}
                  className={'chip' + (type === t ? ' chip-on' : '')}
                  onClick={() => setType(t)}
                >
                  {PLACE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="label">评分</div>
            <div className="stars-input">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n <= rating ? 'on' : ''}
                  onClick={() => setRating(n === rating ? 0 : n)}
                  aria-label={`${n} 星`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="label">测评</div>
            <textarea
              className="input textarea"
              rows={4}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="老师怎么样、教室大不大、有没有把杆、体服好不好逛…"
            />
          </div>

          <div className="field">
            <div className="label">到访</div>
            <input
              className="date-line"
              type="date"
              value={visited}
              onChange={(e) => setVisited(e.target.value)}
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
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
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
                if (files) setPhotos((prev) => [...prev, ...Array.from(files)])
                e.target.value = ''
              }}
            />
          </div>

          {hint && <p className="sheet-hint">{hint}</p>}

          <div className="sheet-actions">
            {initial && (
              <button className="btn btn-quiet" onClick={remove}>
                删除
              </button>
            )}
            <button className="btn btn-primary" onClick={save}>
              {initial ? '保存修改' : '记下'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
