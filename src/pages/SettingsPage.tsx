import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, type Entry } from '../db'
import { buildBackupJson, restoreBackupJson } from '../lib/backup'
import {
  adopt,
  disable,
  enable,
  formatCode,
  getCode,
  isConfigured,
  lastUploadAt,
  normalizeCode,
  restoreFromCloud,
  uploadNow,
} from '../lib/cloudBackup'
import { parseHealthFile } from '../lib/healthImport'
import { parseImportFile } from '../lib/importFile'
import {
  clearImported,
  clearImportedCategories,
  importSummary,
  lastBatchSize,
  recordBatch,
  undoLastImport,
  type ImportKind,
  type ImportSummary,
} from '../lib/imports'
import { startOfDay, toYMD } from '../lib/time'
import { Toast } from '../components/Toast'
import { WatchSplitSheet } from '../components/WatchSplitSheet'
import { LangToggle } from '../components/LangToggle'
import { useToast } from '../hooks/useToast'
import { t, useLang } from '../lib/i18n'

export function SettingsPage() {
  const [busy, setBusy] = useState('')
  const [lastBackup, setLastBackup] = useState<number | null>(null)
  const [cloudCode, setCloudCode] = useState<string | null>(null)
  const [cloudUpload, setCloudUpload] = useState<number | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreCode, setRestoreCode] = useState('')
  const [importInfo, setImportInfo] = useState<ImportSummary>({
    watch: 0,
    file: 0,
    total: 0,
    uncategorized: 0,
    classified: 0,
  })
  const [lastBatch, setLastBatch] = useState(0)
  const [splitOpen, setSplitOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const healthRef = useRef<HTMLInputElement>(null)
  const otherRef = useRef<HTMLInputElement>(null)
  const { msg, show } = useToast()
  useLang()

  useEffect(() => {
    db.settings.get('lastBackupAt').then((row) => {
      if (row && typeof row.value === 'number') setLastBackup(row.value)
    })
    getCode().then(setCloudCode)
    lastUploadAt().then(setCloudUpload)
    refreshImports()
  }, [])

  /** 导入了多少、还剩多少没分类、上一批有几条 */
  function refreshImports() {
    importSummary().then(setImportInfo)
    lastBatchSize().then(setLastBatch)
  }

  // 备份拖过一个月，就在这一栏和日历的齿轮上轻轻提醒一下
  const backupDays = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null
  const backupDue = backupDays !== null && backupDays > 30

  async function exportData() {
    setBusy(t('正在打包…', 'Packing…'))
    try {
      const json = await buildBackupJson()
      const blob = new Blob([json], { type: 'application/json' })
      const name = `${t('芭蕾手账备份', 'ballet-journal-backup')}-${toYMD(Date.now())}.json`
      const file = new File([blob], name, { type: 'application/json' })

      // 手机上有系统分享面板就交给它：可以直接存进「文件」或 iCloud，
      // 比在浏览器里下载更靠得住（装到主屏幕后下载经常打不开）
      let saved = false
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: t('芭蕾手账备份', 'Ballet journal backup') })
          saved = true
        } catch (err) {
          // 她自己取消了分享，就当这次没备份
          if ((err as { name?: string })?.name === 'AbortError') {
            setBusy('')
            return
          }
        }
      }
      if (!saved) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
      }

      const now = Date.now()
      await db.settings.put({ key: 'lastBackupAt', value: now })
      setLastBackup(now)
      show(
        saved
          ? t('备份好了', 'Backup saved')
          : t('已下载，去「文件」里确认一下', 'Downloaded — check your Files app'),
      )
    } catch {
      show(t('导出失败，再试一次', 'Export failed — try again'))
    } finally {
      setBusy('')
    }
  }

  async function importData(file: File) {
    setBusy(t('正在恢复…', 'Restoring…'))
    try {
      const added = await restoreBackupJson(await file.text())
      show(t(`恢复完成，新增 ${added} 条记录`, `Restored — ${added} entries added`))
    } catch (err) {
      console.error(err)
      show(t('导入失败：文件格式不对', 'Import failed: wrong file format'))
    } finally {
      setBusy('')
    }
  }

  async function turnCloudOn() {
    setBusy(t('正在打开…', 'Turning on…'))
    try {
      const code = await enable()
      setCloudCode(code)
      setShowCode(true)
      try {
        const at = await uploadNow()
        setCloudUpload(new Date(at).getTime())
        show(t('云备份已打开，第一份传好了', 'Cloud backup on — first copy uploaded'))
      } catch {
        show(t('云备份已打开，但这次没传成功，联网后会自动再传', 'On — upload failed, will retry'))
      }
    } finally {
      setBusy('')
    }
  }

  async function turnCloudOff() {
    if (
      !window.confirm(
        t(
          '关掉之后就不再自动备份了。云端已经存着的那份不会删，随时能用恢复码取回来。确定关掉吗？',
          'Automatic backup will stop. The copy already in the cloud stays and can still be restored. Turn it off?',
        ),
      )
    )
      return
    await disable()
    setCloudCode(null)
    setCloudUpload(null)
    setShowCode(false)
    show(t('已关闭', 'Turned off'))
  }

  async function pushNow() {
    setBusy(t('正在上传…', 'Uploading…'))
    try {
      const at = await uploadNow()
      setCloudUpload(new Date(at).getTime())
      show(t('传好了', 'Uploaded'))
    } catch {
      show(t('没传成功，检查一下网络', 'Upload failed — check your connection'))
    } finally {
      setBusy('')
    }
  }

  async function copyCode() {
    if (!cloudCode) return
    try {
      await navigator.clipboard.writeText(formatCode(cloudCode))
      show(t('恢复码已复制', 'Recovery code copied'))
    } catch {
      show(t('复制不了，请手抄一下', 'Could not copy — write it down'))
    }
  }

  async function restoreCloud() {
    const clean = normalizeCode(restoreCode)
    if (clean.length !== 20) {
      show(t('恢复码是 20 位，检查一下有没有抄漏', 'A recovery code is 20 characters'))
      return
    }
    if (
      !window.confirm(
        t(
          '会用云端那份备份补进这台手机，已有的记录不会被删，重复的会跳过。继续吗？',
          'The cloud backup will be merged into this phone. Nothing is deleted; duplicates are skipped. Continue?',
        ),
      )
    )
      return
    setBusy(t('正在还原…', 'Restoring…'))
    try {
      const added = await restoreFromCloud(clean)
      await adopt(clean)
      setCloudCode(clean)
      show(t(`还原完成，新增 ${added} 条记录`, `Restored — ${added} entries added`))
      setRestoreOpen(false)
      setRestoreCode('')
    } catch (err) {
      const kind = (err as Error)?.message
      show(
        kind === 'empty'
          ? t('这个恢复码下面还没有备份', 'No backup under that code')
          : t('还原失败，检查恢复码和网络', 'Restore failed — check the code and connection'),
      )
    } finally {
      setBusy('')
    }
  }

  async function importHealth(file: File) {
    setBusy(t('正在读取健康数据…', 'Reading health data…'))
    try {
      // 文件往往几百 MB：一边读一边报进度，别让她以为死机了
      const mb = (n: number) => Math.round(n / 1048576)
      const list = await parseHealthFile(file, {
        onProgress: ({ done, total }) => {
          if (total > 0) {
            const pct = Math.min(99, Math.floor((done / total) * 100))
            setBusy(t(`正在读取健康数据… ${pct}%`, `Reading health data… ${pct}%`))
          } else {
            setBusy(t(`正在读取健康数据… ${mb(done)} MB`, `Reading health data… ${mb(done)} MB`))
          }
        },
      })
      if (list.length === 0) {
        show(t('文件里没有 Barre 类型的训练', 'No Barre workouts in this file'))
        return
      }
      setBusy(t('正在整理…', 'Sorting…'))
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
        show(t('这些记录之前已经导入过了', 'These were already imported'))
        return
      }
      if (
        !window.confirm(
          t(
            `找到 ${list.length} 条 Barre 训练，其中 ${rows.length} 条是新的。导入吗？`,
            `Found ${list.length} Barre workouts, ${rows.length} of them new. Import?`,
          ),
        )
      )
        return
      const ids = await db.entries.bulkAdd(rows, { allKeys: true })
      await recordBatch('watch', ids)
      refreshImports()
      show(t(`已导入 ${rows.length} 条`, `Imported ${rows.length}`))
    } catch (err) {
      console.error(err)
      show(t('读取失败，确认是「健康」App 导出的文件', 'Could not read it — is this a Health export?'))
    } finally {
      setBusy('')
    }
  }

  /** 「日期|时长|类型|备注」——同一份文件再导一次时用来认重 */
  function importKey(date: number, durationMin: number, typeName: string, note: string): string {
    return `${date}|${durationMin}|${typeName.trim().toLowerCase()}|${note.trim()}`
  }

  /** 从别的 App 导出的 CSV / HTML */
  async function importOtherFile(file: File) {
    setBusy(t('正在读取文件…', 'Reading file…'))
    try {
      const parsed = parseImportFile(await file.text(), file.name)
      if (parsed.rows.length === 0) {
        show(
          t(
            '文件里没读出记录，「日期」和「时长」那两列是不是空的？',
            'No rows found — are the date and duration columns empty?',
          ),
        )
        return
      }

      setBusy(t('正在整理…', 'Sorting…'))
      const [cats, existing] = await Promise.all([db.categories.toArray(), db.entries.toArray()])
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')
      const catByName = new Map(cats.map((c) => [norm(c.name), c.id!]))
      const catNameById = new Map(cats.map((c) => [c.id!, c.name.trim().toLowerCase()]))

      // 「芭蕾初级」能对上「初级」这种写全的名字；对不上就留成没分类
      function matchCategory(typeName: string): number | null {
        const t = norm(typeName)
        if (!t) return null
        const exact = catByName.get(t)
        if (exact != null) return exact
        let best: { id: number; len: number } | null = null
        for (const c of cats) {
          const n = norm(c.name)
          if (!n) continue
          if ((t.includes(n) || n.includes(t)) && (!best || n.length > best.len)) {
            best = { id: c.id!, len: n.length }
          }
        }
        return best ? best.id : null
      }

      // 已经有的记录先数一遍：同一份文件导第二次时不会重复
      const pool = new Map<string, number>()
      for (const e of existing) {
        // 导入时文件里的类型名优先，其次是现在挂着的类型名
        const k = importKey(
          e.date,
          e.durationMin,
          e.importType ?? catNameById.get(e.categoryId ?? -1) ?? '',
          e.note,
        )
        pool.set(k, (pool.get(k) ?? 0) + 1)
      }

      const unmatched = new Set<string>()
      const rows: Entry[] = []
      for (const r of parsed.rows) {
        const k = importKey(r.date, r.durationMin, r.typeName, r.note)
        const left = pool.get(k) ?? 0
        if (left > 0) {
          pool.set(k, left - 1)
          continue
        }
        const categoryId = matchCategory(r.typeName)
        if (r.typeName && categoryId == null) unmatched.add(r.typeName)
        rows.push({
          date: r.date,
          durationMin: r.durationMin,
          categoryId,
          movementIds: [],
          note: r.note,
          images: [],
          source: 'file',
          importType: r.typeName || undefined,
          createdAt: Date.now(),
        })
      }

      if (rows.length === 0) {
        show(t('这些记录之前已经导入过了', 'These were already imported'))
        return
      }

      // 把总时长也报出来，单位读错（小时当成分钟）一眼就能发现
      const totalHours = Math.round((rows.reduce((s, e) => s + e.durationMin, 0) / 60) * 10) / 10
      const missTypes = [...unmatched].slice(0, 3).join('、') + (unmatched.size > 3 ? '…' : '')
      const missNote =
        unmatched.size > 0
          ? t(
              `\n\n「${missTypes}」没对上你的课程类型，先留成没分类，之后可以按比例分。`,
              `\n\n“${missTypes}” didn’t match your class types — they’ll stay unfiled, and you can sort them by ratio afterwards.`,
            )
          : ''
      if (
        !window.confirm(
          t(
            `找到 ${parsed.rows.length} 条记录，其中 ${rows.length} 条是新的，一共 ${totalHours} 小时。导入吗？${missNote}`,
            `Found ${parsed.rows.length} records, ${rows.length} of them new, ${totalHours} hours in total. Import?${missNote}`,
          ),
        )
      )
        return

      setBusy(t('正在导入…', 'Importing…'))
      const ids = await db.entries.bulkAdd(rows, { allKeys: true })
      await recordBatch('file', ids)
      refreshImports()
      show(t(`已导入 ${rows.length} 条`, `Imported ${rows.length}`))
    } catch (err) {
      const kind = (err as Error)?.message
      show(
        kind === 'no-table'
          ? t(
              '这个 HTML 里没找到表格，换成 CSV 导出再试',
              'No table in that HTML — try exporting CSV instead',
            )
          : kind === 'no-header'
            ? t(
                '没找到「日期」「时长」这两列，把文件开头几行发我看看',
                'Could not find date and duration columns — send me the first few lines',
              )
            : t('读取失败，确认一下文件是 CSV 或 HTML', 'Could not read it — is it CSV or HTML?'),
      )
    } finally {
      setBusy('')
    }
  }

  async function undoImport() {
    if (lastBatch === 0) return
    if (
      !window.confirm(
        t(
          `撤回上次导入的 ${lastBatch} 条记录？\n\n这些记录会从手账里删掉，之后给它们分过的类型也一起没了。自己手动记的不受影响。`,
          `Undo the last import of ${lastBatch} records?\n\nThey will be deleted, including any categories you gave them. Records you made by hand are untouched.`,
        ),
      )
    )
      return
    const n = await undoLastImport()
    refreshImports()
    show(t(`已撤回 ${n} 条`, `Removed ${n}`))
  }

  async function clearImport(kind: ImportKind) {
    const n = kind === 'watch' ? importInfo.watch : importInfo.file
    if (n === 0) return
    const what = kind === 'watch' ? t('手表导入的', 'from Apple Watch') : t('从文件导入的', 'from files')
    if (
      !window.confirm(
        t(
          `清空${what} ${n} 条记录？\n\n只删这一部分；另一种导入、自己手动记的记录、笔记、照片都不受影响。删了就找不回来了。`,
          `Delete the ${n} records ${what}?\n\nThe other import source, records you made by hand, notes and photos are untouched. This cannot be undone.`,
        ),
      )
    )
      return
    const removed = await clearImported(kind)
    refreshImports()
    show(t(`已清空 ${removed} 条`, `Deleted ${removed}`))
  }

  async function resetCategories() {
    if (importInfo.classified === 0) return
    if (
      !window.confirm(
        t(
          `把导入记录身上已经分好的 ${importInfo.classified} 条类型清掉，重新按比例分？\n\n记录本身不会删。`,
          `Clear the categories on ${importInfo.classified} imported records so you can sort them again?\n\nThe records themselves stay.`,
        ),
      )
    )
      return
    const n = await clearImportedCategories()
    refreshImports()
    show(t(`已清空 ${n} 条的类型`, `Cleared categories on ${n}`))
  }

  /** 距离上次上传多久了，说人话 */
  function agoText(ts: number): string {
    const mins = Math.floor((Date.now() - ts) / 60000)
    if (mins < 1) return t('刚刚', 'just now')
    if (mins < 60) return t(`${mins} 分钟前`, `${mins} min ago`)
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t(`${hours} 小时前`, `${hours} h ago`)
    return t(`${Math.floor(hours / 24)} 天前`, `${Math.floor(hours / 24)} days ago`)
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label={t('返回', 'Back')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <span className="wordmark">{t('设置', 'Settings')}</span>
        <LangToggle />
      </header>

      {isConfigured() && (
        <section className="block">
          <h2 className="section-label">{t('自动云备份', 'Automatic cloud backup')}</h2>

          {!cloudCode ? (
            <>
              <p className="hint">
                {t(
                  '打开之后，每次记完一笔，几秒钟后会自动把一整份备份传到只有你能打开的云端。手机哪天被清空、换了新手机，都能用它全部拿回来。',
                  'When this is on, every change is copied to your own private space in the cloud a few seconds later. If the phone is ever wiped, everything comes back.',
                )}
              </p>
              <button className="btn btn-primary" onClick={turnCloudOn} disabled={!!busy}>
                {t('开启云备份', 'Turn on cloud backup')}
              </button>
            </>
          ) : (
            <>
              <p className="hint">
                {t(
                  '每次记完一笔，几秒钟后自动传一份。',
                  'Every change is uploaded automatically a few seconds later.',
                )}
              </p>

              <div className="code-box">
                <div className="code-value" aria-label={t('恢复码', 'Recovery code')}>
                  {showCode ? formatCode(cloudCode) : 'BAL-••••-••••-••••-••••'}
                </div>
                <div className="btn-row">
                  <button className="btn btn-outline" onClick={() => setShowCode((v) => !v)}>
                    {showCode ? t('藏起来', 'Hide') : t('显示恢复码', 'Show code')}
                  </button>
                  <button className="btn btn-outline" onClick={copyCode}>
                    {t('抄下来', 'Copy')}
                  </button>
                </div>
              </div>

              <p className="hint warn">
                {t(
                  '这串码是唯一的钥匙——抄在纸上或截图存进相册。手机丢了、换新手机时，全靠它把记录取回来。',
                  'This is the only key. Write it down or keep a screenshot — it is how you get everything back on a new phone.',
                )}
              </p>

              <p className="hint">
                {cloudUpload
                  ? t(`上次上传：${agoText(cloudUpload)}`, `Last upload: ${agoText(cloudUpload)}`)
                  : t('还没有传成功过。', 'Nothing uploaded yet.')}
              </p>

              <div className="btn-row">
                <button className="btn btn-outline" onClick={pushNow} disabled={!!busy}>
                  {t('立即上传一次', 'Upload now')}
                </button>
                <button className="btn btn-outline" onClick={turnCloudOff} disabled={!!busy}>
                  {t('关闭', 'Turn off')}
                </button>
              </div>
            </>
          )}

          <button className="link-btn" onClick={() => setRestoreOpen((v) => !v)}>
            {t('换手机了？用恢复码还原 ›', 'New phone? Restore with a code ›')}
          </button>
          {restoreOpen && (
            <div className="restore-box">
              <input
                className="input input-sm"
                value={restoreCode}
                onChange={(e) => setRestoreCode(e.target.value)}
                placeholder="BAL-XXXX-XXXX-XXXX-XXXX"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="btn btn-primary" onClick={restoreCloud} disabled={!!busy}>
                {t('还原到这台手机', 'Restore to this phone')}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="block">
        <h2 className="section-label">iWatch</h2>
        <p className="hint">
          {t(
            '在 iPhone「健康」App 里点右上角头像 →「导出所有健康数据」，把 zip 文件选进来，会自动挑出 Barre 训练。文件通常有几百 MB，读取时别锁屏、别切走，等一下进度走完。',
            'In the iPhone Health app, tap your profile → “Export All Health Data”, then pick the zip here. Barre workouts are picked out automatically. The file is often hundreds of MB — keep the screen on and stay on this page while it reads.',
          )}
        </p>
        <button className="btn btn-outline" onClick={() => healthRef.current?.click()}>
          {t('导入 iWatch 记录', 'Import Apple Watch workouts')}
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
        <h2 className="section-label">{t('其他 App 的记录', 'From another app')}</h2>
        <p className="hint">
          {t(
            '从别的 App 导出 CSV 或 HTML，选进来就能读：它会自己找「日期」「时长」「类型」「备注」这几列，别的列不管。日期或时长读不出来的行会跳过。',
            'Export CSV or HTML from another app and pick it here. It looks for date, duration, type and note columns; rows without a readable date and duration are skipped.',
          )}
        </p>
        <button className="btn btn-outline" onClick={() => otherRef.current?.click()}>
          {t('导入 CSV / HTML', 'Import CSV / HTML')}
        </button>
        <input
          ref={otherRef}
          type="file"
          accept=".csv,.html,.htm,text/csv,text/html"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) importOtherFile(f)
          }}
        />
      </section>

      <section className="block">
        <h2 className="section-label">{t('导入的记录', 'Imported records')}</h2>
        {importInfo.total === 0 ? (
          <p className="hint">{t('还没有导入过记录。', 'Nothing imported yet.')}</p>
        ) : (
          <>
            <p className="hint">
              {t(
                `手表 ${importInfo.watch} 条 · 文件 ${importInfo.file} 条` +
                  (importInfo.uncategorized > 0
                    ? ` · ${importInfo.uncategorized} 条还没分类`
                    : ''),
                `${importInfo.watch} from Apple Watch · ${importInfo.file} from files` +
                  (importInfo.uncategorized > 0
                    ? ` · ${importInfo.uncategorized} unfiled`
                    : ''),
              )}
            </p>
            {importInfo.uncategorized > 0 && (
              <div className="split-cta">
                <button className="btn btn-primary" onClick={() => setSplitOpen(true)}>
                  {t(
                    `给 ${importInfo.uncategorized} 条记录分类`,
                    `Sort ${importInfo.uncategorized} unfiled workouts`,
                  )}
                </button>
              </div>
            )}
            <div className="btn-row">
              <button
                className="btn btn-outline"
                onClick={undoImport}
                disabled={lastBatch === 0 || !!busy}
              >
                {t(
                  `撤回上次导入${lastBatch > 0 ? `（${lastBatch} 条）` : ''}`,
                  `Undo last import${lastBatch > 0 ? ` (${lastBatch})` : ''}`,
                )}
              </button>
            </div>
            <div className="btn-row">
              {importInfo.watch > 0 && (
                <button
                  className="btn btn-outline"
                  onClick={() => clearImport('watch')}
                  disabled={!!busy}
                >
                  {t(
                    `清空手表记录（${importInfo.watch} 条）`,
                    `Delete watch records (${importInfo.watch})`,
                  )}
                </button>
              )}
              {importInfo.file > 0 && (
                <button
                  className="btn btn-outline"
                  onClick={() => clearImport('file')}
                  disabled={!!busy}
                >
                  {t(
                    `清空文件导入（${importInfo.file} 条）`,
                    `Delete file imports (${importInfo.file})`,
                  )}
                </button>
              )}
            </div>
            {importInfo.classified > 0 && (
              <button className="link-btn" onClick={resetCategories}>
                {t('清空类型，重新按比例分 ›', 'Clear categories and sort again ›')}
              </button>
            )}
          </>
        )}
      </section>

      <section className="block">
        <h2 className="section-label">{t('备份', 'Backup')}</h2>
        <p className="hint">
          {t(
            '数据只存在这台手机的浏览器里。定期导出一份，换手机或以后搬到云端都用得上。',
            'Everything lives in this phone’s browser. Export a copy now and then — for a new phone, or for later.',
          )}
        </p>
        {lastBackup ? (
          <p className={'hint backup-when' + (backupDue ? ' is-due' : '')}>
            {t(
              `上次备份：${toYMD(lastBackup)}${backupDays ? ` · ${backupDays} 天前` : ' · 今天'}${
                backupDue ? '，该再备份一次了' : ''
              }`,
              `Last backup: ${toYMD(lastBackup)}${backupDays ? ` · ${backupDays} days ago` : ' · today'}${
                backupDue ? ' — time for a fresh one' : ''
              }`,
            )}
          </p>
        ) : (
          <p className="hint backup-when">{t('还没有备份过。', 'No backup yet.')}</p>
        )}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={exportData} disabled={!!busy}>
            {t('导出备份', 'Export backup')}
          </button>
          <button className="btn btn-outline" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            {t('导入备份', 'Import backup')}
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

      {splitOpen && (
        <WatchSplitSheet onClose={() => setSplitOpen(false)} onDone={refreshImports} />
      )}

      <Toast msg={msg} />
    </div>
  )
}
