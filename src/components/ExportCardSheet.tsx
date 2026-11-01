import { useEffect, useMemo, useRef, useState } from 'react'
import type { Entry, Movement } from '../db'
import { renderNoteCards, type CardItem, type CardSection } from '../lib/cardImage'
import { displayMove } from '../lib/movements'
import { useToast } from '../hooks/useToast'
import { t, useLang } from '../lib/i18n'
import { Toast } from './Toast'

/**
 * 把当前筛出来的笔记导成 3:4 的图片卡片：
 * 同个动作的笔记收在同一个标题下面，按日期排。
 */
export function ExportCardSheet({
  notes,
  movements,
  rangeLabel,
  onClose,
}: {
  notes: Entry[]
  movements: Movement[]
  rangeLabel: string
  onClose: () => void
}) {
  // 只在笔记里出现过的动作才值得勾
  const used = useMemo(() => {
    const ids = new Set<number>()
    for (const e of notes) for (const p of e.points || []) ids.add(p.movementId)
    return movements.filter((m) => ids.has(m.id!))
  }, [notes, movements])

  const [picked, setPicked] = useState<Set<number>>(() => new Set(used.map((m) => m.id!)))
  const [images, setImages] = useState<{ file: File; url: string }[]>([])
  // 卡片底图：选一张照片，同一套排版压上去；不选就是纸面
  const [bg, setBg] = useState<{ file: File; url: string } | null>(null)
  const bgRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [pages, setPages] = useState(0)
  const [busy, setBusy] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<Blob[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const { msg, show } = useToast()
  useLang()

  // 按动作归堆：一个动作一节，下面一条一句话，按记录时间排
  const sections = useMemo<CardSection[]>(() => {
    const byDate = [...notes].sort((a, b) => a.date - b.date)
    const out: CardSection[] = []
    for (const m of used) {
      if (!picked.has(m.id!)) continue
      const items: CardItem[] = []
      for (const e of byDate) {
        for (const p of e.points || []) {
          const text = p.text.trim()
          if (p.movementId === m.id && text) items.push({ text, level: p.level === 1 ? 1 : 0 })
        }
      }
      if (items.length > 0) out.push({ title: displayMove(m.name), items })
    }
    // 没挂动作的那些话，单独放最后
    const classItems: CardItem[] = []
    for (const e of byDate) {
      classItems.push(
        ...e.note
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((text) => ({ text, level: 0 })),
      )
    }
    if (classItems.length > 0)
      out.push({ title: t('这节课', 'This class'), items: classItems })
    return out
  }, [notes, used, picked])

  const count = sections.reduce((s, x) => s + x.items.length, 0)

  // 选了什么就画什么，画完直接看得到
  useEffect(() => {
    let dead = false
    const timer = setTimeout(async () => {
      if (sections.length === 0) {
        setPreviews([])
        setPreviewSrc([])
        setPages(0)
        return
      }
      try {
        const blobs = await renderNoteCards({
          brand: t('芭蕾手账 · 笔记', 'BALLET JOURNAL · NOTES'),
          title: rangeLabel,
          sub: t(`${count} 条笔记`, `${count} notes`),
          foot: t(`芭蕾手账 · ${rangeLabel}`, `BALLET JOURNAL · ${rangeLabel}`),
          sections,
          images: images.map((x) => x.file),
          background: bg?.file ?? null,
        })
        if (dead) return
        setPreviewSrc(blobs)
        setPages(blobs.length)
        setPreviews(blobs.map((b) => URL.createObjectURL(b)))
      } catch {
        if (!dead) show(t('卡片没画出来，试一次', 'Could not draw the card — try again'))
      }
    }, 200)
    return () => {
      dead = true
      clearTimeout(timer)
    }
  }, [sections, images, bg, count, rangeLabel])

  // 换了预览就把旧的图片地址放掉
  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u))
  }, [previews])

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addFiles(list: FileList | null) {
    if (!list) return
    const add = Array.from(list).map((file) => ({ file, url: URL.createObjectURL(file) }))
    setImages((prev) => [...prev, ...add].slice(0, 6))
  }

  async function exportNow() {
    if (busy || previewSrc.length === 0) return
    setBusy(true)
    try {
      const files = previewSrc.map(
        (b, i) =>
          new File([b], `${t('芭蕾笔记', 'ballet-notes')}-${rangeLabel.replace(/[^\d年月日]/g, '')}-${i + 1}.png`, {
            type: 'image/png',
          }),
      )
      const nav = navigator as Navigator & {
        canShare?: (d: { files?: File[] }) => boolean
        share?: (d: { files?: File[]; title?: string }) => Promise<void>
      }
      if (nav.canShare?.({ files }) && nav.share) {
        await nav.share({ files, title: t('芭蕾手账 · 笔记', 'Ballet Journal · Notes') })
        onClose()
        return
      }
      for (const f of files) {
        const url = URL.createObjectURL(f)
        const a = document.createElement('a')
        a.href = url
        a.download = f.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        await new Promise((r) => setTimeout(r, 400))
        setTimeout(() => URL.revokeObjectURL(url), 4000)
      }
      show(t('卡片已导出', 'Cards exported'))
    } catch {
      show(t('导出没成功，再试一次', 'Export failed — try again'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet export-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <div>
            <div className="sheet-kicker">{rangeLabel}</div>
            <h2 className="sheet-title">{t('导出笔记卡片', 'Export note cards')}</h2>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label={t('关闭', 'Close')}>
            ×
          </button>
        </header>

        <p className="sheet-note">
          {t(
            '把现在筛出来的笔记画成一张 3:4 的图。同一个动作的记录收在一节里，一条一句。',
            'Turns the notes you filtered into a 3:4 image. One movement per section, one line per note.',
          )}
        </p>

        <div className="export-block">
          <span className="label">{t('卡片底图（可选）', 'Card background (optional)')}</span>
          <div className="export-photos">
            {bg ? (
              <span className="export-thumb export-thumb-bg" key={bg.url}>
                <img src={bg.url} alt="" />
                <button
                  className="export-thumb-x"
                  onClick={() => {
                    URL.revokeObjectURL(bg.url)
                    setBg(null)
                  }}
                  aria-label={t('换回纸面', 'Back to paper')}
                >
                  ×
                </button>
              </span>
            ) : (
              <button className="export-add" onClick={() => bgRef.current?.click()}>
                {t('＋ 选一张照片', '＋ Pick a photo')}
              </button>
            )}
            <input
              ref={bgRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                if (bg) URL.revokeObjectURL(bg.url)
                setBg({ file, url: URL.createObjectURL(file) })
              }}
            />
          </div>
          <p className="export-hint">
            {bg
              ? t('同一套排版压在你的照片上，字色会跟着明暗自动换。', 'Your photo, same layout — text switches between light and dark to stay readable.')
              : t('不选就是纸面那一版。照片只在这台设备上读，不会上传。', 'Leave it empty for the paper version. Photos are read on this device only.')}
          </p>
        </div>

        {used.length > 0 && (
          <div className="export-block">
            <span className="label">{t('要带上的动作', 'Movements to include')}</span>
            <div className="chips export-chips">
              {used.map((m) => (
                <button
                  key={m.id}
                  className={'chip chip-quiet' + (picked.has(m.id!) ? ' chip-on' : '')}
                  aria-pressed={picked.has(m.id!)}
                  onClick={() => toggle(m.id!)}
                >
                  {displayMove(m.name)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="export-block">
          <span className="label">{t('另加几张图（可选）', 'Extra images (optional)')}</span>
          <div className="export-photos">
            {images.map((it, i) => (
              <span className="export-thumb" key={it.url}>
                <img src={it.url} alt="" />
                <button
                  className="export-thumb-x"
                  onClick={() => {
                    URL.revokeObjectURL(it.url)
                    setImages((prev) => prev.filter((_, j) => j !== i))
                  }}
                  aria-label={t('去掉这张图', 'Remove this image')}
                >
                  ×
                </button>
              </span>
            ))}
            {images.length < 6 && (
              <button className="export-add" onClick={() => fileRef.current?.click()}>
                {t('＋ 选图', '＋ Add image')}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        <div className="export-preview">
          {previews.length > 0 ? (
            previews.map((u, i) => <img key={u} src={u} alt={i === 0 ? t('笔记卡片预览', 'Card preview') : t('下一页', 'Next page')} />)
          ) : (
            <p className="empty">
              {t('勾上至少一个动作，或者写点字再导出。', 'Tick a movement or write something first.')}
            </p>
          )}
        </div>

        <div className="sheet-actions">
          <button
            className="btn btn-primary"
            onClick={exportNow}
            disabled={busy || previewSrc.length === 0}
          >
            {busy
              ? t('正在导出…', 'Exporting…')
              : pages > 1
                ? t(`导出图片（${pages} 张）`, `Export images (${pages})`)
                : t('导出图片', 'Export images')}
          </button>
        </div>

        <Toast msg={msg} />
      </div>
    </div>
  )
}
