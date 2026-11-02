import { db } from '../db'

/**
 * 「记一笔」里那几个常用时长，她自己排过、增删过就照她的来。
 * 没动过就不存东西，每次照历史使用次数自动算。
 */

const PRESET_KEY = 'durationPresets'

function clean(list: unknown): number[] | null {
  if (!Array.isArray(list)) return null
  const out: number[] = []
  for (const v of list) {
    const n = Math.round(Number(v))
    if (Number.isFinite(n) && n > 0 && n <= 24 * 60 && !out.includes(n)) out.push(n)
  }
  return out
}

/** 她排过的名单；没排过（或删光了）就是 null，调用方回落到「按常用算」 */
export async function loadDurationPresets(): Promise<number[] | null> {
  try {
    const row = await db.settings.get(PRESET_KEY)
    if (!row) return null
    const list = clean(typeof row.value === 'string' ? JSON.parse(row.value) : row.value)
    return list && list.length > 0 ? list : null
  } catch {
    return null
  }
}

export async function saveDurationPresets(list: number[]): Promise<void> {
  const cleanList = clean(list) ?? []
  await db.settings.put({ key: PRESET_KEY, value: JSON.stringify(cleanList) })
}

/** 「按常用排序」：把名单删掉，回到按历史使用次数自动排 */
export async function clearDurationPresets(): Promise<void> {
  await db.settings.delete(PRESET_KEY)
}
