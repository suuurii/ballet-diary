import { db, type Spend } from '../db'
import { getLang, t } from './i18n'

/** ¥1,280 —— 钱一律四舍五入到整元 */
export function money(n: number): string {
  return `¥${Math.round(n).toLocaleString('zh-CN')}`
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 哪天花的，写「10 月 12 日」/ "Oct 12" */
export function spendDay(ts: number): string {
  const d = new Date(ts)
  if (getLang() === 'en') return `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export interface SpendCat {
  name: string
  amount: number
}

/** 合计 + 按分类分开的小计，多的排前面 */
export function spendTotals(spends: Spend[]): { total: number; byCat: SpendCat[] } {
  const map = new Map<string, number>()
  let total = 0
  for (const s of spends) {
    if (!(s.amount > 0)) continue
    total += s.amount
    const name = s.category || t('其他', 'Other')
    map.set(name, (map.get(name) || 0) + s.amount)
  }
  const byCat = [...map]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
  return { total, byCat }
}

/** 她记过的分类，按第一次出现的先后排 */
function usedNames(spends: Spend[]): string[] {
  const used: string[] = []
  for (const s of spends) {
    if (s.category && !used.includes(s.category)) used.push(s.category)
  }
  return used
}

/**
 * 花费分类的名单：存一份在设置里，跟课程类型一样随时能加、能删。
 * 不预置任何分类——第一次用时名单是空的，只有那个＋。
 * 老版本没有这份名单，就先用已经记过的花费认回来。
 */
const CATS_KEY = 'spendCats'

export async function loadSpendCats(spends: Spend[]): Promise<string[]> {
  const row = await db.settings.get(CATS_KEY)
  if (row && typeof row.value === 'string') {
    try {
      const arr = JSON.parse(row.value)
      if (Array.isArray(arr)) {
        return arr.filter((x): x is string => typeof x === 'string' && x.length > 0)
      }
    } catch {
      // 存坏了就当没存过，从花费里重新认
    }
  }
  const seeded = usedNames(spends)
  await saveSpendCats(seeded)
  return seeded
}

export async function saveSpendCats(names: string[]): Promise<void> {
  await db.settings.put({ key: CATS_KEY, value: JSON.stringify(names) })
}
