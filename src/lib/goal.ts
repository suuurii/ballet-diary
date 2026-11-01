import { db, type Entry } from '../db'

/** 今年的练习目标，单位「小时」；没设过就是 null */
export const YEAR_GOAL_KEY = 'yearGoalHours'
/** 达成后送给自己的礼物（一句话）；没写就没有 */
export const YEAR_GIFT_KEY = 'yearGift'
/** 礼物已经收下的时间 */
export const YEAR_GIFT_CLAIMED_KEY = 'yearGiftClaimedAt'

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

export interface YearGift {
  text: string
  claimedAt: number | null
}

export async function getYearGift(): Promise<YearGift> {
  const [t, c] = await Promise.all([
    db.settings.get(YEAR_GIFT_KEY),
    db.settings.get(YEAR_GIFT_CLAIMED_KEY),
  ])
  const at = Number(c?.value)
  return {
    text: typeof t?.value === 'string' ? t.value : '',
    claimedAt: Number.isFinite(at) && at > 0 ? at : null,
  }
}

export async function setYearGift(text: string): Promise<void> {
  const t = text.trim()
  if (!t) {
    await db.settings.delete(YEAR_GIFT_KEY)
    return
  }
  await db.settings.put({ key: YEAR_GIFT_KEY, value: t })
}

/** 收下礼物：记下时间；改了目标也不收回 */
export async function claimYearGift(): Promise<void> {
  await db.settings.put({ key: YEAR_GIFT_CLAIMED_KEY, value: Date.now() })
}

/** 今年累计时长第一次越过目标的那一天；还没到就是 null */
export function goalReachedDay(
  entries: Entry[],
  year: number,
  goalHours: number | null,
): number | null {
  if (!goalHours || goalHours <= 0) return null
  const from = new Date(year, 0, 1).getTime()
  const to = new Date(year + 1, 0, 1).getTime()
  const need = goalHours * 60
  const days = entries
    .filter((e) => e.date >= from && e.date < to && e.durationMin > 0)
    .sort((a, b) => a.date - b.date || a.createdAt - b.createdAt)
  let sum = 0
  for (const e of days) {
    sum += e.durationMin
    if (sum >= need) return e.date
  }
  return null
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
