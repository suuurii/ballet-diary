import { useEffect, useState } from 'react'
import { db, type Place } from '../db'
import { useBlobUrls } from '../hooks/useBlobUrls'
import { formatDateCN } from '../lib/time'
import { PLACE_TYPE_LABEL, PlaceSheet } from '../components/PlaceSheet'
import { Toast } from '../components/Toast'
import { useToast } from '../hooks/useToast'

function PlaceCard({ place, onOpen }: { place: Place; onOpen: () => void }) {
  const urls = useBlobUrls(place.photos)
  return (
    <article className="place" onClick={onOpen}>
      <header className="place-head">
        <h3 className="place-name">{place.name}</h3>
        <span className="place-type">{PLACE_TYPE_LABEL[place.type]}</span>
      </header>
      <div className="place-sub">
        {place.city && <span>{place.city}</span>}
        <span>{formatDateCN(place.visitedAt)}</span>
        {place.rating > 0 && (
          <span className="stars">
            {'★'.repeat(place.rating)}
            <i>{'★'.repeat(5 - place.rating)}</i>
          </span>
        )}
      </div>
      {place.review && <p className="place-review">{place.review}</p>}
      {urls.length > 0 && (
        <div className="note-photos">
          {urls.map((u, i) => (
            <img key={i} src={u} alt="" />
          ))}
        </div>
      )}
    </article>
  )
}

export function PlacesPage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [open, setOpen] = useState<{ place?: Place } | null>(null)
  const { msg, show } = useToast()

  async function load() {
    const list = await db.places.toArray()
    setPlaces(list.sort((a, b) => b.visitedAt - a.visitedAt))
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="page">
      <header className="topbar">
        <span className="wordmark">芭蕾手账</span>
        <button
          className="icon-btn"
          onClick={() => setOpen({})}
          aria-label="记录一个地方"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </header>

      <h1 className="page-title">场所</h1>
      <p className="page-sub">上过课的舞房、逛过的体服店，都留在这里。</p>

      {places.length === 0 ? (
        <div className="empty-block">
          <p>还没有记录过地方。</p>
          <p className="empty-sub">第一次去新舞房，或者发现一家好逛的体服店，就来这里记一笔。</p>
        </div>
      ) : (
        <div className="places">
          {places.map((p) => (
            <PlaceCard key={p.id} place={p} onOpen={() => setOpen({ place: p })} />
          ))}
        </div>
      )}

      {open && (
        <PlaceSheet
          key={open.place?.id ?? 'new'}
          initial={open.place}
          onClose={() => setOpen(null)}
          onSaved={(m) => {
            setOpen(null)
            load()
            show(m)
          }}
        />
      )}

      <Toast msg={msg} />
    </div>
  )
}
