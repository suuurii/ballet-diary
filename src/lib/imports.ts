import { db, type Entry } from '../db'
import type { Weights } from './splitRatio'

/**
 * 导进来的记录（手表、别的 App）和「按比例分类」都在这。
 * 导入的每批都记下 id，所以她可以撤回上一批，也能一次清空。
 */

const WEIGHTS_KEY = 'watchSplitWeights'
const HOURS_KEY = 'watchSplitHours'
const MODE_KEY = 'watchSplitMode'
const BATCH_KEY = 'importBatches'
const MAX_BATCHES = 8

export type ImportKind = 'watch' | 'file'

interface ImportBatch {
  kind: ImportKind
  at: number
  ids: number[]
}

export type { SplitPlan, Weights } from './splitRatio'

/* ---------- 按比例的份数 ---------- */

/** 记下上次用的份数，下次打开不用重填 */
export async function loadWeights(): Promise<Weights> {
  const row = await db.settings.get(WEIGHTS_KEY)
  if (!row || typeof row.value !== 'string') return {}
  try {
    const parsed = JSON.parse(row.value) as Record<string, number>
    const out: Weights = {}
    for (const [k, v] of Object.entries(parsed)) {
      const id = Number(k)
      if (Number.isFinite(id) && Number.isFinite(v) && v > 0) out[id] = Math.round(v)
    }
    return out
  } catch {
    return {}
  }
}

export async function saveWeights(weights: Weights): Promise<void> {
  await db.settings.put({ key: WEIGHTS_KEY, value: JSON.stringify(weights) })
}

/* ---------- 按小时：每类大概多少小时 ---------- */

export type SplitMode = 'parts' | 'hours'

/** 上次填的每类小时数；键是分类 id */
export async function loadSplitHours(): Promise<Record<number, number>> {
  const row = await db.settings.get(HOURS_KEY)
  if (!row || typeof row.value !== 'string') return {}
  try {
    const parsed = JSON.parse(row.value) as Record<string, number>
    const out: Record<number, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const id = Number(k)
      if (Number.isFinite(id) && Number.isFinite(v) && v > 0) out[id] = v
    }
    return out
  } catch {
    return {}
  }
}

export async function saveSplitHours(hours: Record<number, number>): Promise<void> {
  // 只存填了数的，清空的就真的清掉
  const clean: Record<number, number> = {}
  for (const [k, v] of Object.entries(hours)) {
    if (Number.isFinite(v) && v > 0) clean[Number(k)] = Math.round(v * 10) / 10
  }
  await db.settings.put({ key: HOURS_KEY, value: JSON.stringify(clean) })
}

/** 上次用的是哪种问法：填份数，还是填小时 */
export async function loadSplitMode(): Promise<SplitMode> {
  const row = await db.settings.get(MODE_KEY)
  return row?.value === 'hours' ? 'hours' : 'parts'
}

export async function saveSplitMode(mode: SplitMode): Promise<void> {
  await db.settings.put({ key: MODE_KEY, value: mode })
}

/* ---------- 导入的记录 ---------- */

/** 所有不是手动记的记录：手表导的 + 文件导的 */
async function importedEntries(): Promise<Entry[]> {
  return db.entries.where('source').anyOf('watch', 'file').toArray()
}

/** 还没分类的导入记录，按日子排好 */
export async function uncategorizedImported(): Promise<Entry[]> {
  return (await importedEntries())
    .filter((e) => e.categoryId == null)
    .sort((a, b) => a.date - b.date || a.createdAt - b.createdAt)
}

export interface ImportSummary {
  watch: number
  file: number
  total: number
  uncategorized: number
  classified: number
}

export async function importSummary(): Promise<ImportSummary> {
  const watch = await db.entries.where('source').equals('watch').count()
  const file = await db.entries.where('source').equals('file').count()
  const uncategorized = (await importedEntries()).filter((e) => e.categoryId == null).length
  return {
    watch,
    file,
    total: watch + file,
    uncategorized,
    classified: watch + file - uncategorized,
  }
}

async function loadBatches(): Promise<ImportBatch[]> {
  const row = await db.settings.get(BATCH_KEY)
  if (!row || typeof row.value !== 'string') return []
  try {
    const list = JSON.parse(row.value) as ImportBatch[]
    return Array.isArray(list) ? list.filter((b) => Array.isArray(b?.ids)) : []
  } catch {
    return []
  }
}

async function saveBatches(list: ImportBatch[]): Promise<void> {
  await db.settings.put({ key: BATCH_KEY, value: JSON.stringify(list) })
}

/** 刚导完，把这一批的 id 记下来，方便撤回 */
export async function recordBatch(kind: ImportKind, ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const list = await loadBatches()
  list.push({ kind, at: Date.now(), ids })
  while (list.length > MAX_BATCHES) list.shift()
  await saveBatches(list)
}

/** 上一批导了多少条；没有导入过就是 0 */
export async function lastBatchSize(): Promise<number> {
  const list = await loadBatches()
  return list.length > 0 ? list[list.length - 1].ids.length : 0
}

/** 撤回上一批：只删那一批，之前导的、手动记的都不动 */
export async function undoLastImport(): Promise<number> {
  const list = await loadBatches()
  const last = list.pop()
  if (!last) return 0
  const ids = last.ids
  const existing = await db.entries.where('id').anyOf(ids).count()
  await db.entries.bulkDelete(ids)
  await saveBatches(list)
  return existing
}

/** 清空导入的记录：给了 kind 就只清那一种；手动记的永远不碰 */
export async function clearImported(kind?: ImportKind): Promise<number> {
  const kinds: ImportKind[] = kind ? [kind] : ['watch', 'file']
  const n = await db.entries.where('source').anyOf(kinds).count()
  await db.entries.where('source').anyOf(kinds).delete()
  // 撤回用的批次也跟着走，只留另一种来源的
  const left = kind ? (await loadBatches()).filter((b) => b.kind !== kind) : []
  if (left.length > 0) await saveBatches(left)
  else await db.settings.delete(BATCH_KEY)
  return n
}

/** 把导入记录的类型全清掉，好重新按比例分一次 */
export async function clearImportedCategories(): Promise<number> {
  const n = (await importedEntries()).filter((e) => e.categoryId != null).length
  await db.entries
    .where('source')
    .anyOf('watch', 'file')
    .modify({ categoryId: null })
  return n
}

export { assignHours, assignSequence, quotasFor } from './splitRatio'

/** 把排好的顺序写回记录（只动传进来的这些，别人的分类不碰） */
export async function applySplit(entries: Entry[], seq: number[]): Promise<number> {
  const rows: Entry[] = []
  entries.forEach((e, i) => {
    const categoryId = seq[i]
    if (categoryId == null) return
    rows.push({ ...e, categoryId })
  })
  if (rows.length === 0) return 0
  await db.entries.bulkPut(rows)
  return rows.length
}
