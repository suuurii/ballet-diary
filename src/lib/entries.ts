import type { Entry, Movement } from '../db'

const FALLBACK_DURATIONS = [45, 60, 90, 120]

/** 每天的总分钟数，key 是当天 00:00 的时间戳 */
export function sumByDay(entries: Entry[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const e of entries) {
    if (e.durationMin <= 0) continue
    map.set(e.date, (map.get(e.date) || 0) + e.durationMin)
  }
  return map
}

export function entriesOnDay(entries: Entry[], day: number): Entry[] {
  return entries
    .filter((e) => e.date === day)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/** 常记的时长，最多 4 个；没有历史时给一组默认值 */
export function frequentDurations(entries: Entry[], count = 4): number[] {
  const freq = new Map<number, number>()
  for (const e of entries) {
    if (e.durationMin < 10) continue
    freq.set(e.durationMin, (freq.get(e.durationMin) || 0) + 1)
  }
  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([m]) => m)
    .slice(0, count)
  const out = [...ranked]
  for (const d of FALLBACK_DURATIONS) {
    if (out.length >= count) break
    if (!out.includes(d)) out.push(d)
  }
  return out.sort((a, b) => a - b)
}

/** 最近用过的动作，用于快捷选择 */
export function recentMovements(entries: Entry[], movements: Movement[], count = 12): Movement[] {
  const seen = new Set<number>()
  const ordered: Movement[] = []
  const byId = new Map(movements.map((m) => [m.id!, m]))
  const sorted = [...entries].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt)
  for (const e of sorted) {
    for (const id of e.movementIds || []) {
      if (seen.has(id)) continue
      const m = byId.get(id)
      if (!m) continue
      seen.add(id)
      ordered.push(m)
      if (ordered.length >= count) return ordered
    }
  }
  return ordered
}

/** 有文字或照片的才算「笔记」 */
export function isNote(e: Entry): boolean {
  return e.note.trim().length > 0 || e.images.length > 0
}
