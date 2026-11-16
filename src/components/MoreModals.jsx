/* ------------------------------------------------------------------
   Windows for one transaction (notes, tags, receipt, claim it back,
   account, delete), for accounts (add, edit, move money, reconcile)
   and for deleting transactions by date.
   ------------------------------------------------------------------ */
import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { Modal } from './ui'
import { AmountField } from './Modals'
import { useApp } from '../lib/store'
import { isoDay, money, signed, stamp } from '../lib/format'
import { t, tName } from '../lib/i18n'
import { expenseCategories, INCOME_CATEGORIES } from '../lib/stats'
import { ACCOUNT_ICON, ACCOUNT_LABEL, ACCOUNT_TYPES, allTags, cleanTag, DEDUCTIBLE, inAccount, inRange, MAIN, reconcile } from '../lib/ledger'
import { accountsEnabled } from '../lib/supabase'
import { receiptUrl, removeReceipt, uploadReceipt } from '../lib/receipts'

/* ---------------- tags: chips with an input ---------------- */
export function TagInput({ value = [], onChange, suggestions = [] }) {
  const [text, setText] = useState('')
  const add = (raw) => {
    const tag = cleanTag(raw)
    if (tag && !value.includes(tag) && value.length < 12) onChange([...value, tag])
    setText('')
  }
  const offer = suggestions.filter((s) => !value.includes(s) && s !== DEDUCTIBLE).slice(0, 6)
  return (
    <div className="tag-input">
      <div className="tag-chips">
        {value.map((tag) => (
          <span key={tag} className="tag-chip">
            #{tag}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== tag))} aria-label={t('Remove tag {tag}', { tag })}>
              <Icon name="close" size={11} stroke={2.2} />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(text)
            } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text && add(text)}
          placeholder={value.length ? '' : t('Add a tag, like work or trip')}
          aria-label={t('Tags')}
        />
      </div>
      {offer.length ? (
        <div className="tag-offer">
          {offer.map((s) => (
            <button key={s} type="button" className="chip sm" onClick={() => add(s)}>
              #{s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ---------------- the receipt photo on a transaction ---------------- */
function Receipt({ tx }) {
  const { user, updateTx, demo, toast } = useApp()
  const [url, setUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const path = tx.receipt?.path
  useEffect(() => {
    let alive = true
    if (path) receiptUrl(path).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null))
    return () => {
      alive = false
    }
  }, [path])
  if (!accountsEnabled || demo)
    return <small className="muted">{t('Receipt photos are kept with your account. Sign in to add one.')}</small>

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const r = await uploadReceipt(user.id, file)
      if (path) await removeReceipt(path).catch(() => null)
      updateTx(tx.id, { receipt: r })
      toast(t('Receipt added'), tName(tx.name), { icon: 'receipt' })
    } catch (err) {
      toast(
        t('Couldn’t add the receipt'),
        err?.setup ? t('Receipts aren’t set up yet: run the latest supabase/schema.sql.') : err?.notAllowed ? t('Use a photo or a PDF.') : err?.tooBig ? t('That file is over 10 MB.') : t('Try again in a minute.'),
        { icon: 'info', ms: 6000 },
      )
    }
    setBusy(false)
  }
  const remove = async () => {
    setBusy(true)
    await removeReceipt(path).catch(() => null)
    updateTx(tx.id, { receipt: null })
    setUrl(null)
    setBusy(false)
  }
  return (
    <div className="receipt-box">
      {path ? (
        url ? (
          tx.receipt.mime === 'application/pdf' ? (
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              <Icon name="file" size={16} /> {t('Open the PDF')}
            </a>
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="receipt-thumb">
              <img src={url} alt={t('Receipt for {name}', { name: tName(tx.name) })} />
            </a>
          )
        ) : (
          <small className="muted">{t('Loading…')}</small>
        )
      ) : null}
      <div className="receipt-acts">
        <label className={`btn sm ${busy ? 'disabled' : ''}`}>
          <Icon name="image" size={15} />
          {path ? t('Replace') : t('Add a photo')}
          <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={pick} disabled={busy} />
        </label>
        {path ? (
          <button type="button" className="btn sm" onClick={remove} disabled={busy}>
            <Icon name="trash" size={15} /> {t('Remove')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/* ---------------- one transaction ---------------- */
function TxDetailBody({ payload, onClose }) {
  const { transactions, updateTx, deleteTx, claimPaid, moneyAccounts = [], accountName, budgets, correctCategory, demo } = useApp()
  const tx = transactions.find((x) => x.id === payload?.id)
  const tags = useMemo(() => allTags(transactions), [transactions])
  const [note, setNote] = useState(tx?.note ?? '')
  const [claimFrom, setClaimFrom] = useState(tx?.claim?.from ?? '')
  const [sure, setSure] = useState(false)
  const [adjust, setAdjust] = useState(false)
  if (!tx) return <p className="muted">{t('This transaction is gone.')}</p>

  const moved = tx.status === 'Moved'
  const cats = tx.amount > 0 ? INCOME_CATEGORIES : expenseCategories(budgets)
  const deductible = (tx.tags ?? []).includes(DEDUCTIBLE)
  const setTags = (list) => updateTx(tx.id, { tags: list })

  return (
    <div className="form tx-detail">
      <div className="txd-top">
        <div>
          <b>{tName(tx.name)}</b>
          <small>
            {stamp(tx.date)} · {t(tx.method)} · {t(tx.status)}
          </small>
        </div>
        <strong className={`tx-amt ${tx.amount > 0 ? 'in' : ''}`}>{signed(tx.amount)}</strong>
      </div>

      <div className="field-row">
        {moved ? null : (
          <label className="field">
            <span>{t('Category')}</span>
            <select
              value={cats.includes(tx.category) ? tx.category : ''}
              disabled={demo}
              onChange={(e) => correctCategory({ ids: [tx.id], text: tx.name, from: tx.category, to: e.target.value })}
            >
              {cats.includes(tx.category) ? null : <option value="">{t(tx.category)}</option>}
              {cats.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        {moneyAccounts.length && !moved ? (
          <label className="field">
            <span>{t('Account')}</span>
            <select value={tx.account ?? MAIN} onChange={(e) => updateTx(tx.id, { account: e.target.value === MAIN ? undefined : e.target.value })}>
              <option value={MAIN}>{t('Main account')}</option>
              {moneyAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : moved ? (
          <div className="field">
            <span>{t('Account')}</span>
            <b>{accountName(tx.account ?? MAIN)}</b>
          </div>
        ) : null}
      </div>

      <label className="field">
        <span>{t('Note')}</span>
        <textarea
          rows={2}
          maxLength={280}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (tx.note ?? '') && updateTx(tx.id, { note: note.trim() })}
          placeholder={t('Anything to remember about it')}
        />
      </label>

      <div className="field">
        <span>{t('Tags')}</span>
        <TagInput value={(tx.tags ?? []).filter((x) => x !== DEDUCTIBLE)} onChange={(list) => setTags(deductible ? [...list, DEDUCTIBLE] : list)} suggestions={tags} />
      </div>

      {tx.amount < 0 && !moved ? (
        <>
          <label className="check-row">
            <input type="checkbox" checked={deductible} onChange={(e) => setTags(e.target.checked ? [...(tx.tags ?? []), DEDUCTIBLE] : (tx.tags ?? []).filter((x) => x !== DEDUCTIBLE))} />
            {t('Tax deductible (shows in the year-end tax summary)')}
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={Boolean(tx.claim)}
              disabled={tx.claim?.status === 'paid'}
              onChange={(e) => updateTx(tx.id, { claim: e.target.checked ? { from: claimFrom.trim(), status: 'open', amount: Math.abs(tx.amount) } : null })}
            />
            {t('To claim back (from work or a friend)')}
          </label>
          {tx.claim ? (
            <div className="claim-box">
              {tx.claim.status === 'paid' ? (
                <p className="muted">
                  <Icon name="check" size={14} /> {t('Paid back by {name} on {date}', { name: tx.claim.from || t('them'), date: stamp(tx.claim.paidAt) })}
                </p>
              ) : (
                <>
                  <label className="field">
                    <span>{t('Who pays it back?')}</span>
                    <input
                      value={claimFrom}
                      maxLength={40}
                      onChange={(e) => setClaimFrom(e.target.value)}
                      onBlur={() => updateTx(tx.id, { claim: { ...tx.claim, from: claimFrom.trim() } })}
                      placeholder={t('Work, Sam…')}
                    />
                  </label>
                  <button type="button" className="btn solid" onClick={() => claimPaid(tx.id)}>
                    <Icon name="receive" size={16} /> {t('Mark {amount} as paid back', { amount: money(Math.abs(tx.claim.amount ?? tx.amount)) })}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      <label className="check-row">
        <input type="checkbox" checked={Boolean(tx.cleared)} onChange={(e) => updateTx(tx.id, { cleared: e.target.checked })} />
        {t('Matches my bank statement (cleared)')}
      </label>

      <div className="field">
        <span>{t('Receipt')}</span>
        <Receipt tx={tx} />
      </div>

      <div className="txd-delete">
        {sure ? (
          <>
            {moved ? null : (
              <label className="check-row">
                <input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
                {t('Also undo it in my balance')}
              </label>
            )}
            <div className="row-btns">
              <button type="button" className="btn" onClick={() => setSure(false)}>
                {t('Keep it')}
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  if (tx.receipt?.path) removeReceipt(tx.receipt.path).catch(() => null)
                  deleteTx(tx.id, { adjust })
                  onClose()
                }}
              >
                <Icon name="trash" size={15} /> {t('Delete')}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="link danger" onClick={() => setSure(true)}>
            <Icon name="trash" size={14} /> {moved ? t('Delete this move (both sides)') : t('Delete this transaction')}
          </button>
        )}
      </div>
    </div>
  )
}

export function TxDetailModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Transaction')} sub={t('Notes, tags, receipt and more')} width={500}>
      {open ? <TxDetailBody key={payload?.id} payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- accounts: add or edit ---------------- */
function AccountForm({ payload, onClose }) {
  const { moneyAccounts = [], addAccount, updateAccount, removeAccount, cards = [], demo } = useApp()
  const acc = moneyAccounts.find((a) => a.id === payload?.id)
  const [type, setType] = useState(acc?.type ?? payload?.type ?? 'savings')
  const [name, setName] = useState(acc?.name ?? '')
  const [opening, setOpening] = useState(acc ? String(Math.abs(acc.opening)) : '')
  const [limit, setLimit] = useState(acc?.limit ? String(acc.limit) : '')
  const [closeDay, setCloseDay] = useState(acc?.closeDay ? String(acc.closeDay) : '')
  const [dueDay, setDueDay] = useState(acc?.dueDay ? String(acc.dueDay) : '')
  const [cardId, setCardId] = useState(acc?.cardId ?? '')
  const [remindDays, setRemindDays] = useState(String(acc?.remindDays ?? 3))
  const [sure, setSure] = useState(false)
  const credit = type === 'credit'
  const ok = name.trim() && !demo

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    const input = { name, type, opening: Number(opening) || 0, limit, closeDay, dueDay, cardId: cardId || null, remindDays }
    if (acc ? updateAccount(acc.id, input) : addAccount(input)) onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      {acc ? null : (
        <div className="acct-types" role="radiogroup" aria-label={t('Account type')}>
          {ACCOUNT_TYPES.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={type === k} className={`acct-type ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>
              <Icon name={ACCOUNT_ICON[k]} size={18} />
              {t(ACCOUNT_LABEL[k])}
            </button>
          ))}
        </div>
      )}
      <label className="field">
        <span>{t('Name')}</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={credit ? t('Visa card') : type === 'cash' ? t('Wallet cash') : t('High-yield savings')} autoFocus />
      </label>
      <AmountField
        value={opening}
        onChange={setOpening}
        hint={
          <small>
            {credit
              ? t('What you owe on it right now.')
              : acc
                ? t('What was in it when you added it. Changing this changes your balance by the difference.')
                : t('What’s in it now. It’s added to your balance, since the app didn’t count it yet.')}
          </small>
        }
      />
      {credit ? (
        <>
          <div className="field-row">
            <label className="field">
              <span>{t('Credit limit')}</span>
              <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))} placeholder="5000" />
            </label>
            {cards.length ? (
              <label className="field">
                <span>{t('Card')}</span>
                <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                  <option value="">{t('Not linked')}</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ••{c.last4}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="field-row">
            <label className="field">
              <span>{t('Statement closes on day')}</span>
              <input inputMode="numeric" value={closeDay} onChange={(e) => setCloseDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="25" />
            </label>
            <label className="field">
              <span>{t('Payment due on day')}</span>
              <input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="15" />
            </label>
          </div>
          <label className="field">
            <span>{t('Remind me before it’s due')}</span>
            <select value={remindDays} onChange={(e) => setRemindDays(e.target.value)}>
              {[0, 1, 2, 3, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? t('On the day') : n === 1 ? t('1 day before') : t('{n} days before', { n })}
                </option>
              ))}
            </select>
          </label>
          {cards.length ? <small className="muted">{t('Payments with a linked card go to this account by themselves.')}</small> : null}
        </>
      ) : null}
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name={acc ? 'check' : 'plus'} size={18} />
        {acc ? t('Save') : t('Add account')}
      </button>
      {acc ? (
        sure ? (
          <div className="row-btns">
            <button type="button" className="btn" onClick={() => setSure(false)}>
              {t('Keep it')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                removeAccount(acc.id)
                onClose()
              }}
            >
              {t('Remove {name}', { name: acc.name })}
            </button>
          </div>
        ) : (
          <button type="button" className="link danger" onClick={() => setSure(true)}>
            <Icon name="trash" size={14} /> {t('Remove this account')}
          </button>
        )
      ) : null}
    </form>
  )
}

/* ---------------- move money between accounts ---------------- */
function MoveForm({ payload, onClose }) {
  const { moneyAccounts = [], balances = {}, moveBetween, accountName } = useApp()
  const ids = [MAIN, ...moneyAccounts.map((a) => a.id)]
  const cash = moneyAccounts.find((a) => a.type === 'cash')
  const [from, setFrom] = useState(payload?.from ?? MAIN)
  const [to, setTo] = useState(payload?.to ?? (cash && payload?.atm ? cash.id : ids.find((x) => x !== (payload?.from ?? MAIN)) ?? MAIN))
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState(payload?.atm ? t('ATM withdrawal') : '')
  const n = Number(amount)
  const ok = n > 0 && from !== to
  const label = (id) => `${accountName(id)} · ${money(balances[id] ?? 0)}`

  const submit = (e) => {
    e.preventDefault()
    if (ok && moveBetween({ from, to, amount: n, note: note.trim() })) onClose()
  }
  return (
    <form className="form" onSubmit={submit}>
      <div className="field-row">
        <label className="field">
          <span>{t('From')}</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('To')}</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <AmountField value={amount} onChange={setAmount} hint={from === to ? <small className="err">{t('Pick two different accounts.')}</small> : null} />
      <label className="field">
        <span>{t('Note (optional)')}</span>
        <input value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder={t('ATM withdrawal, card payment…')} />
      </label>
      <small className="muted">{t('Moving money between your accounts doesn’t count as income or spending.')}</small>
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="transfer" size={18} />
        {n > 0 ? t('Move {amount}', { amount: money(n) }) : t('Enter an amount')}
      </button>
    </form>
  )
}

/* ---------------- reconcile an account with its statement ---------------- */
function ReconcileForm({ payload, onClose }) {
  const { moneyAccounts = [], transactions, balance, updateTx, finishReconcile, accountName, reconciled = {} } = useApp()
  const id = payload?.id ?? MAIN
  const [statement, setStatement] = useState('')
  const [until, setUntil] = useState(isoDay(new Date()))
  const rows = inAccount(moneyAccounts, transactions, id)
    .filter((x) => String(x.date).slice(0, 10) <= until)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 200)
  const r = reconcile({ accounts: moneyAccounts, transactions, balance, id, statement })
  const last = reconciled[id]
  const tickAll = () => rows.filter((x) => !x.cleared).forEach((x) => updateTx(x.id, { cleared: true }))

  return (
    <div className="form reconcile">
      <p className="muted">
        {t('Tick each transaction that’s on your {name} statement. When the cleared balance equals the statement’s ending balance, you’re reconciled.', {
          name: accountName(id),
        })}
        {last ? ` ${t('Last reconciled {date}.', { date: stamp(last.at) })}` : ''}
      </p>
      <div className="field-row">
        <label className="field">
          <span>{t('Statement ending balance')}</span>
          <div className="amount-input">
            <b>$</b>
            <input inputMode="decimal" placeholder="0.00" value={statement} onChange={(e) => setStatement(e.target.value.replace(/[^\d.-]/g, ''))} />
          </div>
        </label>
        <label className="field">
          <span>{t('Statement date')}</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value || isoDay(new Date()))} />
        </label>
      </div>
      <div className={`rec-sum ${r.matches ? 'ok' : r.difference != null ? 'off' : ''}`} role="status">
        <span>
          {t('Cleared balance')} <b>{money(r.cleared)}</b>
        </span>
        {r.difference == null ? null : r.matches ? (
          <span>
            <Icon name="check" size={15} /> {t('Matches the statement')}
          </span>
        ) : (
          <span>
            {t('Difference')} <b>{money(r.difference)}</b>
          </span>
        )}
      </div>
      <div className="rec-list">
        {rows.length ? (
          rows.map((x) => (
            <label key={x.id} className={`rec-row ${x.cleared ? 'on' : ''}`}>
              <input type="checkbox" checked={Boolean(x.cleared)} onChange={(e) => updateTx(x.id, { cleared: e.target.checked })} />
              <span>
                <b>{tName(x.name)}</b>
                <small>{stamp(x.date)}</small>
              </span>
              <strong className={x.amount > 0 ? 'in' : ''}>{signed(x.amount)}</strong>
            </label>
          ))
        ) : (
          <p className="muted">{t('No transactions in this account yet.')}</p>
        )}
      </div>
      <div className="row-btns">
        <button type="button" className="btn" onClick={tickAll} disabled={!rows.some((x) => !x.cleared)}>
          {t('Tick all')}
        </button>
        <button
          type="button"
          className="btn solid"
          disabled={!r.matches}
          onClick={() => {
            finishReconcile(id, statement)
            onClose()
          }}
        >
          <Icon name="check" size={16} /> {t('Finish')}
        </button>
      </div>
    </div>
  )
}

const ACCOUNT_TITLES = {
  add: ['Add an account', 'Checking, savings, cash or a credit card'],
  edit: ['Edit account', 'Name, opening balance and card details'],
  move: ['Move money', 'Between your own accounts'],
  reconcile: ['Reconcile', 'Check your account against a bank statement'],
}

export function AccountsModal({ open, payload, onClose }) {
  const mode = payload?.mode ?? 'add'
  const [title, sub] = ACCOUNT_TITLES[mode] ?? ACCOUNT_TITLES.add
  const Body = mode === 'move' ? MoveForm : mode === 'reconcile' ? ReconcileForm : AccountForm
  return (
    <Modal open={open} onClose={onClose} title={t(title)} sub={t(sub)} width={mode === 'reconcile' ? 560 : 480}>
      {open ? <Body payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- delete transactions by date ---------------- */
function DeleteRangeBody({ onClose }) {
  const { transactions, deleteRange } = useApp()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sure, setSure] = useState(false)
  const { hit } = inRange(transactions, from, to)
  const ready = from && to && from <= to
  return (
    <div className="form">
      <p className="muted">{t('Clear out old history without deleting your account. Your balance, budgets and goals stay as they are.')}</p>
      <div className="field-row">
        <label className="field">
          <span>{t('From')}</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => (setFrom(e.target.value), setSure(false))} />
        </label>
        <label className="field">
          <span>{t('To')}</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => (setTo(e.target.value), setSure(false))} />
        </label>
      </div>
      {ready ? (
        <p role="status">
          {hit.length === 1 ? t('1 transaction is in those dates.') : t('{n} transactions are in those dates.', { n: hit.length })}
        </p>
      ) : null}
      {sure ? (
        <div className="row-btns">
          <button type="button" className="btn" onClick={() => setSure(false)}>
            {t('Keep them')}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              deleteRange(from, to)
              onClose()
            }}
          >
            <Icon name="trash" size={15} /> {t('Delete {n} for good', { n: hit.length })}
          </button>
        </div>
      ) : (
        <button type="button" className="btn danger lg block" disabled={!ready || !hit.length} onClick={() => setSure(true)}>
          <Icon name="trash" size={17} /> {t('Delete these transactions')}
        </button>
      )}
    </div>
  )
}

export function DeleteRangeModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Delete by date')} sub={t('Remove the transactions between two dates')}>
      {open ? <DeleteRangeBody onClose={onClose} /> : null}
    </Modal>
  )
}
