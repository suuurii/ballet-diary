import { db } from '../db'

/** 颜色都压低饱和度，避免在米白页面上跳出来 */
export const CATEGORY_COLORS = [
  '#c98d98',
  '#b7768a',
  '#8f6d8a',
  '#6f7b93',
  '#7f9a90',
  '#c08a6f',
  '#9a8a7a',
  '#a8505f',
  '#7d8a6f',
  '#8a7a99',
  '#b08b6a',
  '#6f8a95',
]

export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: '零基础', color: '#c98d98' },
  { name: '初级', color: '#b7768a' },
  { name: '中级', color: '#8f6d8a' },
  { name: '技巧', color: '#6f7b93' },
  { name: '软开', color: '#7f9a90' },
  { name: '舞姿', color: '#c08a6f' },
  { name: '基础素质', color: '#9a8a7a' },
]

/** 旧版本的预置配色，迁移时只替换这些值，不动用户自己改过的颜色 */
export const LEGACY_COLORS = ['#c2185b', '#e91e63', '#9c27b0', '#3f51b5', '#009688', '#ff7043', '#8d6e63']

let seedPromise: Promise<void> | null = null

// 用记忆化的 Promise 去重，避免多个页面同时触发导致重复写入预置分类
export function ensureSeedCategories(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const count = await db.categories.count()
      if (count === 0) {
        const rows = DEFAULT_CATEGORIES.map((c, i) => ({ name: c.name, color: c.color, order: i }))
        await db.categories.bulkAdd(rows)
      }
    })()
  }
  return seedPromise
}
