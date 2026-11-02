import { useId, useMemo, useState } from 'react'
import type { Category, Entry } from '../db'
import { hoursShort } from '../lib/time'
import { t, useLang } from '../lib/i18n'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const OTHER_COLOR = '#9c8f92'
/** 段数太多就看不清了，多的并成「其他」 */
const MAX_SLICES = 6

/* 画布：左边类型名，中间环，右边时长和占比，中间用很细的虚线牵一下 */
const W = 348
const SW = 17
const GAP = 4
const CX = W / 2

/** 图例一行占多高 */
const ROW = 26
const DOT = 3.5
/** 字和画布边缘之间留多少 */
const EDGE = 6
/** 字和环之间留多少 */
const NEAR = 13

const NAME_SIZE = 12.5
const STAT_SIZE = 10.5

type Range = 'all' | 'year' | 'month'

interface Slice {
  key: string
  name: string
  color: string
  minutes: number
}

function slicesOf(entries: Entry[], categories: Category[]): Slice[] {
  const byCat = new Map<number | null, number>()
  for (const e of entries) {
    if (e.durationMin <= 0) continue
    const id = e.categoryId ?? null
    byCat.set(id, (byCat.get(id) || 0) + e.durationMin)
  }

  const rows: Slice[] = []
  for (const [id, minutes] of byCat) {
    const cat = id === null ? undefined : categories.find((c) => c.id === id)
    rows.push({
      key: String(id),
      name: cat ? cat.name : t('没分类', 'Unfiled'),
      color: cat ? cat.color : OTHER_COLOR,
      minutes,
    })
  }

  // 同名的并成一段：比如自己建了一个也叫「没分类」的类型，
  // 否则图上会出现两个一模一样的名字，看着像 bug
  const byName = new Map<string, Slice>()
  for (const r of rows) {
    const hit = byName.get(r.name)
    if (hit) {
      hit.minutes += r.minutes
    } else {
      byName.set(r.name, { ...r })
    }
  }
  const merged = [...byName.values()]
  merged.sort((a, b) => b.minutes - a.minutes)
  // 并完名字之后，颜色取量最大的那段
  for (const m of merged) {
    const best = rows.filter((r) => r.name === m.name).sort((a, b) => b.minutes - a.minutes)[0]
    m.color = best.color
  }

  if (merged.length > MAX_SLICES) {
    const head = merged.slice(0, MAX_SLICES - 1)
    const rest = merged.slice(MAX_SLICES - 1).reduce((s, r) => s + r.minutes, 0)
    head.push({ key: 'other', name: t('其他', 'Other'), color: OTHER_COLOR, minutes: rest })
    return head
  }
  return merged
}

/** 一条备注里的小数：不满 1% 的写「<1%」，别显示成 0% */
function pctText(minutes: number, total: number): string {
  const p = (minutes / total) * 100
  return p < 1 ? '<1%' : `${Math.round(p)}%`
}

/** 中文按字号算宽、英文按更窄算，超宽就截断加省略号 */
function clip(text: string, maxPx: number, fontPx: number): string {
  let w = 0
  let out = ''
  for (const ch of text) {
    const cw = textWidth(ch, fontPx)
    if (w + cw > maxPx) return `${out}…`
    w += cw
    out += ch
  }
  return out
}

function textWidth(text: string, fontPx: number): number {
  let w = 0
  for (const ch of text) w += /[\x00-\xff]/.test(ch) ? fontPx * 0.58 : fontPx
  return w
}

/** 把两个颜色按比例调在一起：t 越大越靠向 b */
function mix(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * k))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** 类型环：时间花在了哪几类课上，默认看全部时间 */
export function TypeDonut({ entries, categories }: { entries: Entry[]; categories: Category[] }) {
  useLang()
  const [range, setRange] = useState<Range>('all')
  // 每一段用自己的渐变，id 得唯一，不然后加的会顶掉前面的
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const gradId = (key: string) => `${uid}g${key.replace(/[^a-zA-Z0-9]/g, '')}`

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const scoped = useMemo(() => {
    if (range === 'all') return entries
    const from = range === 'year' ? new Date(year, 0, 1).getTime() : new Date(year, month, 1).getTime()
    const to =
      range === 'year'
        ? new Date(year + 1, 0, 1).getTime()
        : new Date(year, month + 1, 1).getTime()
    return entries.filter((e) => e.date >= from && e.date < to)
  }, [entries, range, year, month])

  const timed = scoped.filter((e) => e.durationMin > 0)
  const slices = slicesOf(timed, categories)
  const total = slices.reduce((s, x) => s + x.minutes, 0)

  // 一条记过时长的都没有，就整块不出现
  if (!entries.some((e) => e.durationMin > 0)) return null

  const monthLabel = t(`${month + 1} 月`, `${MONTH_ABBR[month]}`)
  const RANGES: { key: Range; label: string; aria: string }[] = [
    { key: 'all', label: t('全部', 'All'), aria: t('从第一条记录到现在', 'Since your first entry') },
    { key: 'year', label: t('今年', 'Year'), aria: t(`${year} 年`, `Year ${year}`) },
    {
      key: 'month',
      label: t('本月', 'Month'),
      aria: t(`${monthLabel}，这个月`, `This month, ${monthLabel}`),
    },
  ]

  // 环的大小跟着行数走：刚好把每一行都兜进去，
  // 这样虚线从字出发总能碰到环，不会悬在半空
  const R_OUT = Math.min(74, Math.max(54, (slices.length * ROW) / 2 + 4))
  const R = R_OUT - SW / 2
  const C = 2 * Math.PI * R

  let offset = 0
  const arcs = slices.map((s) => {
    const share = (s.minutes / total) * C
    // 只有一类时就画整圈，不留那道缝
    const arc = {
      ...s,
      share,
      len: slices.length === 1 ? C : Math.max(1, share - GAP),
      offset,
    }
    offset += share
    return arc
  })

  const H = Math.max(2 * R_OUT + 44, slices.length * ROW + 36)
  const CY = H / 2
  const legendTop = (H - slices.length * ROW) / 2

  const nameX = 6 + DOT * 2 + 7
  const nameMax = CX - R_OUT - NEAR - nameX
  const statX = CX + R_OUT + NEAR
  const statMax = W - EDGE - statX

  const label =
    total > 0
      ? slices.map((s) => `${s.name} ${hoursShort(s.minutes)}，${pctText(s.minutes, total)}`).join('；')
      : t('这段时间还没有记时长的记录', 'No timed practice in this period')

  const emptyText =
    range === 'month'
      ? t(`${monthLabel}还没有记时长的记录。`, `No timed practice in ${monthLabel}.`)
      : range === 'year'
        ? t(`${year} 年还没有记时长的记录。`, `No timed practice in ${year}.`)
        : t('还没有记时长的记录。', 'No timed practice yet.')

  const numSize = Math.round(Math.min(21, Math.max(15, R * 0.3)))
  const capSize = Math.round(Math.min(9.5, Math.max(7.5, R * 0.14)) * 10) / 10

  return (
    <div className="split-page" aria-label={t('各类课程的时长分布', 'Practice time by class type')}>
      <div className="split-head">
        <span className="split-title">{t('类型分布', 'By class type')}</span>
        <div className="chips split-chips">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={'chip chip-quiet' + (range === r.key ? ' chip-on' : '')}
              aria-label={r.aria}
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {total <= 0 ? (
        <p className="donut-empty">{emptyText}</p>
      ) : (
        <div className="donut-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="donut-svg">
            <defs>
              {arcs.map((a) => (
                // 一圈里外各一层色：靠里浅一点、靠外深一点，看着有厚度
                <radialGradient
                  key={a.key}
                  id={gradId(a.key)}
                  gradientUnits="userSpaceOnUse"
                  cx={CX}
                  cy={CY}
                  r={R_OUT}
                >
                  <stop offset="0.6" stopColor={mix(a.color, '#ffffff', 0.16)} />
                  <stop offset="1" stopColor={mix(a.color, '#241c1e', 0.2)} />
                </radialGradient>
              ))}
            </defs>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--line-soft)" strokeWidth={SW} />
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={`url(#${gradId(a.key)})`}
                strokeWidth={SW}
                strokeDasharray={`${a.len} ${C}`}
                strokeDashoffset={-a.offset}
                transform={`rotate(-90 ${CX} ${CY})`}
              />
            ))}

            {slices.map((s, i) => {
              const y = legendTop + i * ROW + ROW / 2
              const name = clip(s.name, nameMax, NAME_SIZE)
              const nameW = textWidth(name, NAME_SIZE)
              const nameEnd = nameX + nameW
              const stat = `${hoursShort(s.minutes)} · ${pctText(s.minutes, total)}`

              // 环在这个高度上的左右边沿；虚线停在这里，不会穿进环里
              const dy = Math.min(Math.abs(y - CY), R_OUT - 1)
              const half = Math.sqrt(R_OUT * R_OUT - dy * dy)
              const leftEdge = CX - half
              const rightEdge = CX + half
              const dash = 'M %LEFT% %Y% H %RIGHT%'

              return (
                <g key={s.key}>
                  <circle cx={6 + DOT} cy={y} r={DOT} fill={s.color} />
                  <text x={nameX} y={y + 4.3} fontSize={NAME_SIZE} fill="var(--ink)">
                    {name}
                  </text>

                  <path
                    d={dash.replace('%LEFT%', String(nameEnd + 6)).replace('%RIGHT%', String(leftEdge - 4)).replace('%Y%', String(y))}
                    stroke="var(--ink-3)"
                    strokeOpacity={0.42}
                    strokeWidth={1}
                    strokeDasharray="1.5 4"
                    fill="none"
                  />
                  <path
                    d={dash.replace('%LEFT%', String(rightEdge + 4)).replace('%RIGHT%', String(statX - 6)).replace('%Y%', String(y))}
                    stroke="var(--ink-3)"
                    strokeOpacity={0.42}
                    strokeWidth={1}
                    strokeDasharray="1.5 4"
                    fill="none"
                  />
                  <text
                    x={statX}
                    y={y + 3.8}
                    fontSize={STAT_SIZE}
                    fill="var(--ink-3)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {clip(stat, statMax + 8, STAT_SIZE)}
                  </text>
                </g>
              )
            })}
          </svg>
          <div className="donut-core" aria-hidden="true" style={{ fontSize: capSize }}>
            <b style={{ fontSize: numSize }}>{hoursShort(total)}</b>
            <span style={{ fontSize: capSize }}>{t('总练习时长', 'total')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
