import Dexie, { type Table } from 'dexie'
import { touch } from './lib/touch'

export interface Category {
  id?: number
  name: string
  color: string
  order: number
}

export interface Movement {
  id?: number
  name: string
  createdAt: number
}

/** 某个动作底下的一条要点，一条就是一行 */
export interface EntryPoint {
  movementId: number
  text: string
  /** 0 是一级要点，1 是缩进一级的展开或举例；老记录没有这个字段，当 0 看 */
  level?: number
}

/** 一条记录 = 一次练习 + 一次心得。时长、动作、文字、照片都可以留空，但至少填一样。 */
export interface Entry {
  id?: number
  /** 这一天的 00:00 时间戳，记录按天归档 */
  date: number
  /** 0 表示这次没有记时长（纯笔记） */
  durationMin: number
  categoryId: number | null
  movementIds: number[]
  /** 每个动作各自的要点；老记录没有这个字段，靠 note 显示 */
  points?: EntryPoint[]
  /** 整节课的话，一行一条 */
  note: string
  images: Blob[]
  /** manual = 自己记的；watch = 手表导的；file = 从别的 App 导的文件 */
  source: 'manual' | 'watch' | 'file'
  /** 从文件导入时，文件里写的课程类型原名；对不上自己的类型也留着，方便以后认 */
  importType?: string
  createdAt: number
}

/**
 * 一笔花费：买课卡、买体服、买足尖鞋……
 * 和练习记录分开记，因为一笔钱不是一次课。
 */
export interface Spend {
  id?: number
  /** 花在哪天，当天 00:00 */
  date: number
  /** 金额，元 */
  amount: number
  /** 分类，自己起的名字：课时费、服装、配件…… */
  category: string
  note: string
  createdAt: number
}

/** 杂项设置（比如今年的练习目标），一个 key 存一条 */
export interface Setting {
  key: string
  value: string | number | boolean | null
}

export type PlaceType = 'studio' | 'shop' | 'other'

export interface Place {
  id?: number
  name: string
  city: string
  type: PlaceType
  /** 0–5，0 表示没打分 */
  rating: number
  review: string
  photos: Blob[]
  visitedAt: number
  createdAt: number
}

/* ---------- 旧版表结构，仅用于一次性迁移 ---------- */

export interface LegacyPracticeRecord {
  id?: number
  startAt: number
  endAt: number
  durationMin: number
  categoryId: number | null
  note: string
  source: string
  createdAt: number
}

export interface LegacyNote {
  id?: number
  movementId: number
  content: string
  images: Blob[]
  createdAt: number
}

class BalletDB extends Dexie {
  categories!: Table<Category, number>
  movements!: Table<Movement, number>
  entries!: Table<Entry, number>
  places!: Table<Place, number>
  spends!: Table<Spend, number>
  settings!: Table<Setting, string>
  practiceRecords!: Table<LegacyPracticeRecord, number>
  notes!: Table<LegacyNote, number>

  constructor() {
    super('ballet-app')
    this.version(1).stores({
      categories: '++id, order',
      practiceRecords: '++id, startAt, categoryId, source',
    })
    this.version(2).stores({
      movements: '++id, name',
      notes: '++id, movementId, createdAt',
    })
    this.version(3).stores({
      categories: '++id, order',
      movements: '++id, name',
      practiceRecords: '++id, startAt, categoryId, source',
      notes: '++id, movementId, createdAt',
      entries: '++id, date, categoryId, *movementIds, source, createdAt',
      places: '++id, visitedAt, type',
    })
    this.version(4).stores({
      settings: 'key',
    })
    this.version(5).stores({
      spends: '++id, date, category',
    })
  }
}

export const db = new BalletDB()

// 记录、花费、类型、动作、地点——任何一处有增删改，就按一下信号灯，云备份会自己跟上。
// settings 不算在内：云备份自己就要往 settings 里写「上次上传时间」，算进去会自己叫醒自己。
for (const table of [db.entries, db.spends, db.categories, db.movements, db.places]) {
  table.hook('creating', () => {
    touch()
  })
  table.hook('updating', () => {
    touch()
  })
  table.hook('deleting', () => {
    touch()
  })
}
