import { getLang } from './i18n'

export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

export function toYMD(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function toYM(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "10-28" */
export function formatDateShort(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "10月28日" / "October 28" */
export function formatDateCN(ts: number): string {
  const d = new Date(ts)
  if (getLang() === 'en') return `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekdayCN(ts: number): string {
  return (getLang() === 'en' ? WEEK_EN : WEEK_CN)[new Date(ts).getDay()]
}

const MONTH_CN = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
]

export function monthCN(month: number): string {
  if (getLang() === 'en') return MONTHS_EN[month] ?? ''
  return MONTH_CN[month] ?? `${month + 1}月`
}

/** 90 → "1 小时 30 分"；0 → "" */
export function formatDuration(min: number): string {
  const m = Math.round(min)
  if (m <= 0) return ''
  if (getLang() === 'en') {
    if (m < 60) return `${m} min`
    const hh = Math.floor(m / 60)
    const rr = m % 60
    return rr > 0 ? `${hh}h ${rr}m` : `${hh}h`
  }
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h} 小时 ${rem} 分` : `${h} 小时`
}

/** 90 → "1.5"，只要数字，单位交给调用处排版 */
export function hoursValue(min: number): string {
  const h = Math.round((min / 60) * 10) / 10
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}

/** 90 → "1.5h"，连单位一起写，日历格子这种没地方再加「小时」的地方用 */
export function hoursShort(min: number): string {
  return `${hoursValue(min)}h`
}

/** 90 → "1.5 小时"，用于日历上方的汇总 */
export function formatHours(min: number): string {
  const en = getLang() === 'en'
  if (min <= 0) return en ? '0 h' : '0 小时'
  const h = min / 60
  const rounded = Math.round(h * 10) / 10
  const n = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  return en ? `${n} h` : `${n} 小时`
}

export function dateInputValue(ts: number): string {
  return toYMD(ts)
}

export function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0).getTime()
}

/** 2026 年 10 月的天数与起始星期（周一=0） */
export function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= days; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function dayKey(year: number, month: number, day: number): number {
  return new Date(year, month, day, 0, 0, 0, 0).getTime()
}
