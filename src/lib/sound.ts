/**
 * 记下一笔花费时的一声「叮」。
 *
 * 声音是她自己挑的那段 mp3（`public/sounds/money.mp3`，约 1.5 秒），
 * 跟页面一起发布；不联网、不上传、不读别的地方。
 *
 * 浏览器只允许在「点了一下」的那一下出声，所以 `play()` 必须在她按
 * 「记下这笔」时同步发生，中间不能有 await。页面打开时先把文件读进来
 * （`warmUpCoin`），点下去才不用等下载。
 */
const SRC = `${import.meta.env.BASE_URL}sounds/money.mp3`

let el: HTMLAudioElement | null = null

function audio(): HTMLAudioElement | null {
  if (el) return el
  if (typeof Audio === 'undefined') return null
  el = new Audio(SRC)
  el.preload = 'auto'
  el.volume = 0.6
  el.load()
  return el
}

/** 页面打开时先悄悄读进来；读得慢、读不到都不影响别的功能 */
export function warmUpCoin() {
  audio()
}

/** 从头放一遍。连着记几笔就每次从头响 */
export function playCoin() {
  try {
    const a = audio()
    if (!a) return
    a.currentTime = 0
    // 手机开了静音键或省电模式时 play() 会被拒绝，吞掉就好
    void a.play().catch(() => {})
  } catch {
    // 出不了声也不影响记账，安静地不响就好
  }
}
