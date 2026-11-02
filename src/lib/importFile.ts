import { startOfDay } from './time'

/**
 * 从别的 App 导出的 CSV / HTML 里读出练习记录。
 * 各家导出的列名都不一样，所以不写死格式：先找表头，
 * 认得「日期」「时长」「类型」「备注」这几列就读，认不出的行跳过。
 */

export interface ImportedRow {
  /** 当天 00:00 */
  date: number
  durationMin: number
  /** 课程类型的原标题，没对上自己的类型时留空 */
  typeName: string
  note: string
}

export interface ParsedTable {
  rows: ImportedRow[]
  /** 有表头、但日期或时长读不出来的行数 */
  skipped: number
  /** 读到的列名，用来告诉她「我是按这几列读的」 */
  columns: string[]
}

type HeaderKind = 'end' | 'start' | 'duration' | 'date' | 'type' | 'note'

// 顺序有意义：先认更具体的「结束时间 / 开始时间」，再认笼统的「时间」
const HEADER_KEYS: Array<[HeaderKind, string[]]> = [
  ['end', ['结束时间', '结束日期', '结束', 'end time', 'end date', 'ended at', 'ended', 'end', 'finish']],
  [
    'start',
    ['开始时间', '开始日期', '开始', 'start time', 'start date', 'started at', 'started', 'start', 'begin'],
  ],
  [
    'duration',
    [
      '时长',
      '训练时长',
      '练习时长',
      '课程时长',
      '总时长',
      '用时',
      '耗时',
      '分钟数',
      '分钟',
      'duration',
      'minutes',
      'minute',
      'mins',
      'min',
      'length',
      'elapsed',
      'time spent',
    ],
  ],
  [
    'date',
    ['日期', '记录日期', '训练日期', '上课日期', '练习日期', '打卡日期', 'date', 'day', '时间', 'time', 'when'],
  ],
  [
    'type',
    [
      '课程类型',
      '训练类型',
      '课程名称',
      '课程名',
      '课程',
      '课种',
      '舞种',
      '类型',
      '类别',
      '分类',
      '项目',
      '标签',
      'class type',
      'class name',
      'class',
      'type',
      'category',
      'style',
      'program',
      'tag',
    ],
  ],
  [
    'note',
    [
      '备注',
      '笔记',
      '说明',
      '心得',
      '内容',
      'note',
      'notes',
      'memo',
      'comment',
      'description',
      'remark',
      'remarks',
    ],
  ],
]

/** 列名比对前先抹平空格、大小写和标点，`时长（分钟）` 和 `时长(分钟)` 算同一个 */
function normHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[:：_\-·/、,，.。]+/g, '')
}

function normKey(s: string): string {
  return normHeader(s)
}

type HeaderMap = Partial<Record<HeaderKind, number>> & {
  /** 表头写了单位时用：`时长（h）` 里的 1.5 是 1.5 小时，要乘 60 */
  durationScale?: number
}

/**
 * 表头里的单位：「时长（h）」「Duration (hours)」「时长（小时）」都算小时。
 * 没写单位就当分钟——绝大多数 App 的默认。
 */
function headerHourScale(header: string): number {
  const s = header.toLowerCase()
  if (/小时|小時/.test(s)) return 60
  const parens = [...s.matchAll(/[（(]([^）)]*)[）)]/g)].map((m) => m[1].trim())
  if (parens.some((p) => /^(h|hr|hrs|hour|hours)$/.test(p))) return 60
  if (/\b(hours?|hrs?)\b/.test(s)) return 60
  return 1
}

/** 格子里自己带了单位（1.5h、90 分钟、01:30）就不用再看表头 */
const EXPLICIT_UNIT = /小时|小時|hours?|hrs?|h(?![a-z])|分钟|分鐘|分|minutes?|mins?|m(?![a-z])|:/

/** 在一行里找表头；认不全（至少要有日期 + 时长，或者开始 + 结束）就返回 null */
export function mapHeaderRow(cells: string[]): HeaderMap | null {
  const norm = cells.map(normHeader)
  const used = new Set<number>()
  const map: HeaderMap = {}

  for (const [kind, keys] of HEADER_KEYS) {
    let hit = -1
    // 先找完全对得上的
    for (const key of keys) {
      const k = normKey(key)
      const i = norm.findIndex((h, j) => !used.has(j) && h !== '' && h === k)
      if (i >= 0) {
        hit = i
        break
      }
    }
    // 再找包含这个词的（「本课时长」→ 时长）
    if (hit < 0) {
      for (const key of keys) {
        const k = normKey(key)
        const i = norm.findIndex((h, j) => !used.has(j) && h !== '' && h.includes(k))
        if (i >= 0) {
          hit = i
          break
        }
      }
    }
    if (hit >= 0) {
      map[kind] = hit
      if (kind === 'duration') map.durationScale = headerHourScale(cells[hit] ?? '')
      used.add(hit)
    }
  }

  const hasDate = map.date != null || map.start != null
  const hasDuration = map.duration != null || (map.start != null && map.end != null)
  return hasDate && hasDuration ? map : null
}

function cellOf(cells: string[], i: number | undefined): string {
  return i == null ? '' : (cells[i] ?? '').trim()
}

/** 时长能写成 60、60 分钟、1 小时 30 分、1h30m、01:30、00:45:00 这些样子 */
export function parseDuration(raw: string): number {
  const s = raw.trim().toLowerCase()
  if (!s) return 0

  // 1:30 / 1:30:00（冒号：时:分[:秒]）
  const clock = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/)
  if (clock) {
    const h = +clock[1]
    const m = +clock[2]
    const sec = clock[3] != null ? +clock[3] : null
    const total = sec == null ? h * 60 + m : (h * 3600 + m * 60 + sec) / 60
    return Math.round(total)
  }

  // 1h30m / 1 小时 30 分 / 90 min
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:小时|小時|hours?|hrs?|h(?![a-z]))/)
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分鐘|分|minutes?|mins?(?![a-z])|m(?![a-z]))/)
  if (h || m) return Math.round((h ? +h[1] * 60 : 0) + (m ? +m[1] : 0))

  // 只有一个数：多半是分钟
  const n = s.match(/-?\d+(?:\.\d+)?/)
  if (n) return Math.round(+n[0])
  return 0
}

const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

/**
 * 「Oct 28」这种没写年份的：按今年算；但要是算出来在明天以后，
 * 多半是去年的记录（年初导出上个月的记录），往前退一年。
 */
function dayFromMonthName(monthName: string, day: number, yearText?: string): number {
  const m = MONTH_NAMES[monthName.slice(0, 3).toLowerCase()]
  if (m == null || !(day >= 1 && day <= 31)) return 0
  const now = new Date()
  const year = yearText ? +yearText : now.getFullYear()
  let d = new Date(year, m, day)
  if (!yearText && d.getTime() > startOfDay(now.getTime()) + 86400000) {
    d = new Date(year - 1, m, day)
  }
  return startOfDay(d.getTime())
}

/** 日期能写成 2024-05-01、2024/5/1、2024年5月1日、05/01/2024、Oct 28 09:48、时间戳…… */
export function parseDateCell(raw: string): number {
  const s = raw.trim()
  if (!s) return 0

  if (/^\d{10}$/.test(s)) return startOfDay(+s * 1000)
  if (/^\d{13}$/.test(s)) return startOfDay(+s)
  if (/^\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(s)) {
    return startOfDay(new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)).getTime())
  }

  // 2024-05-01 / 2024/5/1 / 2024.5.1 / 2024年5月1日
  let m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/)
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3])
    if (!Number.isNaN(d.getTime())) return startOfDay(d.getTime())
  }

  // 05/01/2024：前一个数超过 12 就当「日/月/年」，否则按「月/日/年」
  m = s.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const y = +m[3]
    const d = a > 12 && b <= 12 ? new Date(y, b - 1, a) : new Date(y, a - 1, b)
    if (!Number.isNaN(d.getTime())) return startOfDay(d.getTime())
  }

  // 5月1日（没写年份，按今年算）
  m = s.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (m) {
    const y = new Date().getFullYear()
    return startOfDay(new Date(y, +m[1] - 1, +m[2]).getTime())
  }

  // Oct 28 09:48 / Oct 28, 2026 / October 28th（英文月份，年份可省）
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/)
  if (m) {
    const v = dayFromMonthName(m[1], +m[2], m[3])
    if (v) return v
  }

  // 28 Oct 2026 / 28 Oct（日在前）
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?/)
  if (m) {
    const v = dayFromMonthName(m[2], +m[1], m[3])
    if (v) return v
  }

  const t = Date.parse(s.replace(/\//g, '-'))
  if (!Number.isNaN(t)) return startOfDay(t)
  return 0
}

function toRow(cells: string[], map: HeaderMap): ImportedRow | null {
  const dateText = cellOf(cells, map.date ?? map.start)
  const date = parseDateCell(dateText)
  if (!date) return null

  const durText = cellOf(cells, map.duration)
  let durationMin = parseDuration(durText)
  // 表头说「小时」、格子里又只有数字（1.5）——那就是 1.5 小时，别按 1.5 分钟算
  if (map.durationScale === 60 && durText && !EXPLICIT_UNIT.test(durText.toLowerCase())) {
    const n = durText.match(/\d+(?:\.\d+)?/)
    if (n) durationMin = +n[0] * 60
  }
  if (durationMin <= 0 && map.start != null && map.end != null) {
    const s = Date.parse(cellOf(cells, map.start).replace(/\//g, '-'))
    const e = Date.parse(cellOf(cells, map.end).replace(/\//g, '-'))
    if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) durationMin = Math.round((e - s) / 60000)
  }
  if (!(durationMin > 0)) return null
  durationMin = Math.round(durationMin * 10) / 10

  const typeName = cellOf(cells, map.type).replace(/[·•|｜]+$/g, '').trim()
  return { date, durationMin, typeName, note: cellOf(cells, map.note) }
}

/** 从一张「表格」（CSV 行，或 HTML 里的表格）里认表头、读记录 */
export function tableToRows(matrix: string[][]): ParsedTable | null {
  // 表头不一定在第一行，往上找找
  for (let h = 0; h < Math.min(matrix.length, 15); h++) {
    const map = mapHeaderRow(matrix[h])
    if (!map) continue
    const columns = HEADER_KEYS.map(([kind]) => [kind, map[kind]] as const)
      .filter(([, i]) => i != null)
      .map(([kind, i]) => `${kind}:${matrix[h][i!] ?? ''}`)
    const rows: ImportedRow[] = []
    let skipped = 0
    for (let i = h + 1; i < matrix.length; i++) {
      const row = matrix[i]
      if (!row || row.every((c) => !c.trim())) continue
      const parsed = toRow(row, map)
      if (parsed) rows.push(parsed)
      else skipped++
    }
    rows.sort((a, b) => a.date - b.date)
    return { rows, skipped, columns }
  }
  return null
}

function detectDelimiter(text: string): string {
  const head = text.slice(0, 4000)
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (let i = 0; i < head.length; i++) {
    const ch = head[i]
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch in counts) counts[ch]++
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ','
}

/** CSV：支持引号里的逗号、换行和两个引号转义 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const delim = detectDelimiter(clean)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function htmlTableMatrixes(text: string): string[][][] {
  if (typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const out: string[][][] = []
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows: string[][] = []
    for (const tr of Array.from((table as HTMLTableElement).rows)) {
      const cells = Array.from(tr.cells).map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim())
      if (cells.length > 0) rows.push(cells)
    }
    if (rows.length > 1) out.push(rows)
  }
  return out
}

/**
 * 读一份 CSV 或 HTML。
 * HTML 只认表格：多数 App 的 HTML 导出就是一张表；不是表的话让她改导 CSV。
 */
export function parseImportFile(text: string, fileName = ''): ParsedTable {
  const lower = fileName.toLowerCase()
  const looksHtml =
    lower.endsWith('.html') ||
    lower.endsWith('.htm') ||
    /<table[\s>]/i.test(text.slice(0, 20000)) ||
    /<html[\s>]/i.test(text.slice(0, 2000))

  if (looksHtml) {
    const tables = htmlTableMatrixes(text)
    let best: ParsedTable | null = null
    for (const matrix of tables) {
      const parsed = tableToRows(matrix)
      if (!parsed) continue
      if (!best || parsed.rows.length > best.rows.length) best = parsed
    }
    if (best) return best
    throw new Error('no-table')
  }

  const parsed = tableToRows(parseCsv(text))
  if (!parsed) throw new Error('no-header')
  return parsed
}
