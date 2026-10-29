import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, type Category } from '../db'
import { CATEGORY_COLORS, ensureSeedCategories } from '../lib/categories'
import { parseHealthFile } from '../lib/healthImport'
import { startOfDay, toYMD } from '../lib/time'
import { Toast } from '../components/Toast'
import { useToast } from '../hooks/useToast'

const BACKUP_VERSION = 3

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataURLToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  return await res.blob()
}

export function SettingsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0])
  const [busy, setBusy] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const healthRef = useRef<HTMLInputElement>(null)
  const { msg, show } = useToast()

  async function load() {
    setCategories(await db.categories.orderBy('order').toArray())
  }

  useEffect(() => {
    ensureSeedCategories().then(load)
  }, [])

  async function addCategory() {
    const name = newName.trim()
    if (!name) return
    if (categories.some((c) => c.name === name)) {
      show('已经有同名的了')
      return
    }
    await db.categories.add({ name, color: newColor, order: categories.length })
    setNewName('')
    await load()
    show('已添加')
  }

  async function rename(c: Category) {
    const name = window.prompt('新名字', c.name)
    if (name && name.trim()) {
      await db.categories.update(c.id!, { name: name.trim() })
      await load()
    }
  }

  async function remove(c: Category) {
    const used = await db.entries.where('categoryId').equals(c.id!).count()
    const text =
      used > 0
        ? `「${c.name}」下还有 ${used} 条记录，删掉后这些记录会变成「没分类」。记录本身不会丢。`
        : `删除「${c.name}」？`
    if (!window.confirm(text)) return
    await db.categories.delete(c.id!)
    await load()
    show('已删除')
  }

  async function exportData() {
    setBusy('正在打包…')
    try {
      const [cats, moves, entries, places, settings] = await Promise.all([
        db.categories.toArray(),
        db.movements.toArray(),
        db.entries.toArray(),
        db.places.toArray(),
        db.settings.toArray(),
      ])
      const data = {
        app: 'ballet-diary',
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        categories: cats,
        movements: moves,
        entries: await Promise.all(
          entries.map(async (e) => ({
            ...e,
            images: await Promise.all(e.images.map((b) => blobToDataURL(b))),
          })),
        ),
        places: await Promise.all(
          places.map(async (p) => ({
            ...p,
            photos: await Promise.all(p.photos.map((b) => blobToDataURL(b))),
          })),
        ),
        settings,
      }
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `芭蕾手账备份-${toYMD(Date.now())}.json`
      a.click()
      URL.revokeObjectURL(url)
      show('备份已下载')
    } catch {
      show('导出失败，再试一次')
    } finally {
      setBusy('')
    }
  }

  async function importData(file: File) {
    setBusy('正在恢复…')
    try {
      const data = JSON.parse(await file.text())
      const existingCats = await db.categories.toArray()
      const catIdMap = new Map<number, number>()
      let order = existingCats.length
      for (const c of data.categories || []) {
        const hit = existingCats.find((x) => x.name === c.name)
        if (hit) {
          catIdMap.set(c.id, hit.id!)
        } else {
          const id = await db.categories.add({ name: c.name, color: c.color, order: order++ })
          catIdMap.set(c.id, id)
        }
      }

      const existingMoves = await db.movements.toArray()
      const moveIdMap = new Map<number, number>()
      for (const m of data.movements || []) {
        const hit = existingMoves.find((x) => x.name === m.name)
        if (hit) {
          moveIdMap.set(m.id, hit.id!)
        } else {
          const id = await db.movements.add({ name: m.name, createdAt: m.createdAt || Date.now() })
          moveIdMap.set(m.id, id)
        }
      }

      const existing = await db.entries.toArray()
      const seen = new Set(existing.map((e) => `${e.date}-${e.createdAt}-${e.durationMin}`))
      let added = 0
      for (const e of data.entries || []) {
        const key = `${e.date}-${e.createdAt}-${e.durationMin}`
        if (seen.has(key)) continue
        seen.add(key)
        await db.entries.add({
          date: e.date,
          durationMin: e.durationMin || 0,
          categoryId: e.categoryId != null ? catIdMap.get(e.categoryId) ?? null : null,
          movementIds: (e.movementIds || []).map((id: number) => moveIdMap.get(id)).filter(Boolean),
          note: e.note || '',
          images: await Promise.all((e.images || []).map((u: string) => dataURLToBlob(u))),
          source: e.source === 'watch' ? 'watch' : 'manual',
          createdAt: e.createdAt || Date.now(),
        })
        added++
      }

      const existingPlaces = await db.places.toArray()
      for (const p of data.places || []) {
        const dup = existingPlaces.find(
          (x) => x.name === p.name && x.visitedAt === p.visitedAt,
        )
        if (dup) continue
        await db.places.add({
          name: p.name,
          city: p.city || '',
          type: p.type || 'other',
          rating: p.rating || 0,
          review: p.review || '',
          photos: await Promise.all((p.photos || []).map((u: string) => dataURLToBlob(u))),
          visitedAt: p.visitedAt || Date.now(),
          createdAt: p.createdAt || Date.now(),
        })
      }

      for (const s of data.settings || []) {
        if (s?.key) await db.settings.put({ key: s.key, value: s.value ?? null })
      }

      await load()
      show(`恢复完成，新增 ${added} 条记录`)
    } catch (err) {
      console.error(err)
      show('导入失败：文件格式不对')
    } finally {
      setBusy('')
    }
  }

  async function importHealth(file: File) {
    setBusy('正在读取健康数据…')
    try {
      const list = await parseHealthFile(file)
      if (list.length === 0) {
        show('文件里没有 Barre 类型的训练')
        return
      }
      const existing = await db.entries.where('source').equals('watch').toArray()
      const seen = new Set(existing.map((e) => `${e.date}-${e.durationMin}`))
      const rows = list
        .map((w) => ({
          date: startOfDay(w.startAt),
          durationMin: w.durationMin,
          categoryId: null,
          movementIds: [] as number[],
          note: '',
          images: [] as Blob[],
          source: 'watch' as const,
          createdAt: Date.now(),
        }))
        .filter((r) => !seen.has(`${r.date}-${r.durationMin}`))
      if (rows.length === 0) {
        show('这些记录之前已经导入过了')
        return
      }
      if (!window.confirm(`找到 ${list.length} 条 Barre 训练，其中 ${rows.length} 条是新的。导入吗？`)) return
      await db.entries.bulkAdd(rows)
      show(`已导入 ${rows.length} 条`)
    } catch (err) {
      console.error(err)
      show('读取失败，确认是「健康」App 导出的文件')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label="返回">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <span className="wordmark">设置</span>
        <span className="topbar-spacer" />
      </header>

      <section className="block">
        <h2 className="section-label">课程类型</h2>
        <p className="hint">点「改名」可以修改，也可以新增自己的。</p>
        {categories.map((c) => (
          <div className="cat-row" key={c.id}>
            <i className="dot" style={{ background: c.color }} />
            <span className="cat-name">{c.name}</span>
            <button className="link" onClick={() => rename(c)}>
              改名
            </button>
            <button className="link link-danger" onClick={() => remove(c)}>
              删除
            </button>
          </div>
        ))}

        <div className="add-cat">
          <input
            className="input input-sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新类型，比如：足尖课"
          />
          <button className="btn btn-small" onClick={addCategory}>
            添加
          </button>
        </div>
        <div className="swatches">
          {CATEGORY_COLORS.map((col) => (
            <button
              key={col}
              className={'swatch' + (newColor === col ? ' swatch-on' : '')}
              style={{ background: col }}
              onClick={() => setNewColor(col)}
              aria-label="选择颜色"
            />
          ))}
        </div>
      </section>

      <section className="block">
        <h2 className="section-label">iWatch</h2>
        <p className="hint">
          在 iPhone「健康」App 里点右上角头像 →「导出所有健康数据」，把 zip 文件选进来，会自动挑出 Barre 训练。
        </p>
        <button className="btn btn-outline" onClick={() => healthRef.current?.click()}>
          导入 iWatch 记录
        </button>
        <input
          ref={healthRef}
          type="file"
          accept=".zip,.xml"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) importHealth(f)
          }}
        />
      </section>

      <section className="block">
        <h2 className="section-label">备份</h2>
        <p className="hint">数据只存在这台手机的浏览器里。定期导出一份，换手机或以后搬到云端都用得上。</p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={exportData} disabled={!!busy}>
            导出备份
          </button>
          <button className="btn btn-outline" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            导入备份
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) importData(f)
          }}
        />
      </section>

      {busy && <p className="hint center">{busy}</p>}
      <Toast msg={msg} />
    </div>
  )
}
