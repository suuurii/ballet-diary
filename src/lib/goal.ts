import { db, type Entry } from '../db'

/** 今年的练习目标，单位「小时」；没设过就是 null */
export const YEAR_GOAL_KEY = 'yearGoalHours'

export async function getYearGoal(): Promise<number | null> {
  const row = await db.settings.get(YEAR_GOAL_KEY)
  const n = Number(row?.value)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function setYearGoal(hours: number | null): Promise<void> {
  if (!hours || hours <= 0) {
    await db.settings.delete(YEAR_GOAL_KEY)
    return
  }
  await db.settings.put({ key: YEAR_GOAL_KEY, value: hours })
}

/** 某一年练了多少分钟、练了几次（只算记了时长的记录） */
export function yearStats(entries: Entry[], year: number) {
  const from = new Date(year, 0, 1).getTime()
  const to = new Date(year + 1, 0, 1).getTime()
  let minutes = 0
  let sessions = 0
  for (const e of entries) {
    if (e.date < from || e.date >= to || e.durationMin <= 0) continue
    minutes += e.durationMin
    sessions += 1
  }
  return { minutes, sessions }
}

/** 全部时间的合计：总分钟、总次数、第一次练习是哪天 */
export function allTimeStats(entries: Entry[]) {
  let minutes = 0
  let sessions = 0
  let firstDate: number | null = null
  for (const e of entries) {
    if (e.durationMin <= 0) continue
    minutes += e.durationMin
    sessions += 1
    if (firstDate === null || e.date < firstDate) firstDate = e.date
  }
  return { minutes, sessions, firstDate }
}

/** 68.5 这种写法：不满 100 留一位小数，超过就取整 */
export function hoursText(minutes: number): string {
  const h = minutes / 60
  if (h >= 100) return String(Math.round(h))
  return String(Math.round(h * 10) / 10)
}
