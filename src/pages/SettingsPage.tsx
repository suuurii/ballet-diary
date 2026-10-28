import { useEffect, useRef, useState } from 'react'
import { db, type Category } from '../db'
import { CATEGORY_COLORS, ensureSeedCategories } from '../lib/categories'
import { toYMD } from '../lib/time'

export function SettingsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0])
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ensureSeedCategories().then(load)
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  async function load() {
    setCategories(await db.categories.orderBy('order').toArray())
  }

  async function addCategory() {
    const name = newName.trim()
    if (!name) return
    if (categories.some((c) => c.name === name)) {
      showToast('已有同名分类')
      return
    }
    await db.categories.add({ name, color: newColor, order: categories.length })
    setNewName('')
    await load()
  }

  async function rename(c: Category) {
    const name = window.prompt('新名称', c.name)
    if (name && name.trim()) {
      await db.categories.update(c.id!, { name: name.trim() })
      await load()
    }
  }

  async function remove(c: Category) {
    const used = await db.practiceRecords.where('categoryId').equals(c.id!).count()
    const msg =
      used > 0
        ? `「${c.name}」下已有 ${used} 条记录，删除后这些记录会变为「未分类」。确认删除？`
        : `确认删除「${c.name}」？`
    if (!window.confirm(msg)) return
    await db.categories.delete(c.id!)
    await load()
  }

  async function exportData() {
    const data = {
      app: 'ballet-app',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: await db.categories.toArray(),
      practiceRecords: await db.practiceRecords.toArray(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `芭蕾手账备份-${toYMD(Date.now())}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('已导出备份文件')
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text())
      const existingCats = await db.categories.toArray()
      const nameToId = new Map(existingCats.map((c) => [c.name, c.id!]))
      const idMap = new Map<number, number>()
      let order = existingCats.length
      for (const c of data.categories || []) {
        const existing = nameToId.get(c.name)
        if (existing != null) {
          idMap.set(c.id, existing)
          continue
        }
        const nid = await db.categories.add({ name: c.name, color: c.color, order: order++ })
        idMap.set(c.id, nid)
      }
      const existingStarts = new Set((await db.practiceRecords.toArray()).map((r) => r.startAt))
      const toAdd: any[] = []
      for (const r of data.practiceRecords || []) {
        if (existingStarts.has(r.startAt)) continue
        toAdd.push({
          startAt: r.startAt,
          endAt: r.endAt,
          durationMin: r.durationMin,
          categoryId: r.categoryId != null ? idMap.get(r.categoryId) ?? null : null,
          note: r.note || '',
          source: r.source || 'manual',
          createdAt: r.createdAt || Date.now(),
        })
      }
      if (toAdd.length) await db.practiceRecords.bulkAdd(toAdd)
      await load()
      showToast(`导入完成，新增 ${toAdd.length} 条记录`)
    } catch {
      showToast('导入失败：文件格式不正确')
    }
  }

  return (
    <div>
      <h1 className="page-title">设置</h1>

      <section className="card">
        <div className="card-title">课程分类</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          点击分类可改名，也可新增自定义分类
        </div>

        {categories.map((c) => (
          <div className="cat-row" key={c.id}>
            <span className="cat-color" style={{ background: c.color }} />
            <span className="cat-name">{c.name}</span>
            <div className="cat-actions">
              <button className="link-btn" onClick={() => rename(c)}>
                改名
              </button>
              <button className="link-btn" onClick={() => remove(c)}>
                删除
              </button>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <div className="field-label">新增分类</div>
          <div className="input-row">
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="分类名称"
            />
            <button className="btn btn-primary" style={{ width: 100, padding: 12 }} onClick={addCategory}>
              添加
            </button>
          </div>
          <div className="field-label" style={{ marginTop: 12 }}>
            颜色
          </div>
          <div className="color-swatches">
            {CATEGORY_COLORS.map((col) => (
              <button
                key={col}
                className={'swatch' + (newColor === col ? ' swatch-active' : '')}
                style={{ background: col }}
                onClick={() => setNewColor(col)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">数据备份</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          数据存在本机浏览器里，建议定期导出备份，也可用于将来迁移到新版本
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={exportData}>
            ⬇️ 导出数据
          </button>
          <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>
            ⬆️ 导入数据
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) importData(f)
          }}
        />
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
