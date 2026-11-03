import { useEffect, useRef, useState } from 'react'
import { db, type Spend } from '../db'
import { loadSpendCats, money, saveSpendCats, spendDay } from '../lib/spend'
import { pad2 } from '../lib/time'
import { t, useLang } from '../lib/i18n'
import { useToast } from '../hooks/useToast'
import { playCoin } from '../lib/sound'
import { Toast } from './Toast'

function isoOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function msOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return new Date().setHours(0, 0, 0, 0)
  return new Date(y, m - 1, d).getTime()
}

/**
 * 花费：一笔一笔单独记，跟练习记录不挂钩。
 * 上面是流水，下面是表单，点流水就能改。
 */
export function SpendSheet({
  spends,
  onClose,
  onChanged,
}: {
  spends: Spend[]
  onClose: () => void
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<Spend | null>(null)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [dateIso, setDateIso] = useState(() => isoOf(new Date().setHours(0, 0, 0, 0)))
  const [note, setNote] = useState('')
  // 分类是一份存下来的名单：加进去就一直在，删掉也不会动已经记过的账
  const [cats, setCats] = useState<string[]>([])
  const [catEdit, setCatEdit] = useState(false)
  const [addingCat, setAddingCat] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [busy, setBusy] = useState(false)
  const { msg, show } = useToast()
  useLang()

  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    loadSpendCats(spends).then(setCats)
  }, [spends])

  const list = [...spends].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt)
  const total = spends.reduce((s, x) => s + (x.amount > 0 ? x.amount : 0), 0)

  function reset() {
    setEditing(null)
    setAmount('')
    setCategory('')
    setDateIso(isoOf(new Date().setHours(0, 0, 0, 0)))
    setNote('')
    setAddingCat(false)
    setNewCat('')
    setCatEdit(false)
  }

  function beginEdit(s: Spend) {
    setEditing(s)
    setAmount(String(s.amount))
    setCategory(s.category)
    setDateIso(isoOf(s.date))
    setNote(s.note)
    setAddingCat(false)
    setCatEdit(false)
  }

  /** 新分类马上写进名单，抽屉关掉也还在 */
  async function addCategory() {
    const name = newCat.trim()
    setAddingCat(false)
    setNewCat('')
    setCatEdit(false)
    if (!name) return
    setCategory(name)
    if (cats.includes(name)) return
    const next = [...cats, name]
    setCats(next)
    await saveSpendCats(next)
  }

  async function removeCategory(name: string) {
    const used = spends.filter((s) => s.category === name).length
    const text =
      used > 0
        ? t(
            `删掉「${name}」这个分类？已经记过的 ${used} 笔账还在，账上的分类名也不会变，只是这一项不再出现在选择里。`,
            `Delete the “${name}” category? Your ${used} entries stay as they are — the name just stops appearing in the list.`,
          )
        : t(`删除「${name}」这个分类？`, `Delete the “${name}” category?`)
    if (!window.confirm(text)) return
    const next = cats.filter((c) => c !== name)
    setCats(next)
    if (category === name) setCategory('')
    await saveSpendCats(next)
  }

  async function save() {
    if (busy) return
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      show(t('先填个金额', 'Enter an amount first'))
      return
    }
    // 新记一笔才响；改旧账不响。放在 await 之前，iPhone 才允许出声
    if (!editing) playCoin()
    setBusy(true)
    try {
      const row = {
        date: msOf(dateIso),
        amount: Math.round(n),
        category: category.trim() || t('未分类', 'Unfiled'),
        note: note.trim(),
      }
      if (editing?.id) {
        await db.spends.update(editing.id, row)
        show(t('已保存', 'Saved'))
      } else {
        await db.spends.add({ ...row, createdAt: Date.now() })
        show(t('记下了', 'Noted'))
      }
      onChanged()
      reset()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing?.id) return
    if (
      !window.confirm(
        t(
          `删掉这笔 ${money(editing.amount)}？删掉就找不回来了。`,
          `Delete this ${money(editing.amount)} entry? It can’t be undone.`,
        ),
      )
    )
      return
    await db.spends.delete(editing.id)
    onChanged()
    reset()
    show(t('已删除', 'Deleted'))
  }

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head sheet-head-slim">
          <div className="sheet-kicker">
            {total > 0 ? t(`共 ${money(total)}`, `Total ${money(total)}`) : ''}
          </div>
          <button className="sheet-close" onClick={onClose} aria-label={t('关闭', 'Close')}>
            ×
          </button>
        </header>

        {list.length > 0 && (
          <div className="spend-list">
            {list.map((s) => (
              <button
                key={s.id}
                className={'spend-item' + (editing?.id === s.id ? ' spend-item-on' : '')}
                onClick={() => beginEdit(s)}
              >
                <span className="spend-item-day">{spendDay(s.date)}</span>
                <span className="spend-item-cat">
                  {s.category}
                  {s.note ? ` · ${s.note}` : ''}
                </span>
                <span className="spend-item-amt">{money(s.amount)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="spend-form">
          <label className="spend-amount">
            <span className="label">{t('花了多少', 'Amount')}</span>
            <span className="spend-amount-field">
              <i>¥</i>
              {/* 框子跟着数字长短走，¥ 就贴在数字左边 */}
              <input
                className="num-input num-lg"
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="1280"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ width: `${Math.max(amount.length, 4)}ch` }}
              />
            </span>
          </label>

          <div className="spend-field">
            <div className="label-row">
              <span className="label">{t('算在哪一类', 'Category')}</span>
              {cats.length > 0 && (
                <button
                  type="button"
                  className="label-action"
                  onClick={() => {
                    setCatEdit((v) => !v)
                    setAddingCat(false)
                    setNewCat('')
                  }}
                >
                  {catEdit ? t('完成', 'Done') : t('编辑', 'Edit')}
                </button>
              )}
            </div>
            <div className="chips">
              {cats.map((name) =>
                catEdit ? (
                  <button
                    key={name}
                    type="button"
                    className="chip chip-drop"
                    onClick={() => removeCategory(name)}
                    aria-label={t(`删除分类 ${name}`, `Delete category ${name}`)}
                  >
                    {name}
                    <span className="chip-x" aria-hidden="true">
                      ×
                    </span>
                  </button>
                ) : (
                  <button
                    key={name}
                    type="button"
                    className={'chip' + (category === name ? ' chip-on' : '')}
                    onClick={() => setCategory(category === name ? '' : name)}
                  >
                    {name}
                  </button>
                ),
              )}
              {/* 正在改的这笔，分类如果已经从名单里删掉，也让它显示出来 */}
              {!catEdit && category && !cats.includes(category) && (
                <button type="button" className="chip chip-on" onClick={() => setCategory('')}>
                  {category}
                </button>
              )}
              {addingCat ? (
                <input
                  className="chip chip-input"
                  autoFocus
                  maxLength={8}
                  placeholder={t('分类名', 'Name')}
                  aria-label={t('新分类的名字', 'New category name')}
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onBlur={addCategory}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCategory()
                    else if (e.key === 'Escape') {
                      setAddingCat(false)
                      setNewCat('')
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="chip chip-plus"
                  onClick={() => setAddingCat(true)}
                  aria-label={t('新建分类', 'New category')}
                >
                  ＋
                </button>
              )}
            </div>
          </div>

          <div className="spend-field">
            <span className="label">{t('哪天花的', 'Date')}</span>
            <input
              className="input spend-date"
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
            />
          </div>

          <label className="spend-field">
            <span className="label">{t('备注（可空）', 'Note (optional)')}</span>
            <input
              className="input"
              type="text"
              maxLength={24}
              placeholder={t('比如：10 次课卡', 'e.g. a 10-class card')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <div className="sheet-actions">
          {editing && (
            <button className="btn btn-quiet" onClick={remove}>
              {t('删除', 'Delete')}
            </button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {editing ? t('保存修改', 'Save changes') : t('记下这笔', 'Add this')}
          </button>
        </div>

        <Toast msg={msg} />
      </div>
    </div>
  )
}
