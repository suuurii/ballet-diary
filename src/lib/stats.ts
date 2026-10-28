import type { PracticeRecord, Category } from '../db'
import { toYMD, toYM, startOfWeek } from './time'

export interface CategoryTotal {
  categoryId: number | null
  name: string
  color: string
  minutes: number
}

export function sumMinutes(records: PracticeRecord[]): number {
  return records.reduce((s, r) => s + r.durationMin, 0)
}

export function byDay(records: PracticeRecord[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of records) {
    const k = toYMD(r.startAt)
    m.set(k, (m.get(k) || 0) + r.durationMin)
  }
  return m
}

export function byMonth(records: PracticeRecord[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of records) {
    const k = toYM(r.startAt)
    m.set(k, (m.get(k) || 0) + r.durationMin)
  }
  return m
}

export function byMonthByCategory(
  records: PracticeRecord[],
): Map<string, Map<number | null, number>> {
  const m = new Map<string, Map<number | null, number>>()
  for (const r of records) {
    const k = toYM(r.startAt)
    if (!m.has(k)) m.set(k, new Map())
    const inner = m.get(k)!
    inner.set(r.categoryId, (inner.get(r.categoryId) || 0) + r.durationMin)
  }
  return m
}

export function byWeek(records: PracticeRecord[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of records) {
    const k = toYMD(startOfWeek(r.startAt))
    m.set(k, (m.get(k) || 0) + r.durationMin)
  }
  return m
}

export function categoryTotals(
  records: PracticeRecord[],
  categories: Category[],
): CategoryTotal[] {
  const map = new Map<number | null, number>()
  for (const r of records) {
    map.set(r.categoryId, (map.get(r.categoryId) || 0) + r.durationMin)
  }
  const list: CategoryTotal[] = []
  for (const [id, minutes] of map) {
    const c = categories.find((c) => c.id === id)
    list.push({
      categoryId: id,
      name: c ? c.name : '未分类',
      color: c ? c.color : '#bdbdbd',
      minutes,
    })
  }
  list.sort((a, b) => b.minutes - a.minutes)
  return list
}
