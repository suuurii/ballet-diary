import type { Entry } from '../db'
import { startOfDay } from './time'

const FALLBACK_DURATIONS = [30, 60, 90]

/** 每天的总分钟数，key 是当天 00:00 的时间戳 */
export function sumByDay(entries: Entry[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const e of entries) {
    if (e.durationMin <= 0) continue
    const k = startOfDay(e.date)
    map.set(k, (map.get(k) || 0) + e.durationMin)
  }
  return map
}

export function entriesOnDay(entries: Entry[], day: number): Entry[] {
  return entries
    .filter((e) => startOfDay(e.date) === day)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * 常记的时长，最多 3 个；没有历史时给一组默认值。
 * 超过 4 小时的时长多半是导入时算错了，不放进快捷选项（要记还是能自己填）。
 * 只算自己手记的那几笔：导入进来的（手表、CSV）时长是事后算出来的，
 * 不代表她习惯点什么，否则一排会变成 77 分、81.1 分这种。
 */
export function frequentDurations(entries: Entry[], count = 3): number[] {
  const freq = new Map<number, number>()
  for (const e of entries) {
    if (e.source !== 'manual') continue
    if (e.durationMin < 10 || e.durationMin > 240) continue
    freq.set(e.durationMin, (freq.get(e.durationMin) || 0) + 1)
  }
  const ranked = [...freq.entries()]
    // 只出现过一次的（比如某天上了节特别长的课）不算「常用」，别把默认的三个挤掉
    .filter(([, n]) => n >= 2)
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

/** 有文字、照片或动作要点的才算「笔记」 */
export function isNote(e: Entry): boolean {
  return (
    e.note.trim().length > 0 ||
    e.images.length > 0 ||
    (e.points || []).some((p) => p.text.trim().length > 0)
  )
}
