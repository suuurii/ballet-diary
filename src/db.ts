import Dexie, { type Table } from 'dexie'

export interface Category {
  id?: number
  name: string
  color: string
  order: number
}

export type RecordSource = 'timer' | 'manual' | 'watch'

export interface PracticeRecord {
  id?: number
  startAt: number
  endAt: number
  durationMin: number
  categoryId: number | null
  note: string
  source: RecordSource
  createdAt: number
}

export interface Movement {
  id?: number
  name: string
  createdAt: number
}

export interface Note {
  id?: number
  movementId: number
  content: string
  images: Blob[]
  createdAt: number
}

class BalletDB extends Dexie {
  categories!: Table<Category, number>
  practiceRecords!: Table<PracticeRecord, number>
  movements!: Table<Movement, number>
  notes!: Table<Note, number>

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
  }
}

export const db = new BalletDB()
