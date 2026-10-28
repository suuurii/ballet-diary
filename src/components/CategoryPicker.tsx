import type { Category } from '../db'

export function CategoryPicker({
  categories,
  value,
  onChange,
  allowNone,
  onAdd,
}: {
  categories: Category[]
  value: number | null
  onChange: (id: number | null) => void
  allowNone?: boolean
  onAdd?: () => void
}) {
  return (
    <div className="chips">
      {categories.map((c) => {
        const active = value === c.id
        return (
          <button
            key={c.id}
            type="button"
            className={'chip' + (active ? ' chip-active' : '')}
            style={active ? { background: c.color, borderColor: c.color } : undefined}
            onClick={() => onChange(c.id!)}
          >
            <span className="chip-dot" style={{ background: active ? '#fff' : c.color }} />
            {c.name}
          </button>
        )
      })}
      {allowNone && (
        <button
          type="button"
          className={'chip' + (value === null ? ' chip-active' : '')}
          onClick={() => onChange(null)}
        >
          未分类
        </button>
      )}
      {onAdd && (
        <button type="button" className="chip chip-add" onClick={onAdd}>
          ＋ 自定义
        </button>
      )}
    </div>
  )
}
