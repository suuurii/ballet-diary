import Dexie, { type Table } from 'dexie'

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

/** 一条记录 = 一次练习 + 一次心得。时长、动作、文字、照片都可以留空，但至少填一样。 */
export interface Entry {
  id?: number
  /** 这一天的 00:00 时间戳，记录按天归档 */
  date: number
  /** 0 表示这次没有记时长（纯笔记） */
  durationMin: number
  categoryId: number | null
  movementIds: number[]
  note: string
  images: Blob[]
  source: 'manual' | 'watch'
  createdAt: number
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
  }
}

export const db = new BalletDB()
