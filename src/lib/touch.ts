/**
 * 「有东西变了」的信号灯。
 * 数据库每次写入都会按一下，云备份听到就准备上传。
 * 单独放一个文件，是为了避免数据库和云备份互相引用、绕成死结。
 */
type Listener = () => void

const listeners = new Set<Listener>()

export function onChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function touch(): void {
  for (const fn of listeners) fn()
}
