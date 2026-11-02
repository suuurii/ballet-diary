import JSZip from 'jszip'

export interface ImportedWorkout {
  startAt: number
  endAt: number
  durationMin: number
  source: 'watch'
  note: string
}

export interface ParseProgress {
  /** 已经读进去的字节数 */
  done: number
  /** 总共要读多少字节（不知道时是 0） */
  total: number
}

export interface ParseOptions {
  onProgress?: (p: ParseProgress) => void
}

// Apple Health export 的日期格式：2024-05-01 09:00:00 +0800
function parseAppleDate(s: string): number {
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?: ([+-])(\d{2}):?(\d{2}))?$/,
  )
  if (!m) {
    const t = Date.parse(s.replace(' ', 'T'))
    return Number.isNaN(t) ? 0 : t
  }
  const y = +m[1]
  const mo = +m[2]
  const d = +m[3]
  const h = +m[4]
  const mi = +m[5]
  const se = +m[6]
  const utc = Date.UTC(y, mo - 1, d, h, mi, se)
  let offset = 0
  if (m[7]) {
    const sign = m[7] === '-' ? -1 : 1
    const oh = +m[8]
    const om = +(m[9] || 0)
    offset = sign * (oh * 60 + om) * 60000
  }
  return utc - offset
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(name + '="([^"]*)"'))
  return m ? m[1] : null
}

function toWorkout(tag: string): ImportedWorkout | null {
  const type = attr(tag, 'workoutActivityType') || ''
  if (!type.toLowerCase().includes('barre')) return null
  const startAt = parseAppleDate(attr(tag, 'startDate') || '')
  const endAt = parseAppleDate(attr(tag, 'endDate') || '')
  if (!startAt || !endAt || endAt <= startAt) return null
  const durationMin = Math.round(((endAt - startAt) / 60000) * 10) / 10
  return { startAt, endAt, durationMin, source: 'watch', note: '' }
}

/** 一次性解析整段 XML（小文件用，老系统不支持边解压边读时也用它兜底） */
export function parseWorkouts(xml: string): ImportedWorkout[] {
  const out: ImportedWorkout[] = []
  const re = /<Workout\b[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const w = toWorkout(m[0])
    if (w) out.push(w)
  }
  out.sort((a, b) => a.startAt - b.startAt)
  return out
}

// ——— 下面是为了「边读边解压」写的一点点 zip 结构解析 ———
// 「健康」导出的 zip 常常几百 MB，export.xml 解开后更大。
// 整份读进内存会把手机上这个页面顶崩（白屏），所以只读它的「目录」，
// 找到 export.xml 那一段压缩数据，再一块一块地解压、扫完就丢。

const SIG_EOCD = 0x06054b50
const SIG_CD = 0x02014b50
const SIG_LOCAL = 0x04034b50
const SIG_ZIP64_LOCATOR = 0x07064b50
const SIG_ZIP64_EOCD = 0x06064b50

async function view(file: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await file.slice(start, end).arrayBuffer())
}

interface ZipEntry {
  name: string
  method: number
  compSize: number
  uncompSize: number
  localOffset: number
}

async function readCentralDirectory(file: File): Promise<ZipEntry[]> {
  // 目录的目录（EOCD）在文件最末尾，最多再跟 64KB 注释
  const tailLen = Math.min(file.size, 65_557)
  const tailStart = file.size - tailLen
  const tail = await view(file, tailStart, file.size)

  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not-a-zip')

  let cdOffset = tail.getUint32(eocd + 16, true)
  let cdSize = tail.getUint32(eocd + 12, true)

  // 超过 4GB 的部分地址写在 zip64 记录里
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const locAt = eocd - 20
    if (locAt >= 0 && tail.getUint32(locAt, true) === SIG_ZIP64_LOCATOR) {
      const z64At = Number(tail.getBigUint64(locAt + 8, true))
      const rec = await view(file, z64At, z64At + 56)
      if (rec.getUint32(0, true) === SIG_ZIP64_EOCD) {
        cdSize = Number(rec.getBigUint64(40, true))
        cdOffset = Number(rec.getBigUint64(48, true))
      }
    }
  }

  const cd = await view(file, cdOffset, cdOffset + cdSize)
  const out: ZipEntry[] = []
  let p = 0
  while (p + 46 <= cd.byteLength && cd.getUint32(p, true) === SIG_CD) {
    const method = cd.getUint16(p + 10, true)
    let compSize = cd.getUint32(p + 20, true)
    let uncompSize = cd.getUint32(p + 24, true)
    const nameLen = cd.getUint16(p + 28, true)
    const extraLen = cd.getUint16(p + 30, true)
    const commentLen = cd.getUint16(p + 32, true)
    let localOffset = cd.getUint32(p + 42, true)
    const name = new TextDecoder().decode(
      new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen),
    )

    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) {
      let e = p + 46 + nameLen
      const end = e + extraLen
      while (e + 4 <= end) {
        const tag = cd.getUint16(e, true)
        const len = cd.getUint16(e + 2, true)
        if (tag === 0x0001) {
          let q = e + 4
          if (uncompSize === 0xffffffff) {
            uncompSize = Number(cd.getBigUint64(q, true))
            q += 8
          }
          if (compSize === 0xffffffff) {
            compSize = Number(cd.getBigUint64(q, true))
            q += 8
          }
          if (localOffset === 0xffffffff) localOffset = Number(cd.getBigUint64(q, true))
          break
        }
        e += 4 + len
      }
    }

    out.push({ name, method, compSize, uncompSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** 算出这条文件的数据从第几个字节开始（本地文件头长度不定） */
async function dataStartOf(file: File, entry: ZipEntry): Promise<number> {
  const head = await view(file, entry.localOffset, entry.localOffset + 30)
  if (head.getUint32(0, true) !== SIG_LOCAL) throw new Error('zip-broken')
  const nameLen = head.getUint16(26, true)
  const extraLen = head.getUint16(28, true)
  return entry.localOffset + 30 + nameLen + extraLen
}

// 标签可能被切在两块之间，留一小截尾巴等下一块拼上
const TAIL = 4096

function createScanner() {
  const found: ImportedWorkout[] = []
  let buf = ''

  function feed(text: string, final = false) {
    buf += text
    const re = /<Workout\b[^>]*>/g
    let consumed = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(buf)) !== null) {
      const end = m.index + m[0].length
      // 靠近块尾的那个标签可能还没结束，留到下一块再判断
      if (!final && end > buf.length - TAIL) break
      const w = toWorkout(m[0])
      if (w) found.push(w)
      consumed = end
    }
    if (consumed > 0) buf = buf.slice(consumed)
    else if (buf.length > TAIL) buf = buf.slice(-TAIL)
  }

  return { feed, found }
}

async function scanStream(
  stream: ReadableStream<Uint8Array>,
  total: number,
  opts: ParseOptions,
): Promise<ImportedWorkout[]> {
  const scanner = createScanner()
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let done = 0
  let lastTick = 0

  opts.onProgress?.({ done: 0, total })
  try {
    for (;;) {
      const { done: end, value } = await reader.read()
      if (end) break
      done += value.byteLength
      scanner.feed(decoder.decode(value, { stream: true }))
      const now = Date.now()
      if (now - lastTick > 200) {
        lastTick = now
        opts.onProgress?.({ done, total })
      }
    }
  } finally {
    reader.releaseLock()
  }

  scanner.feed(decoder.decode(), true)
  scanner.found.sort((a, b) => a.startAt - b.startAt)
  return scanner.found
}

export async function parseHealthFile(
  file: File,
  opts: ParseOptions = {},
): Promise<ImportedWorkout[]> {
  const name = file.name.toLowerCase()

  // 直接把 export.xml 选进来：也是一边读一边扫
  if (name.endsWith('.xml')) {
    return scanStream(file.stream(), file.size, opts)
  }
  if (!name.endsWith('.zip')) {
    throw new Error('请选择 Apple 健康导出的 .zip 或 export.xml 文件')
  }

  const entries = await readCentralDirectory(file)
  const entry = entries.find((e) => e.name.toLowerCase().endsWith('export.xml'))
  if (!entry) throw new Error('压缩包里没有找到 export.xml 文件')

  const start = await dataStartOf(file, entry)
  const slice = file.slice(start, start + entry.compSize)

  // 老系统没有「边解压」的能力，只能退回整包读（大文件可能还是会卡）
  if (entry.method === 8 && typeof DecompressionStream === 'undefined') {
    const zip = await JSZip.loadAsync(file)
    const f = zip.file(entry.name)
    if (!f) throw new Error('压缩包里没有找到 export.xml 文件')
    return parseWorkouts(await f.async('string'))
  }
  if (entry.method !== 0 && entry.method !== 8) throw new Error('不支持的压缩方式')

  const stream =
    entry.method === 8
      ? slice.stream().pipeThrough(new DecompressionStream('deflate-raw'))
      : slice.stream()
  return scanStream(stream, entry.uncompSize, opts)
}
