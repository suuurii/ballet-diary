import JSZip from 'jszip'
import type { RecordSource } from '../db'

export interface ImportedWorkout {
  startAt: number
  endAt: number
  durationMin: number
  source: RecordSource
  note: string
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

// 从 export.xml 文本中提取所有 Barre 训练（只匹配 Workout 开始标签，避免整文件 DOM 解析）
export function parseWorkouts(xml: string): ImportedWorkout[] {
  const out: ImportedWorkout[] = []
  const re = /<Workout\b[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0]
    const type = attr(tag, 'workoutActivityType') || ''
    if (!type.toLowerCase().includes('barre')) continue
    const startAt = parseAppleDate(attr(tag, 'startDate') || '')
    const endAt = parseAppleDate(attr(tag, 'endDate') || '')
    if (!startAt || !endAt || endAt <= startAt) continue
    const durationMin = Math.round(((endAt - startAt) / 60000) * 10) / 10
    out.push({ startAt, endAt, durationMin, source: 'watch', note: '' })
  }
  out.sort((a, b) => a.startAt - b.startAt)
  return out
}

// 接受 zip 或单个 xml 文件
export async function parseHealthFile(file: File): Promise<ImportedWorkout[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xml')) {
    const xml = await file.text()
    return parseWorkouts(xml)
  }
  if (name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file)
    const entry = Object.values(zip.files).find(
      (e) => !e.dir && e.name.toLowerCase().endsWith('export.xml'),
    )
    if (!entry) throw new Error('压缩包里没有找到 export.xml 文件')
    const xml = await entry.async('string')
    return parseWorkouts(xml)
  }
  throw new Error('请选择 Apple 健康导出的 .zip 或 export.xml 文件')
}
