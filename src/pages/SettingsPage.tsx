import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db'
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
import { startOfDay, toYMD } from '../lib/time'
import { Toast } from '../components/Toast'
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
  const fileRef = useRef<HTMLInputElement>(null)
  const healthRef = useRef<HTMLInputElement>(null)
  const { msg, show } = useToast()
  useLang()

  useEffect(() => {
    db.settings.get('lastBackupAt').then((row) => {
      if (row && typeof row.value === 'number') setLastBackup(row.value)
    })
    getCode().then(setCloudCode)
    lastUploadAt().then(setCloudUpload)
  }, [])

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
      await db.entries.bulkAdd(rows)
      show(t(`已导入 ${rows.length} 条`, `Imported ${rows.length}`))
    } catch (err) {
      console.error(err)
      show(t('读取失败，确认是「健康」App 导出的文件', 'Could not read it — is this a Health export?'))
    } finally {
      setBusy('')
    }
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
      <Toast msg={msg} />
    </div>
  )
}
