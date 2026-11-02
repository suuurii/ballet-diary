import { db } from '../db'

/**
 * 莫兰迪色系：饱和度都压得很低，像蒙了一层灰。
 * 一整条都在粉色系里走——从浅藕粉到深酒红，不再落到墨黑，
 * 所以类型多的时候环图也是一片粉，不会突然蹦出一截黑的。
 * 后面几个是给自建类型备的灰粉、灰紫。
 */
export const CATEGORY_COLORS = [
  '#d8b3ba',
  '#c79aa2',
  '#b68290',
  '#a56a7a',
  '#925465',
  '#7d4353',
  '#693647',
  '#b394a0',
  '#a08892',
  '#c4a49b',
  '#8a6f7c',
  '#bb8f96',
]

export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: '零基础', color: '#d8b3ba' },
  { name: '初级', color: '#c79aa2' },
  { name: '中级', color: '#b68290' },
  { name: '技巧', color: '#a56a7a' },
  { name: '软开', color: '#925465' },
  { name: '舞姿', color: '#7d4353' },
  { name: '基础素质', color: '#693647' },
]

/** 旧版本的预置配色，迁移时只替换这些值，不动用户自己改过的颜色 */
export const LEGACY_COLORS = [
  '#c2185b',
  '#e91e63',
  '#9c27b0',
  '#3f51b5',
  '#009688',
  '#ff7043',
  '#8d6e63',
  // 上一版压低饱和度的预置色
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
  // 上一版：从灰粉到墨黑的一条坡道（没有引线之后，相邻两段太像了）
  '#d2aeb4',
  '#bb8f99',
  '#a1737f',
  '#865f6b',
  '#6a4e58',
  '#4a3a41',
  '#2b2327',
  '#8a8a99',
  '#78867f',
  '#8b8172',
  '#a68b6f',
  '#6f7f88',
  // 上一版：偏暗的莫兰迪七色（现在调亮了一档）
  '#cf9fa6',
  '#9d5a67',
  '#71848c',
  '#3a3034',
  '#8d9a80',
  '#b3946f',
  '#6d5f74',
  '#c2b7ae',
  '#4d6b6e',
  '#6b7fa0',
  '#a06a76',
  '#6f7a5f',
  // 上一版：调亮一档的莫兰迪（现在换成从插画里取的色）
  '#eec0c6',
  '#bd6774',
  '#93bad0',
  '#5a5568',
  '#a9ca9b',
  '#5b8b86',
  '#dcb083',
  '#7c8bb8',
  '#e3a3a8',
  '#8d7f9e',
  '#c3b07a',
  // 插画配色第一版：藕粉太白，在奶油色卡片上快看不见了，深了一点
  '#f4dcd7',
  // 上一版：取自穆夏插画的那套（藕粉 / 杏 / 橄榄绿），现在换回粉到黑
  '#ebc8c3',
  '#a85767',
  '#e2c095',
  '#3f4a37',
  '#a8bd88',
  '#7b5b63',
  '#d8b48a',
  '#5c4a44',
  '#f0dfd2',
  '#6e7a54',
  '#c9a3a8',
]

let seedPromise: Promise<void> | null = null

// 用记忆化的 Promise 去重，避免多个页面同时触发导致重复写入预置分类
export function ensureSeedCategories(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const count = await db.categories.count()
      if (count === 0) {
        const rows = DEFAULT_CATEGORIES.map((c, i) => ({ name: c.name, color: c.color, order: i }))
        await db.categories.bulkAdd(rows)
        return
      }
      // 换了新配色：旧配色都还在 LEGACY_COLORS 里，碰到就换掉。
      // 预置类型照名字对到新色；自己建的类型按它排第几个，取新坡道里的色，
      // 否则它们会一直停在以前那套（以前最深的一档是墨黑）。
      const cats = (await db.categories.toArray()).sort(
        (a, b) => a.order - b.order || a.id! - b.id!,
      )
      for (const [i, c] of cats.entries()) {
        if (!LEGACY_COLORS.includes(c.color)) continue
        const def = DEFAULT_CATEGORIES.find((d) => d.name === c.name)
        const next = def ? def.color : CATEGORY_COLORS[i % CATEGORY_COLORS.length]
        if (next !== c.color) await db.categories.update(c.id!, { color: next })
      }
    })()
  }
  return seedPromise
}
