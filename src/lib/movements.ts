const SEP_SPLIT = /[\s'’\-.,]+/
const SEP_ALL = /[\s'’\-.,]+/g

/**
 * 显示用：每个词的首字母大写，`relevé` → `Relevé`、`rond de jambe` → `Rond De Jambe`。
 * 只改首字母，不管它本来是大写还是小写——手机键盘自动把开头大写时，
 * `Changement` 不该再被改成 `CHangement`。空格、撇号、连字符后面都算新词。
 * 只改显示，不动她自己存的名字。
 */
export function displayMove(name: string): string {
  return name.replace(/(^|[\s'’\-.,·/])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

/** 法文名字带音符，打字时多半不打，比之前先去干净；也用来判断两个名字是不是同一个 */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** 名字切成词：空格、撇号、连字符都算断开 */
function wordsOf(name: string): string[] {
  return normName(name).split(SEP_SPLIT).filter(Boolean)
}

/** 名字里的小介词，算首字母时可以跳过 */
const FILLER = new Set(['de', 'la', 'le', 'du', 'des', 'en', 'a', 'et'])

/**
 * 首字母："rond de jambe" → "rdj"。
 * skipFiller 时跳过 de / la 这类小词，"port de bras" → "pb"。
 */
export function initialsOf(name: string, skipFiller = false): string {
  const words = wordsOf(name)
  const kept = skipFiller ? words.filter((w) => !FILLER.has(w)) : words
  return (kept.length ? kept : words)
    .map((w) => w[0])
    .join('')
}

/**
 * 名字和输入有多像：数字越小越像，-1 表示对不上。
 * "ron" 找得到 rond de jambe，"rdj" 也找得到，"devel" 找得到 développé。
 */
export function matchScore(name: string, query: string): number {
  const q = normName(query).replace(SEP_ALL, '')
  if (!q) return 0
  const n = normName(name)
  const flat = n.replace(SEP_ALL, '')
  if (flat === q) return 0
  if (n.startsWith(q)) return 1
  if (wordsOf(name).some((w) => w.startsWith(q))) return 2
  if (initialsOf(name).startsWith(q) || initialsOf(name, true).startsWith(q)) return 3
  if (flat.includes(q)) return 4
  return -1
}
