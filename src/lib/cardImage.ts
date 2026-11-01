/**
 * 把笔记画成 3:4 的图片卡片（1080×1440）。
 * 不用任何画图库，直接用浏览器自带的 canvas 画，iPhone 上也能原样生成。
 *
 * 版式是「节目单」：编号 + 动作名 + 一根细线，底下一颗小圆点领出每一条，
 * 没有花边，靠字号和留白撑住。底图是可选项——同一套排版压在她的照片上，
 * 照片偏暗走白字、偏亮换深色字。
 */

import { t } from './i18n'

const W = 1080
const H = 1440
/** 左右页边 */
const M = 104
/** 内容画到这儿为止，下面留给页脚 */
const BOTTOM = H - 170

const PAPER = '#fbf8f4'

const SERIF = '"Didot","Bodoni 72","Songti SC","STSong","Times New Roman",serif'
const SANS =
  '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Helvetica Neue",sans-serif'

/** 纸面一套色 */
const LIGHT = {
  brand: '#a2949a',
  title: '#1f191b',
  sub: '#8d7d7b',
  hair: '#d8c9c2',
  num: '#c3b2ac',
  sec: '#1f191b',
  secRule: '#e8dbd6',
  body: '#4a4144',
  bullet: '#c9b6b0',
  foot: '#a2949a',
}

/** 照片上的白字一套色 */
const DARK = {
  brand: 'rgba(255,255,255,0.72)',
  title: '#fffdfb',
  sub: 'rgba(255,255,255,0.72)',
  hair: 'rgba(255,255,255,0.34)',
  num: 'rgba(255,255,255,0.5)',
  sec: '#fffdfb',
  secRule: 'rgba(255,255,255,0.26)',
  body: 'rgba(255,255,255,0.94)',
  bullet: 'rgba(255,255,255,0.4)',
  foot: 'rgba(255,255,255,0.64)',
}

type Palette = typeof LIGHT

/** 卡片里的一条话；level 1 是缩进一级的展开或举例 */
export interface CardItem {
  text: string
  level: number
}

/** 卡片里的一节，比如「rond de jambe」 */
export interface CardSection {
  title: string
  items: CardItem[]
}

const TOKEN = /[A-Za-z0-9'’\-.,:;!?()/]+|\s+|[\s\S]/gu

/** 这些标点不该跑到行首，让它吊在上一行末尾 */
const NO_START = /^[，。、；：！？）」』】》…·%,.;:!?)\]}>»”’]/
/** 这些开着的东西不该被留在行尾 */
const NO_END = /[「『（《【‘“]$/

/* ---------- 小工具 ---------- */

function setFont(ctx: CanvasRenderingContext2D, size: number, family = SANS, weight = 400) {
  ctx.font = `${weight} ${size}px ${family}`
}

/** 按像素宽度折行；英文单词不拦腰断，中文标点不落行首 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []
  for (const raw of text.split('\n')) {
    const tokens = raw.match(TOKEN) || []
    let line = ''
    for (const t of tokens) {
      if (!line || ctx.measureText((line + t).trimEnd()).width <= maxW) {
        line += t
        continue
      }
      let carry = ''
      const open = line.match(NO_END)
      if (open) {
        carry = open[0]
        line = line.slice(0, -1)
      }
      if (NO_START.test(t)) {
        lines.push((line + t).trimEnd())
        line = carry
      } else {
        lines.push(line.trimEnd())
        line = carry + t.trimStart()
      }
    }
    lines.push(line.trimEnd())
  }
  return lines.length ? lines : ['']
}

/** 字距：逐字画，各浏览器都一样 */
function spaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  sp: number,
) {
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1)
  const prev = ctx.textAlign
  ctx.textAlign = 'left'
  let cx = x - total / 2
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y)
    cx += widths[i] + sp
  })
  ctx.textAlign = prev
}

function rule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y: number,
  x2: number,
  color: string,
  w = 1,
) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()
  ctx.restore()
}

async function loadImg(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** 取一张图的大致明暗，决定压白纱还是黑纱 */
function luminance(img: HTMLImageElement): number {
  const c = document.createElement('canvas')
  c.width = 12
  c.height = 12
  const x = c.getContext('2d', { willReadFrequently: true })
  if (!x) return 0.5
  x.drawImage(img, 0, 0, 12, 12)
  const d = x.getImageData(0, 0, 12, 12).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) {
    sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
  }
  return sum / (d.length / 4)
}

/**
 * 底图先缩成一小张存着，画的时候再放大铺满——
 * 这样天然就有一层柔化的虚，不依赖 Canvas 的 filter（Safari 上不保险）。
 */
function photoLayer(img: HTMLImageElement): HTMLCanvasElement {
  const small = document.createElement('canvas')
  small.width = 180
  small.height = 240
  const c = small.getContext('2d')
  if (c) {
    const s = Math.max(small.width / img.width, small.height / img.height)
    const w = img.width * s
    const h = img.height * s
    c.drawImage(img, (small.width - w) / 2, (small.height - h) / 2, w, h)
  }
  return small
}

/* ---------- 一页纸 ---------- */

interface Bg {
  layer: HTMLCanvasElement
  dark: boolean
}

class Pages {
  canvases: HTMLCanvasElement[] = []
  canvas!: HTMLCanvasElement
  ctx!: CanvasRenderingContext2D
  y = 0
  /** 翻页前先补页面骨架（底图、页脚），由外面塞进来 */
  paintPage: (ctx: CanvasRenderingContext2D, first: boolean) => void = () => {}
  /** 翻页时把当前这一节的标题也带过去 */
  carryTitle: string | null = null

  begin() {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('画不出来')
    this.canvases.push(c)
    this.canvas = c
    this.ctx = ctx
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    this.paintPage(ctx, this.canvases.length === 1)
  }

  /** 这一块放得下吗；放不下就换张 */
  room(h: number): boolean {
    if (this.y + h <= BOTTOM) return false
    this.begin()
    return true
  }

  get n() {
    return this.canvases.length
  }
}

export interface CardOptions {
  /** 顶部小字，比如「芭蕾手账 · 笔记」 */
  brand: string
  /** 大标题，比如「2026.11」 */
  title: string
  /** 副标题，比如「2 条笔记」 */
  sub: string
  /** 页脚，比如「芭蕾手账 · 2026.11」 */
  foot: string
  sections: CardSection[]
  /** 卡片末尾另外加的图 */
  images: Blob[]
  /** 可选的底图；没有就是纸面 */
  background?: Blob | null
}

/** 画好所有页，返回 PNG 的 blob 数组（一页一张） */
export async function renderNoteCards(opts: CardOptions): Promise<Blob[]> {
  // 底图先备好：缩一张、量一下明暗
  let bg: Bg | null = null
  if (opts.background) {
    try {
      const img = await loadImg(opts.background)
      bg = { layer: photoLayer(img), dark: luminance(img) < 0.58 }
    } catch {
      bg = null
    }
  }
  const T: Palette = bg?.dark ? DARK : LIGHT

  const p = new Pages()

  /* ---------- 每页的骨架 ---------- */
  p.paintPage = (c, first) => {
    if (bg) {
      c.imageSmoothingEnabled = true
      c.imageSmoothingQuality = 'high'
      c.drawImage(bg.layer, 0, 0, W, H)
      const v = c.createLinearGradient(0, 0, 0, H)
      if (bg.dark) {
        v.addColorStop(0, 'rgba(22,16,18,0.5)')
        v.addColorStop(0.55, 'rgba(22,16,18,0.4)')
        v.addColorStop(1, 'rgba(22,16,18,0.62)')
      } else {
        v.addColorStop(0, 'rgba(252,248,245,0.68)')
        v.addColorStop(0.55, 'rgba(252,248,245,0.6)')
        v.addColorStop(1, 'rgba(252,248,245,0.74)')
      }
      c.fillStyle = v
      c.fillRect(0, 0, W, H)
      // 一道细框，把整页收住
      c.strokeStyle = bg.dark ? 'rgba(255,255,255,0.26)' : 'rgba(40,32,34,0.2)'
      c.lineWidth = 1.4
      c.strokeRect(56, 56, W - 112, H - 112)
    } else {
      c.fillStyle = PAPER
      c.fillRect(0, 0, W, H)
    }

    // 页脚：一根细线 + 一行小字
    rule(c, M, H - 138, W - M, T.secRule, 1)
    c.textAlign = 'center'
    c.fillStyle = T.foot
    setFont(c, 17, SANS, 400)
    spaced(c, opts.foot, W / 2, H - 96, 5)
    c.textAlign = 'left'

    if (first) {
      /* 抬头：压得紧一点，把版面留给正文 */
      c.textAlign = 'center'
      c.fillStyle = T.brand
      setFont(c, 16, SANS, 400)
      spaced(c, opts.brand, W / 2, 140, 6)

      c.fillStyle = T.title
      let size = 62
      setFont(c, size, SERIF, 500)
      while (size > 38 && c.measureText(opts.title).width > W - M * 2) {
        size -= 3
        setFont(c, size, SERIF, 500)
      }
      c.fillText(opts.title, W / 2, 232)

      c.fillStyle = T.sub
      setFont(c, 18, SANS, 400)
      spaced(c, opts.sub, W / 2, 276, 4)

      rule(c, M, 322, W - M, T.hair, 1.2)
      c.textAlign = 'left'
      p.y = 390
    } else {
      /* 续页的小页眉 */
      c.textAlign = 'center'
      c.fillStyle = T.brand
      setFont(c, 18, SANS, 400)
      spaced(c, `${opts.brand}　·　${opts.title}`, W / 2, 112, 3)
      rule(c, W / 2 - 170, 138, W / 2 + 170, T.hair, 1)
      c.textAlign = 'left'
      p.y = 206
    }
  }

  // 先把第一页的纸铺好，后面才量得了字
  p.begin()

  /* ---------- 一条话 ---------- */

  const bulletX = (level: number) => (level > 0 ? M + 92 : M + 40)
  const textX = (level: number) => (level > 0 ? M + 138 : M + 84)
  const bodyFont = (level: number) => (level > 0 ? 27 : 30)
  const lineH = (level: number) => (level > 0 ? 44 : 50)

  const layoutItem = (c: CanvasRenderingContext2D, item: CardItem) => {
    const lv = item.level > 0 ? 1 : 0
    setFont(c, bodyFont(lv), SANS, 400)
    const lines = wrap(c, item.text, W - M - textX(lv))
    return { level: lv, lines, need: lines.length * lineH(lv) + (lv > 0 ? 8 : 10) }
  }

  const drawItem = (c: CanvasRenderingContext2D, item: CardItem, laid: ReturnType<typeof layoutItem>) => {
    const { level, lines } = laid
    setFont(c, bodyFont(level), SANS, 400)
    lines.forEach((line, i) => {
      p.y += lineH(level)
      if (i === 0) {
        // 一条话前面一颗小圆点；缩进的那级更小
        const r = level > 0 ? 2.6 : 3.6
        c.beginPath()
        c.arc(bulletX(level) + r + 1, p.y - 10, r, 0, Math.PI * 2)
        c.fillStyle = T.bullet
        c.fill()
      }
      c.fillStyle = T.body
      c.fillText(line, textX(level), p.y)
    })
    p.y += level > 0 ? 8 : 10
  }

  /* ---------- 一节的小标题 ---------- */

  const drawSectionTitle = (c: CanvasRenderingContext2D, index: number, title: string, tail = false) => {
    let size = 34
    setFont(c, size, SANS, 500)
    while (size > 22 && c.measureText(title).width > W - M - (M + 76)) {
      size -= 2
      setFont(c, size, SANS, 500)
    }

    if (!tail) {
      c.fillStyle = T.num
      setFont(c, 24, SERIF, 400)
      c.fillText(String(index + 1).padStart(2, '0'), M, p.y)
      setFont(c, size, SANS, 500)
    }

    c.fillStyle = T.sec
    const x = tail ? M : M + 76
    c.fillText(tail ? `${title}${t('（续）', ' (cont.)')}` : title, x, p.y)
    rule(c, x, p.y + 26, W - M, T.secRule, 1)
    // 标题和它下面第一条挨近一点，节和节之间才分得开
    p.y += 24
  }

  /* ---------- 一节一节往下写 ---------- */
  for (let s = 0; s < opts.sections.length; s++) {
    const sec = opts.sections[s]
    if (sec.items.length === 0) continue

    // 标题至少和第一条待在一起
    p.room(64 + layoutItem(p.ctx, sec.items[0]).need)
    drawSectionTitle(p.ctx, s, sec.title)

    for (const item of sec.items) {
      const laid = layoutItem(p.ctx, item)
      const pageBefore = p.n
      p.room(laid.need)
      if (p.n > pageBefore) {
        // 换页了，标一下这是哪个动作
        drawSectionTitle(p.ctx, s, sec.title, true)
      }
      drawItem(p.ctx, item, laid)
    }
    // 节和节之间多留一点
    p.y += 72
  }

  /* ---------- 另外加的图 ---------- */
  for (const blob of opts.images) {
    let img: HTMLImageElement
    try {
      img = await loadImg(blob)
    } catch {
      continue
    }
    const maxH = 420
    const scale = Math.min((W - M * 2) / img.width, maxH / img.height, 1.6)
    const w = img.width * scale
    const h = img.height * scale
    p.room(h + 40)
    const c = p.ctx
    p.y += 26
    c.drawImage(img, M + (W - M * 2 - w) / 2, p.y, w, h)
    p.y += h + 14
  }

  const total = p.canvases.length
  if (total > 1) {
    p.canvases.forEach((cv, i) => {
      const c = cv.getContext('2d')
      if (!c) return
      c.textAlign = 'right'
      c.fillStyle = T.foot
      setFont(c, 17, SANS, 400)
      c.fillText(`${i + 1} / ${total}`, W - M, H - 96)
      c.textAlign = 'left'
    })
  }

  return Promise.all(
    p.canvases.map(
      (c) =>
        new Promise<Blob>((res, rej) => {
          c.toBlob((b) => (b ? res(b) : rej(new Error('导出失败'))), 'image/png')
        }),
    ),
  )
}
