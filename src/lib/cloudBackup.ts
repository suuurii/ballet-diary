import { db } from '../db'
import { buildBackupJson, restoreBackupJson } from './backup'
import { BACKUP_API } from './cloudConfig'

/**
 * 自动云备份。
 *
 * 思路很简单：一串「恢复码」既是你的钥匙，也是你的地址。
 * 网页把恢复码算成一段谁也反推不回来的乱码当作文件夹名，备份就存在那个文件夹里。
 * 所以云上没有人能凭备份文件知道你是谁，服务器也不保存恢复码本身。
 */

/** 恢复码用的字母表：去掉了容易看错的 I L O U（0/O、1/I/L 分不清） */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LEN = 20

export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN))
  let out = ''
  for (const b of bytes) out += ALPHABET[b % 32]
  return out
}

/**
 * 把用户随手敲的恢复码整成一个标准样子：
 * 去掉横线和空格、转大写、丢掉开头的 BAL-、把看错的字母换回来（O→0、I/L→1、U→V）。
 */
export function normalizeCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '')
  const body = raw.length > CODE_LEN && raw.startsWith('BAL') ? raw.slice(3) : raw
  return body
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
    .slice(0, CODE_LEN)
}

/** 显示成 BAL-XXXX-XXXX-XXXX-XXXX，好念也好抄 */
export function formatCode(code: string): string {
  const clean = normalizeCode(code).slice(0, CODE_LEN)
  const groups = clean.match(/.{1,5}/g) || []
  return groups.length ? `BAL-${groups.join('-')}` : ''
}

export function isConfigured(): boolean {
  return BACKUP_API !== ''
}

/* ---------- 开关：恢复码存在 settings 里 ---------- */

export async function getCode(): Promise<string | null> {
  const row = await db.settings.get('cloudCode')
  return row && typeof row.value === 'string' ? row.value : null
}

export async function isOn(): Promise<boolean> {
  return (await getCode()) !== null
}

/** 打开云备份：生成一串新的恢复码并存下，立刻传第一份 */
export async function enable(): Promise<string> {
  const code = generateCode()
  await db.settings.put({ key: 'cloudCode', value: code })
  await db.settings.put({ key: 'cloudEnabledAt', value: Date.now() })
  return code
}

/** 关掉云备份：只是以后不再上传，云端已有的那份不会删（删了你可能还需要它） */
export async function disable(): Promise<void> {
  await db.settings.delete('cloudCode')
  await db.settings.delete('lastCloudBackupAt')
}

/** 换一台手机时用：用别人抄下来的恢复码接管云端那份备份 */
export async function adopt(code: string): Promise<void> {
  const clean = normalizeCode(code)
  if (clean.length !== CODE_LEN) throw new Error('bad-code')
  await db.settings.put({ key: 'cloudCode', value: clean })
  await db.settings.put({ key: 'cloudEnabledAt', value: Date.now() })
}

export async function lastUploadAt(): Promise<number | null> {
  const row = await db.settings.get('lastCloudBackupAt')
  return row && typeof row.value === 'number' ? row.value : null
}

/* ---------- 压缩：照片多的时候备份很大，传之前先压一下 ---------- */

async function gzipBytes(input: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const stream = new Blob([input as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

async function gunzipBytes(input: ReadableStream<Uint8Array>): Promise<string> {
  if (typeof DecompressionStream === 'undefined') throw new Error('no-decompress')
  const decoder = new DecompressionStream('gzip') as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >
  const stream = input.pipeThrough(decoder)
  return await new Response(stream).text()
}

/* ---------- 上传 / 下载 ---------- */

export async function uploadNow(): Promise<string> {
  const code = await getCode()
  if (!code) throw new Error('cloud off')
  if (!isConfigured()) throw new Error('cloud not configured')

  const json = await buildBackupJson()
  const raw = new TextEncoder().encode(json)
  const gz = await gzipBytes(raw)
  const body = gz ?? raw

  const res = await fetch(`${BACKUP_API}/backup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${code}`,
      'Content-Type': 'application/json',
      'X-Backup-Gzip': gz ? '1' : '0',
    },
    body: body as BodyInit,
  })
  if (!res.ok) throw new Error(`upload failed ${res.status}`)
  const out = (await res.json()) as { updatedAt?: string }
  const now = Date.now()
  await db.settings.put({ key: 'lastCloudBackupAt', value: now })
  return out.updatedAt || new Date(now).toISOString()
}

export async function fetchCloudBackup(code: string): Promise<string> {
  if (!isConfigured()) throw new Error('cloud not configured')
  const res = await fetch(`${BACKUP_API}/backup`, {
    headers: { Authorization: `Bearer ${normalizeCode(code)}` },
  })
  if (res.status === 404) throw new Error('empty')
  if (!res.ok) throw new Error(`download failed ${res.status}`)
  if (res.headers.get('X-Backup-Gzip') === '1' && res.body) return await gunzipBytes(res.body)
  return await res.text()
}

/** 用恢复码把云端的备份合并回这台手机 */
export async function restoreFromCloud(code: string): Promise<number> {
  const json = await fetchCloudBackup(code)
  return await restoreBackupJson(json)
}

/* ---------- 自动上传：记完一笔，安静地等几秒再传 ---------- */

const DELAY = 6000
let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let again = false

async function flush(): Promise<void> {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    if (await isOn()) await uploadNow()
  } catch {
    // 断网、后台睡着、服务没开——都不打扰她，下次记完再传
  } finally {
    running = false
    if (again) {
      again = false
      scheduleBackup()
    }
  }
}

/** 攒一小会儿再传：连着改几笔只传最后一次 */
export function scheduleBackup(): void {
  if (!isConfigured()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, DELAY)
}

/** 页面切到后台前赶紧传一次，免得刚记的东西还没出门 */
export function flushNow(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  void flush()
}

let started = false

/** 在 App 启动时调一次：之后任何一次改动都会自动上传 */
export function startAutoBackup(): void {
  if (started || !isConfigured()) return
  started = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })
  window.addEventListener('online', scheduleBackup)
  void isOn().then(async (on) => {
    // 上次没传成功（比如当时没网），打开时补一次
    if (!on) return
    const last = await lastUploadAt()
    if (!last || Date.now() - last > 60_000) scheduleBackup()
  })
}
