import { useEffect, useRef, useState } from 'react'
import { db, type Category, type PracticeRecord } from '../db'
import { CATEGORY_COLORS, ensureSeedCategories } from '../lib/categories'
import { formatDateShort, formatDuration, formatTimeShort } from '../lib/time'
import { parseHealthFile, type ImportedWorkout } from '../lib/healthImport'
import { CategoryPicker } from '../components/CategoryPicker'
import { RecordForm, type RecordFormValues } from '../components/RecordForm'

const SOURCE_LABEL: Record<string, string> = { timer: '计时', manual: '手动', watch: 'iWatch' }
const SOURCE_CLASS: Record<string, string> = { timer: '', manual: 'badge-manual', watch: 'badge-watch' }

export function TrackPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [records, setRecords] = useState<PracticeRecord[]>([])
  const [editing, setEditing] = useState<PracticeRecord | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [imported, setImported] = useState<ImportedWorkout[]>([])
  const [importCatId, setImportCatId] = useState<number | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0])
  const [toast, setToast] = useState('')
  const [formKey, setFormKey] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ensureSeedCategories().then(load)
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  async function load() {
    const [cats, recs] = await Promise.all([
      db.categories.orderBy('order').toArray(),
      db.practiceRecords.orderBy('startAt').reverse().limit(100).toArray(),
    ])
    setCategories(cats)
    setRecords(recs)
    setImportCatId((prev) => {
      if (prev != null) return prev
      const barre = cats.find((c) => c.name.includes('Barre') || c.name.includes('基训'))
      return (barre ?? cats[0])?.id ?? null
    })
  }

  async function saveManual(v: RecordFormValues) {
    const durationMin = v.hours * 60 + v.minutes
    if (durationMin <= 0) {
      showToast('请选择时长')
      return
    }
    const [y, m, d] = v.date.split('-').map(Number)
    const startAt = new Date(y, m - 1, d, 12, 0, 0).getTime()
    await db.practiceRecords.add({
      startAt,
      endAt: startAt + durationMin * 60000,
      durationMin,
      categoryId: v.categoryId,
      note: v.note,
      source: 'manual',
      createdAt: Date.now(),
    })
    setFormKey((k) => k + 1)
    await load()
    showToast('已保存')
  }

  async function saveEdit(v: RecordFormValues) {
    if (!editing) return
    const durationMin = v.hours * 60 + v.minutes
    if (durationMin <= 0) {
      showToast('请选择时长')
      return
    }
    const [y, m, d] = v.date.split('-').map(Number)
    const orig = new Date(editing.startAt)
    const startAt = new Date(y, m - 1, d, orig.getHours(), orig.getMinutes(), orig.getSeconds()).getTime()
    await db.practiceRecords.update(editing.id!, {
      startAt,
      endAt: startAt + durationMin * 60000,
      durationMin,
      categoryId: v.categoryId,
      note: v.note,
    })
    setEditing(null)
    await load()
    showToast('已更新')
  }

  async function removeRecord(r: PracticeRecord) {
    if (!window.confirm('确认删除这条记录？')) return
    await db.practiceRecords.delete(r.id!)
    await load()
  }

  async function addCategory() {
    const name = newName.trim()
    if (!name) return
    if (categories.some((c) => c.name === name)) {
      showToast('已有同名分类')
      return
    }
    await db.categories.add({ name, color: newColor, order: categories.length })
    setAddOpen(false)
    setNewName('')
    await load()
    showToast('已添加分类')
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setImportBusy(true)
      const list = await parseHealthFile(file)
      setImported(list)
      setImportOpen(true)
      if (list.length === 0) showToast('没有找到 Barre 类型的训练记录')
    } catch (err: any) {
      showToast(err?.message || '解析失败，请确认是 Apple 健康导出的文件')
    } finally {
      setImportBusy(false)
    }
  }

  async function confirmImport() {
    if (imported.length === 0) return
    setImportBusy(true)
    const existing = new Set(
      (await db.practiceRecords.where('source').equals('watch').toArray()).map((r) => r.startAt),
    )
    const toAdd = imported
      .filter((w) => !existing.has(w.startAt))
      .map((w) => ({
        startAt: w.startAt,
        endAt: w.endAt,
        durationMin: w.durationMin,
        categoryId: importCatId,
        note: '',
        source: 'watch' as const,
        createdAt: Date.now(),
      }))
    if (toAdd.length) await db.practiceRecords.bulkAdd(toAdd)
    const skipped = imported.length - toAdd.length
    setImportOpen(false)
    setImported([])
    setImportBusy(false)
    await load()
    showToast(skipped > 0 ? `已导入 ${toAdd.length} 条，跳过 ${skipped} 条重复` : `已导入 ${toAdd.length} 条`)
  }

  return (
    <div>
      <h1 className="page-title">记录练习</h1>
      <p className="page-sub">记下今天的练习时长与内容</p>

      <section className="card">
        <RecordForm
          key={formKey}
          categories={categories}
          onSubmit={saveManual}
          onAddCategory={() => setAddOpen(true)}
        />
      </section>

      <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>
        导入 iWatch 的 Barre 记录
      </button>
      <p className="page-sub">
        在 iPhone「健康」App → 头像 →「导出所有健康数据」，把导出的 zip 文件导入这里，会自动提取 Barre 记录。
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.xml"
        style={{ display: 'none' }}
        onChange={onFilePicked}
      />

      {importBusy && <div className="toast">正在解析文件，请稍候…</div>}

      <h2 className="section-title">最近记录</h2>
      {records.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 40, marginBottom: 10 }}>🩰</div>
          还没有记录，从上面开始你的第一次打卡吧
        </div>
      ) : (
        <section className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {records.map((r) => {
            const c = categories.find((x) => x.id === r.categoryId)
            return (
              <div className="record-row" key={r.id}>
                <div className="record-date">
                  <div className="d">{formatDateShort(r.startAt)}</div>
                  <div className="t">{formatTimeShort(r.startAt)}</div>
                </div>
                <div className="record-main">
                  <div className="cat">
                    <span className="chip-dot" style={{ background: c ? c.color : '#c7c7cc' }} />
                    {c ? c.name : '未分类'}
                    <span className={'badge ' + SOURCE_CLASS[r.source]}>{SOURCE_LABEL[r.source]}</span>
                  </div>
                  {r.note && <div className="note">{r.note}</div>}
                </div>
                <div className="record-dur">{formatDuration(r.durationMin)}</div>
                <div className="cat-actions">
                  <button className="link-btn" onClick={() => setEditing(r)}>
                    编辑
                  </button>
                  <button className="link-btn link-btn-danger" onClick={() => removeRecord(r)}>
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">编辑记录</div>
            <RecordForm
              categories={categories}
              initial={editing}
              onSubmit={saveEdit}
              onCancel={() => setEditing(null)}
              onAddCategory={() => setAddOpen(true)}
            />
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modal-mask" onClick={() => !importBusy && setImportOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">确认导入 iWatch 记录</div>
            <p className="page-sub" style={{ textAlign: 'center' }}>
              找到 <b>{imported.length}</b> 条 Barre 训练，将归入下方分类
            </p>
            <div className="field">
              <CategoryPicker
                categories={categories}
                value={importCatId}
                onChange={setImportCatId}
              />
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={confirmImport} disabled={importBusy}>
                确认导入
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="modal-mask" onClick={() => setAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">新增分类</div>
            <div className="field">
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="分类名称，比如：足尖课"
                autoFocus
              />
            </div>
            <div className="field">
              <div className="field-label">颜色</div>
              <div className="color-swatches">
                {CATEGORY_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    className={'swatch' + (newColor === col ? ' swatch-active' : '')}
                    style={{ background: col }}
                    onClick={() => setNewColor(col)}
                  />
                ))}
              </div>
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={addCategory}>
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
