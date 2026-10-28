import { db } from '../db'

export const CATEGORY_COLORS = [
  '#c2185b',
  '#e91e63',
  '#9c27b0',
  '#3f51b5',
  '#009688',
  '#ff7043',
  '#8d6e63',
  '#f9a825',
  '#5c6bc0',
  '#26a69a',
  '#ef5350',
  '#ab47bc',
]

export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: '零基础', color: '#c2185b' },
  { name: '初级', color: '#e91e63' },
  { name: '中级', color: '#9c27b0' },
  { name: '技巧', color: '#3f51b5' },
  { name: '软开', color: '#009688' },
  { name: '舞姿', color: '#ff7043' },
  { name: '基础素质', color: '#8d6e63' },
]

let seedPromise: Promise<void> | null = null

// 用记忆化的 Promise 去重，避免 App 与多个页面同时触发导致重复写入预置分类
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
