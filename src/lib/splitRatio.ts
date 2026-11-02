/**
 * 「按大致比例摊开」的算法本体，不碰数据库，纯算数。
 * 两件事：每一类分几条、按什么顺序落下去。
 */

export type Weights = Record<number, number>

export interface SplitPlan {
  categoryId: number
  count: number
}

/** 每类分几条：按份数摊，除不尽的零头给「最该多一条」的那几个，加起来正好是总数 */
export function quotasFor(total: number, weights: Weights): SplitPlan[] {
  const ids = Object.keys(weights)
    .map(Number)
    .filter((id) => weights[id] > 0)
  const sum = ids.reduce((s, id) => s + weights[id], 0)
  if (ids.length === 0 || sum === 0 || total <= 0) return []

  const rows = ids
    .map((id) => {
      const exact = (total * weights[id]) / sum
      return { id, count: Math.floor(exact), frac: exact - Math.floor(exact) }
    })
    .sort((a, b) => b.frac - a.frac || b.count - a.count)

  let left = total - rows.reduce((s, r) => s + r.count, 0)
  for (let i = 0; left > 0; i++, left--) rows[i % rows.length].count++

  return ids.map((id) => ({ categoryId: id, count: rows.find((r) => r.id === id)!.count }))
}

/**
 * 排出一个顺序：每走一步，挑「按比例现在最该轮到它」的那类。
 * 这样不会出现「前三个月全是初级」，每一段日期看过去都大致符合比例。
 */
export function assignSequence(total: number, plan: SplitPlan[]): number[] {
  const targets = plan.filter((p) => p.count > 0)
  if (targets.length === 0) return []

  const left = new Map(targets.map((p) => [p.categoryId, p.count]))
  const used = new Map<number, number>()
  const seq: number[] = []

  for (let step = 0; step < total; step++) {
    let best = -1
    let bestScore = -Infinity
    for (const p of targets) {
      if ((left.get(p.categoryId) ?? 0) <= 0) continue
      // 到这一步为止「按比例应该已经分了几条」
      const want = (p.count * (step + 1)) / total
      const score = want - (used.get(p.categoryId) ?? 0)
      if (score > bestScore) {
        bestScore = score
        best = p.categoryId
      }
    }
    if (best < 0) break
    seq.push(best)
    used.set(best, (used.get(best) ?? 0) + 1)
    left.set(best, (left.get(best) ?? 0) - 1)
  }
  return seq
}

/**
 * 另一种问法：不填份数，直接填「每类大概多少小时」。
 * 一条一条往下走，每步都挑「按分钟算，此刻最缺的那一类」，
 * 所以既能凑到她给的大致小时数，也不会前半年全是同一类。
 *
 * @param durations 待分配的记录，每条多少分钟（和记录一一对应）
 * @param targets   每类想要多少分钟；和实际总量不一样也没关系，会按比例缩放
 * @returns         和 durations 等长的分类 id 列表
 */
export function assignHours(durations: number[], targets: Weights): number[] {
  const ids = Object.keys(targets)
    .map(Number)
    .filter((id) => targets[id] > 0)
  const sum = ids.reduce((s, id) => s + targets[id], 0)
  if (ids.length === 0 || sum <= 0) return []

  const used = new Map<number, number>(ids.map((id) => [id, 0]))
  const out: number[] = []
  let elapsed = 0

  for (const d of durations) {
    let best = ids[0]
    let bestScore = -Infinity
    for (const id of ids) {
      // 走到现在，这类「按理该分到多少分钟」
      const want = (targets[id] * elapsed) / sum
      const score = want - (used.get(id) ?? 0)
      // 打平时让目标大的那类先来，第一分钟才不会随机落到某一类
      if (
        score > bestScore + 1e-9 ||
        (Math.abs(score - bestScore) <= 1e-9 && targets[id] > targets[best])
      ) {
        bestScore = score
        best = id
      }
    }
    out.push(best)
    used.set(best, (used.get(best) ?? 0) + d)
    elapsed += d
  }
  return out
}
