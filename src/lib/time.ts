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

/** "10月28日" */
export function formatDateCN(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function weekdayCN(ts: number): string {
  return WEEK_CN[new Date(ts).getDay()]
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
  return MONTH_CN[month] ?? `${month + 1}月`
}

/** 90 → "1 小时 30 分"；0 → "" */
export function formatDuration(min: number): string {
  const m = Math.round(min)
  if (m <= 0) return ''
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h} 小时 ${rem} 分` : `${h} 小时`
}

/** 90 → "1.5 小时"，用于日历上方的汇总 */
export function formatHours(min: number): string {
  if (min <= 0) return '0 小时'
  const h = min / 60
  const rounded = Math.round(h * 10) / 10
  return Number.isInteger(rounded) ? `${rounded} 小时` : `${rounded.toFixed(1)} 小时`
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
