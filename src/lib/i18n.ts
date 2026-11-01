import { useSyncExternalStore } from 'react'

/**
 * 界面语言：中文（默认）/ English。
 * 语言选择只存在这台设备上，切换不需要联网，也不进备份。
 */
export type Lang = 'zh' | 'en'

const KEY = 'ballet.lang'
const listeners = new Set<() => void>()

function readLang(): Lang {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

let current: Lang = readLang()

function syncHtmlLang() {
  document.documentElement.lang = current === 'en' ? 'en' : 'zh-CN'
}
syncHtmlLang()

export function getLang(): Lang {
  return current
}

export function setLang(next: Lang) {
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* 存不了也不影响这一次切换 */
  }
  syncHtmlLang()
  listeners.forEach((fn) => fn())
}

export function toggleLang() {
  setLang(current === 'zh' ? 'en' : 'zh')
}

/** 组件里调用一下，切语言时才会重画 */
export function useLang(): Lang {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
    () => current,
  )
}

/** 文案：中文和英文写在一起，改的时候只改这一处 */
export function t(zh: string, en: string): string {
  return current === 'en' ? en : zh
}
