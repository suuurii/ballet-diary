import { db, type Entry } from '../db'
import { DEFAULT_CATEGORIES, LEGACY_COLORS } from './categories'
import { startOfDay } from './time'

const FLAG = 'ballet_schema_v3'

/**
 * 把旧版本（打卡记录 + 独立笔记）合并成新的 entries 表。
 * 只执行一次；之后新建的数据不会被重复搬运。
 */
export async function migrateLegacy(): Promise<void> {
  if (localStorage.getItem(FLAG) === '1') return
  try {
    const cats = await db.categories.toArray()
    for (const c of cats) {
      if (!LEGACY_COLORS.includes(c.color)) continue
      const def = DEFAULT_CATEGORIES.find((d) => d.name === c.name)
      if (def) await db.categories.update(c.id!, { color: def.color })
    }

    if ((await db.entries.count()) === 0) {
      const rows: Entry[] = []

      for (const r of await db.practiceRecords.toArray()) {
        rows.push({
          date: startOfDay(r.startAt),
          durationMin: r.durationMin,
          categoryId: r.categoryId,
          movementIds: [],
          note: r.note || '',
          images: [],
          source: r.source === 'watch' ? 'watch' : 'manual',
          createdAt: r.createdAt || r.startAt,
        })
      }

      for (const n of await db.notes.toArray()) {
        rows.push({
          date: startOfDay(n.createdAt),
          durationMin: 0,
          categoryId: null,
          movementIds: n.movementId ? [n.movementId] : [],
          note: n.content || '',
          images: n.images || [],
          source: 'manual',
          createdAt: n.createdAt,
        })
      }

      if (rows.length) await db.entries.bulkAdd(rows)
    }

    localStorage.setItem(FLAG, '1')
  } catch (err) {
    console.warn('旧数据迁移失败，已跳过', err)
  }
}
