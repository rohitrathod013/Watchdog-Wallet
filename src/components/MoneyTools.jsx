/* ------------------------------------------------------------------
   Two windows that save typing: repeating transactions (rent, salary,
   subscriptions add themselves on their date), and importing a bank
   statement saved as CSV (read in the browser, reviewed before adding).
   ------------------------------------------------------------------ */
import { useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { Modal } from './ui'
import { useApp } from '../lib/store'
import { isoDay, money, shortDate } from '../lib/format'
import { ASSISTANT } from '../config'
import { t } from '../lib/i18n'
import { expenseCategories, INCOME_CATEGORIES } from '../lib/stats'
import { EVERY, EVERY_LABEL, monthlyTotal } from '../lib/recurring'
import { isDuplicate, MAX_ROWS, readStatement } from '../lib/importCsv'
import { modelFor, predict } from '../lib/ml/categorize.js'

/* ---------------- repeating transactions ---------------- */
function RecurringBody() {
  const { recurring = [], addRecurring, toggleRecurring, removeRecurring, budgets } = useApp()
  const today = isoDay(new Date())
  const [adding, setAdding] = useState(!recurring.length)
  const [type, setType] = useState('expense')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [every, setEvery] = useState('monthly')
  const [start, setStart] = useState(today)
  const cats = type === 'income' ? INCOME_CATEGORIES : expenseCategories(budgets)
  const cat = cats.includes(category) ? category : type === 'income' ? 'Salary' : 'Bills'
  const n = Number(amount)
  const ok = name.trim() && n > 0 && start >= today
  const total = monthlyTotal(recurring)

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    if (addRecurring({ name: name.trim(), amount: type === 'income' ? n : -n, category: cat, every, start })) {
      setName('')
      setAmount('')
      setAdding(false)
    }
  }

  return (
    <div className="form">
      {recurring.length ? (
        <>
          <p className="tool-sum">
            {t('In a typical month these add up to {out} out and {income} in.', { out: money(total.out), income: money(total.in) })}
          </p>
          <ul className="rule-list">
            {recurring.map((r) => (
              <li key={r.id} className={r.active ? '' : 'paused'}>
                <span className={`rule-ic ${r.amount > 0 ? 'in' : ''}`}>
                  <Icon name="replay" size={16} />
                </span>
                <div className="rule-main">
                  <b>{r.name}</b>
                  <small>
                    {t(EVERY_LABEL[r.every])} · {t(r.category)} ·{' '}
                    {r.active ? t('next on {date}', { date: shortDate(`${r.next}T12:00`) }) : t('Paused')}
                  </small>
                </div>
                <strong className={r.amount > 0 ? 'pos' : ''}>
                  {r.amount > 0 ? '+' : '-'}
                  {money(Math.abs(r.amount))}
                </strong>
                <button type="button" className="btn sm" onClick={() => toggleRecurring(r.id)}>
                  {r.active ? t('Pause') : t('Resume')}
                </button>
                <button type="button" className="icon-btn soft" onClick={() => removeRecurring(r.id)} aria-label={t('Remove {name}', { name: r.name })}>
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="tool-sum">{t('Set up rent, salary or a subscription once. It’s added by itself on its date, and your balance follows.')}</p>
      )}

      {adding ? (
        <form className="form rule-form" onSubmit={submit}>
          <div className="auth-switch" role="tablist">
            <button type="button" role="tab" aria-selected={type === 'expense'} className={type === 'expense' ? 'on' : ''} onClick={() => setType('expense')}>
              {t('Money out')}
            </button>
            <button type="button" role="tab" aria-selected={type === 'income'} className={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>
              {t('Money in')}
            </button>
          </div>
          <div className="field-row">
            <label className="field">
              <span>{t('Description')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={type === 'income' ? t('Salary, client payment…') : t('Rent, gym, streaming…')} />
            </label>
            <label className="field">
              <span>{t('Amount')}</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>{t('Category')}</span>
              <select value={cat} onChange={(e) => setCategory(e.target.value)}>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {t(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('How often')}</span>
              <select value={every} onChange={(e) => setEvery(e.target.value)}>
                {EVERY.map((x) => (
                  <option key={x} value={x}>
                    {t(EVERY_LABEL[x])}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>{t('First date')}</span>
            <input type="date" value={start} min={today} onChange={(e) => setStart(e.target.value || today)} />
            <small>{start === today ? t('Starts today: the first one is added straight away.') : t('Nothing is added until this date.')}</small>
          </label>
          <div className="budget-form-btns">
            {recurring.length ? (
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                {t('Cancel')}
              </button>
            ) : null}
            <button type="submit" className="btn solid" disabled={!ok}>
              <Icon name="replay" size={16} />
              {t('Set up repeat')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn solid lg block" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} stroke={2} />
          {t('Add a repeating transaction')}
        </button>
      )}
    </div>
  )
}

export function RecurringModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Repeating transactions')} sub={t('Rent, salary and subscriptions that add themselves')} width={560}>
      {open ? <RecurringBody /> : null}
    </Modal>
  )
}

/* ---------------- import a bank statement ---------------- */
const SHOWN = 300
const incomeCategory = (name) => (/salary|payroll|wages?\b|paycheck/i.test(name) ? 'Salary' : 'Other income')

function ImportBody({ onClose }) {
  const { transactions, categoryCorrections, budgets, importTransactions, correctCategory } = useApp()
  const input = useRef(null)
  const [file, setFile] = useState(null) // { name, rows, skipped }
  const [problem, setProblem] = useState('')
  const [flip, setFlip] = useState(false)
  const [off, setOff] = useState(() => new Set()) // row numbers the user unticked (or duplicates)
  const [picked, setPicked] = useState({}) // row number → category the user chose
  const [changeBalance, setChangeBalance] = useState(false)
  const cats = expenseCategories(budgets)

  // Grace's guess for each row, once per file
  const rows = useMemo(() => {
    if (!file) return []
    const model = modelFor(transactions ?? [], categoryCorrections ?? [])
    return file.rows.map((r, i) => {
      const amount = flip ? -r.amount : r.amount
      const guess = amount < 0 ? predict(model, r.name) : null
      return {
        i,
        ...r,
        amount,
        guess: amount > 0 ? incomeCategory(r.name) : guess?.category && cats.includes(guess.category) ? guess.category : 'Other',
        sure: amount > 0 || Boolean(guess?.category && !guess.ask),
        dup: isDuplicate({ ...r, amount }, transactions ?? []),
      }
    })
  }, [file, flip, transactions, categoryCorrections]) // eslint-disable-line react-hooks/exhaustive-deps

  const read = async (f) => {
    if (!f) return
    setProblem('')
    setFile(null)
    if (f.size > 5 * 1024 * 1024) return setProblem(t('That file is over 5 MB. Export a shorter date range and try again.'))
    let text
    try {
      text = await f.text()
    } catch {
      return setProblem(t('I couldn’t open that file.'))
    }
    const r = readStatement(text)
    if (r.problem === 'empty') return setProblem(t('That file is empty.'))
    if (r.problem) return setProblem(t('I couldn’t find a date and an amount column in that file. It needs to be a CSV export from your bank.'))
    // rows already in the account start unticked
    setOff(new Set(r.rows.map((row, i) => (isDuplicate(row, transactions ?? []) ? i : -1)).filter((i) => i >= 0)))
    setPicked({})
    setFlip(false)
    setFile({ name: f.name, rows: r.rows, skipped: r.skipped })
  }

  const chosen = rows.filter((r) => !off.has(r.i))
  const total = chosen.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100
  const dups = rows.filter((r) => r.dup).length
  const unsure = chosen.filter((r) => !r.sure && !picked[r.i]).length

  const submit = () => {
    if (!chosen.length) return
    importTransactions(chosen.map((r) => ({ date: r.date, name: r.name, amount: r.amount, category: picked[r.i] ?? r.guess })), { changeBalance })
    // every category the user fixed teaches the categorizer
    for (const r of chosen) if (picked[r.i] && picked[r.i] !== r.guess && r.amount < 0) correctCategory?.({ ids: [], text: r.name, from: r.guess, to: picked[r.i] })
    onClose()
  }

  if (!file)
    return (
      <div className="form">
        <button
          type="button"
          className="drop-zone"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            read(e.dataTransfer.files?.[0])
          }}
        >
          <Icon name="upload" size={26} />
          <b>{t('Choose a CSV file, or drop it here')}</b>
          <small>{t('In your bank’s website, look for Export or Download transactions and pick CSV.')}</small>
        </button>
        <input ref={input} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => read(e.target.files?.[0])} />
        {problem ? (
          <p className="auth-error" role="alert">
            {problem}
          </p>
        ) : null}
        <p className="tool-sum">
          {t('The file is read on this device and never uploaded. You check every row before anything is added, and {name} suggests the categories.', {
            name: ASSISTANT.name,
          })}
        </p>
      </div>
    )

  return (
    <div className="form">
      <p className="tool-sum">
        <b>{file.name}</b>: {t('Rows read: {n}.', { n: rows.length })}{' '}
        {file.skipped ? t('Left out, no date or amount: {n}.', { n: file.skipped }) : ''}{' '}
        {dups ? t('Already in your account, so unticked: {n}.', { n: dups }) : ''}{' '}
        {rows.length >= MAX_ROWS ? t('Only the first {n} rows are read at once.', { n: MAX_ROWS }) : ''}
      </p>
      <div className="import-opts">
        <label className="guard-ack">
          <input type="checkbox" checked={flip} onChange={(e) => (setFlip(e.target.checked), setPicked({}))} />
          {t('Spending shows as money in? Swap in and out')}
        </label>
        <button type="button" className="link" onClick={() => setOff(off.size ? new Set() : new Set(rows.map((r) => r.i)))}>
          {off.size ? t('Tick all') : t('Untick all')}
        </button>
      </div>
      <ul className="import-list">
        {rows.slice(0, SHOWN).map((r) => (
          <li key={r.i} className={off.has(r.i) ? 'off' : ''}>
            <input
              type="checkbox"
              checked={!off.has(r.i)}
              onChange={() =>
                setOff((cur) => {
                  const next = new Set(cur)
                  if (next.has(r.i)) next.delete(r.i)
                  else next.add(r.i)
                  return next
                })
              }
              aria-label={t('Add {name}', { name: r.name })}
            />
            <div className="imp-main">
              <b>{r.name}</b>
              <small>
                {shortDate(`${r.date}T12:00`)}
                {r.dup ? <em className="imp-dup">{t('Already added?')}</em> : null}
              </small>
            </div>
            <select
              className={!r.sure && !picked[r.i] ? 'unsure' : ''}
              value={picked[r.i] ?? r.guess}
              onChange={(e) => setPicked((p) => ({ ...p, [r.i]: e.target.value }))}
              aria-label={t('Category for {name}', { name: r.name })}
            >
              {(r.amount > 0 ? INCOME_CATEGORIES : cats).map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
            <strong className={r.amount > 0 ? 'pos' : ''}>
              {r.amount > 0 ? '+' : '-'}
              {money(Math.abs(r.amount))}
            </strong>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN ? (
        <p className="tool-sum">{t('Showing the first {n}. The other {m} are added with {name}’s category guesses; you can change them later.', { n: SHOWN, m: rows.length - SHOWN, name: ASSISTANT.name })}</p>
      ) : null}
      {unsure ? <p className="tool-sum">{t('Outlined categories are ones {name} wasn’t sure of ({n}). Check those.', { n: unsure, name: ASSISTANT.name })}</p> : null}
      <label className="budget-lock-opt">
        <input type="checkbox" checked={changeBalance} onChange={(e) => setChangeBalance(e.target.checked)} />
        <span>
          <b>{t('Also change my balance by {amount}', { amount: `${total >= 0 ? '+' : '-'}${money(Math.abs(total))}` })}</b>
          <small>{t('Leave this off if your balance here already matches your bank.')}</small>
        </span>
      </label>
      <div className="budget-form-btns">
        <button type="button" className="btn" onClick={() => setFile(null)}>
          {t('Choose another file')}
        </button>
        <button type="button" className="btn solid" disabled={!chosen.length} onClick={submit}>
          <Icon name="upload" size={16} />
          {chosen.length === 1 ? t('Add 1 transaction') : t('Add {n} transactions', { n: chosen.length })}
        </button>
      </div>
    </div>
  )
}

export function ImportModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Import a bank statement')} sub={t('Add many transactions at once from a CSV file')} width={640}>
      {open ? <ImportBody onClose={onClose} /> : null}
    </Modal>
  )
}
