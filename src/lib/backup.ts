import { db } from '../db'
import { t } from './i18n'

/** 备份文件的格式版本，改结构时 +1，方便以后认得出老备份 */
export const BACKUP_VERSION = 3

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataURLToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  return await res.blob()
}

/**
 * 把整个手账打包成一串 JSON。
 * 照片在数据库里是二进制，打包时转成文本（dataURL），这样一份文件就带走了全部内容。
 */
export async function buildBackupJson(): Promise<string> {
  const [cats, moves, entries, places, settings, spends] = await Promise.all([
    db.categories.toArray(),
    db.movements.toArray(),
    db.entries.toArray(),
    db.places.toArray(),
    db.settings.toArray(),
    db.spends.toArray(),
  ])
  const data = {
    app: 'ballet-diary',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: cats,
    movements: moves,
    entries: await Promise.all(
      entries.map(async (e) => ({
        ...e,
        images: await Promise.all(e.images.map((b) => blobToDataURL(b))),
      })),
    ),
    places: await Promise.all(
      places.map(async (p) => ({
        ...p,
        photos: await Promise.all(p.photos.map((b) => blobToDataURL(b))),
      })),
    ),
    // 导入批次里的 id 只对这台手机有意义，带进备份反而会误导
    settings: settings.filter((s) => s.key !== 'importBatches'),
    spends,
  }
  return JSON.stringify(data)
}

/**
 * 把一份备份合并回手账：按名字认类型和动作，重复的记录跳过。
 * 只加不删——导入一份旧备份不会把你现在的记录弄少。
 */
export async function restoreBackupJson(text: string): Promise<number> {
  const data = JSON.parse(text)
  const existingCats = await db.categories.toArray()
  const catIdMap = new Map<number, number>()
  let order = existingCats.length
  for (const c of data.categories || []) {
    const hit = existingCats.find((x) => x.name === c.name)
    if (hit) {
      catIdMap.set(c.id, hit.id!)
    } else {
      const id = await db.categories.add({ name: c.name, color: c.color, order: order++ })
      catIdMap.set(c.id, id)
    }
  }

  const existingMoves = await db.movements.toArray()
  const moveIdMap = new Map<number, number>()
  for (const m of data.movements || []) {
    const hit = existingMoves.find((x) => x.name === m.name)
    if (hit) {
      moveIdMap.set(m.id, hit.id!)
    } else {
      const id = await db.movements.add({ name: m.name, createdAt: m.createdAt || Date.now() })
      moveIdMap.set(m.id, id)
    }
  }

  const existing = await db.entries.toArray()
  const seen = new Set(existing.map((e) => `${e.date}-${e.createdAt}-${e.durationMin}`))
  let added = 0
  for (const e of data.entries || []) {
    const key = `${e.date}-${e.createdAt}-${e.durationMin}`
    if (seen.has(key)) continue
    seen.add(key)
    await db.entries.add({
      date: e.date,
      durationMin: e.durationMin || 0,
      categoryId: e.categoryId != null ? catIdMap.get(e.categoryId) ?? null : null,
      movementIds: (e.movementIds || []).map((id: number) => moveIdMap.get(id)).filter(Boolean),
      points: (e.points || [])
        .map((p: { movementId: number; text: string; level?: number }) => ({
          movementId: moveIdMap.get(p.movementId),
          text: p.text,
          level: p.level === 1 ? 1 : 0,
        }))
        .filter(
          (p: { movementId?: number; text: string }): p is {
            movementId: number
            text: string
          } => p.movementId !== undefined,
        ),
      note: e.note || '',
      images: await Promise.all((e.images || []).map((u: string) => dataURLToBlob(u))),
      source: e.source === 'watch' || e.source === 'file' ? e.source : 'manual',
      importType: typeof e.importType === 'string' && e.importType ? e.importType : undefined,
      createdAt: e.createdAt || Date.now(),
    })
    added++
  }

  const existingPlaces = await db.places.toArray()
  for (const p of data.places || []) {
    const dup = existingPlaces.find((x) => x.name === p.name && x.visitedAt === p.visitedAt)
    if (dup) continue
    await db.places.add({
      name: p.name,
      city: p.city || '',
      type: p.type || 'other',
      rating: p.rating || 0,
      review: p.review || '',
      photos: await Promise.all((p.photos || []).map((u: string) => dataURLToBlob(u))),
      visitedAt: p.visitedAt || Date.now(),
      createdAt: p.createdAt || Date.now(),
    })
  }

  const existingSpends = await db.spends.toArray()
  for (const s of data.spends || []) {
    const dup = existingSpends.find(
      (x) => x.date === s.date && x.amount === s.amount && x.category === s.category,
    )
    if (dup) continue
    await db.spends.add({
      date: s.date || Date.now(),
      amount: s.amount || 0,
      category: s.category || t('其他', 'Other'),
      note: s.note || '',
      createdAt: s.createdAt || Date.now(),
    })
  }

  for (const s of data.settings || []) {
    if (s?.key === 'importBatches') continue
    if (s?.key) await db.settings.put({ key: s.key, value: s.value ?? null })
  }

  return added
}
