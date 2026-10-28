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

export function startOfWeek(ts: number): number {
  const d = new Date(ts)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function formatDuration(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h} 小时 ${rem} 分` : `${h} 小时`
}

export function formatClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

export function formatDateShort(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function formatTimeShort(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatDateCN(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
