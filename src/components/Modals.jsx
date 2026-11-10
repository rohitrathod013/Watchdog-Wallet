import { useState } from 'react'
import Icon from './Icon'
import { Persona } from './Brand'
import { Modal, Segmented, Success } from './ui'
import { accountsEnabled } from '../lib/supabase'
import { MAX_TOPUP, MIN_TOPUP, startCardPayment } from '../lib/payments'
import { useApp } from '../lib/store'
import { isoDay, localIso, money } from '../lib/format'
import { BRAND } from '../config'
import { t } from '../lib/i18n'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/stats'
import { useGuardCheck } from './useGuardCheck'

const QUICK = [50, 100, 250, 500]

function People({ value, onChange }) {
  const { contacts } = useApp()
  return (
    <div className="people">
      {contacts.map((c, i) => (
        <button key={c.id} type="button" className={`person ${value === c.id ? 'on' : ''}`} style={{ '--i': i }} onClick={() => onChange(c.id)}>
          <Persona name={c.name} hue={c.hue} size={46} />
          {c.name.split(' ')[0]}
        </button>
      ))}
    </div>
  )
}

/** Shown in Send / Request when the account has nobody to pay yet. */
function NoContacts({ then }) {
  const { openModal } = useApp()
  return (
    <div className="card-empty">
      <span>
        <Icon name="user" size={20} />
      </span>
      <strong>{t('No contacts yet')}</strong>
      <p>{t('Add someone first, then you can send or request money.')}</p>
      <button type="button" className="btn solid lg" onClick={() => openModal('contact', { then })}>
        <Icon name="plus" size={18} stroke={2} />
        {t('Add contact')}
      </button>
    </div>
  )
}

function AmountField({ value, onChange, bad, hint }) {
  return (
    <label className="field">
      <span>{t('Amount')}</span>
      <div className={`amount-input ${bad ? 'bad' : ''}`}>
        <b>$</b>
        <input inputMode="decimal" placeholder="0.00" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
        <em>USD</em>
      </div>
      {hint}
    </label>
  )
}

/* ---------------- Send money ---------------- */
function SendBody({ payload, onClose }) {
  const { contacts, balance, sendMoney, transactions } = useApp()
  const [to, setTo] = useState(payload?.to ?? contacts[0]?.id)
  const [amount, setAmount] = useState(payload?.amount ? String(payload.amount) : '')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(null)
  const n = Number(amount)
  const over = n > balance
  const person = contacts.find((c) => c.id === to)
  const firstTime = Boolean(person) && !transactions.some((x) => x.name === `Transfer to ${person.name}`)
  const [guardNotice, guardOk] = useGuardCheck(n, { payee: person?.name, firstTime })

  if (done) return <Success title={t('Money sent')} body={t('{amount} is on its way to {name}.', { amount: money(done.amount), name: done.name })} />
  if (!person) return <NoContacts then="send" />

  const submit = (e) => {
    e.preventDefault()
    if (!n || over || !guardOk) return
    sendMoney({ to: person.name, amount: n, note })
    setDone({ amount: n, name: person.name })
    window.setTimeout(onClose, 1500)
  }

  return (
    <form className="form" onSubmit={submit}>
      <People value={to} onChange={setTo} />
      <AmountField
        value={amount}
        onChange={setAmount}
        bad={over}
        hint={
          over ? (
            <small className="err">{t('That is more than your balance of {amount}.', { amount: money(balance) })}</small>
          ) : (
            <small>{t('Available: {amount}', { amount: money(balance) })}</small>
          )
        }
      />
      <div className="chips">
        {QUICK.map((q) => (
          <button key={q} type="button" className={`chip ${n === q ? 'on' : ''}`} onClick={() => setAmount(String(q))}>
            ${q}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{t('Note (optional)')}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Dinner, rent, birthday…')} />
      </label>
      {guardNotice}
      <button type="submit" className="btn solid lg block" disabled={!n || over || !guardOk}>
        <Icon name="send" size={18} />
        {n ? t('Send {amount} to {name}', { amount: money(n), name: person.name.split(' ')[0] }) : t('Enter an amount')}
      </button>
    </form>
  )
}

export function SendModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Send Money')} sub={t('Instant transfer to anyone on {brand}', { brand: BRAND.name })}>
      {open ? <SendBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- Receive money ---------------- */
const QR = (() => {
  const cells = []
  // solid 3×3 markers in three corners, noise everywhere else
  const finder = (x, y, ox, oy) => {
    const dx = x - ox
    const dy = y - oy
    return dx >= 0 && dy >= 0 && dx <= 2 && dy <= 2 ? true : null
  }
  let seed = 11
  const r = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const f = finder(x, y, 0, 0) ?? finder(x, y, 8, 0) ?? finder(x, y, 0, 8)
      cells.push(f ?? r() > 0.52)
    }
  }
  return cells
})()

function ReceiveBody({ onClose }) {
  const { user, receiveMoney, toast, demo } = useApp()
  const acct = 'ST 4821 0093 7710'
  const copy = (text, what) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    toast(t('{what} copied', { what: t(what) }), text, { icon: 'copy' })
  }
  return (
    <div className="form">
      <div className="acct-box">
        <div className="qr" aria-label={t('Payment QR code')} role="img">
          {QR.map((on, i) => (
            <i key={i} className={on ? 'on' : ''} style={{ '--i': i }} />
          ))}
        </div>
        <div className="acct-lines">
          <div>
            <small>{t('Account holder')}</small>
            <b>{user.name}</b>
          </div>
          <div>
            <small>{t('Account number')}</small>
            <b>{acct}</b>
          </div>
          <div>
            <small>{t('Routing')}</small>
            <b>026 009 593</b>
          </div>
        </div>
      </div>
      <div className="field-row">
        <button type="button" className="btn lg" onClick={() => copy(acct, 'Account number')}>
          <Icon name="copy" size={17} />
          {t('Copy details')}
        </button>
        <button type="button" className="btn lg" onClick={() => copy(`https://${BRAND.domain}/pay/${user.first.toLowerCase()}`, 'Payment link')}>
          <Icon name="external" size={17} />
          {t('Share link')}
        </button>
      </div>
      {demo ? (
        <button
          type="button"
          className="btn solid lg block"
          onClick={() => {
            receiveMoney()
            onClose()
          }}
        >
          <Icon name="receive" size={19} />
          {t('Simulate an incoming payment')}
        </button>
      ) : null}
    </div>
  )
}

export function ReceiveModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Receive Money')} sub={t('Share your details or scan to pay')} width={480}>
      {open ? <ReceiveBody onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- Payment request ---------------- */
function RequestBody({ onClose }) {
  const { contacts, requestMoney } = useApp()
  const [from, setFrom] = useState(contacts[1]?.id ?? contacts[0]?.id)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(null)
  const n = Number(amount)
  const person = contacts.find((c) => c.id === from)

  if (done)
    return <Success title={t('Request sent')} body={t('{name} will get a request for {amount}.', { name: done.name, amount: money(done.amount) })} />
  if (!person) return <NoContacts then="request" />

  const submit = (e) => {
    e.preventDefault()
    if (!n) return
    requestMoney({ from: person.name, amount: n, note })
    setDone({ amount: n, name: person.name })
    window.setTimeout(onClose, 1500)
  }

  return (
    <form className="form" onSubmit={submit}>
      <People value={from} onChange={setFrom} />
      <AmountField value={amount} onChange={setAmount} />
      <label className="field">
        <span>{t('What is it for?')}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Concert tickets')} />
      </label>
      <button type="submit" className="btn solid lg block" disabled={!n}>
        <Icon name="request" size={18} />
        {n ? t('Request {amount} from {name}', { amount: money(n), name: person.name.split(' ')[0] }) : t('Enter an amount')}
      </button>
    </form>
  )
}

export function RequestModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Payment Request')} sub={t('Ask a contact to pay you back')}>
      {open ? <RequestBody onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- New savings goal ---------------- */
const GOAL_ICONS = ['sack', 'luggage', 'car', 'home', 'laptop', 'gift', 'plane', 'heart']

function GoalBody({ onClose }) {
  const { addGoal } = useApp()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [saved, setSaved] = useState('')
  const [icon, setIcon] = useState('home')
  const ok = name.trim() && Number(target) > 0

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    addGoal({ name: name.trim(), target: Number(target), saved: Math.min(Number(saved) || 0, Number(target)), icon })
    onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('Goal name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('New home deposit')} autoFocus />
      </label>
      <div className="field-row">
        <label className="field">
          <span>{t('Target')}</span>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="$25,000" />
        </label>
        <label className="field">
          <span>{t('Already saved')}</span>
          <input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value.replace(/[^\d.]/g, ''))} placeholder="$0" />
        </label>
      </div>
      <div className="field">
        <span>{t('Icon')}</span>
        <div className="icon-pick">
          {GOAL_ICONS.map((ic) => (
            <button key={ic} type="button" className={icon === ic ? 'on' : ''} onClick={() => setIcon(ic)} aria-label={ic} aria-pressed={icon === ic}>
              <Icon name={ic} size={20} />
            </button>
          ))}
        </div>
      </div>
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="plus" size={18} stroke={2} />
        {t('Create goal')}
      </button>
    </form>
  )
}

export function GoalModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('New Savings Goal')}
      sub={t('Set a target and {brand} will track it for you', { brand: BRAND.name })}
    >
      {open ? <GoalBody onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- Add a transaction by hand ---------------- */
function TransactionBody({ payload, onClose }) {
  const { addTransaction, balance, pots } = useApp()
  const [type, setType] = useState(payload?.type ?? 'expense')
  const [potId, setPotId] = useState(payload?.potId ?? '')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(type === 'income' ? 'Salary' : 'Food & Dining')
  const [date, setDate] = useState(isoDay(new Date()))
  const n = Number(amount)
  const [guardNotice, guardOk] = useGuardCheck(type === 'expense' ? n : 0)
  const ok = name.trim() && n > 0 && guardOk
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const pickType = (next) => {
    setType(next)
    setCategory(next === 'income' ? 'Salary' : 'Food & Dining')
  }

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    const today = isoDay(new Date())
    addTransaction({
      name: name.trim(),
      amount: type === 'income' ? n : -n,
      category,
      date: date === today ? localIso() : `${date}T12:00`,
      potId: type === 'expense' ? potId || null : null,
    })
    onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="auth-switch" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={type === 'expense'}
          className={type === 'expense' ? 'on' : ''}
          onClick={() => pickType('expense')}
        >
          {t('Money out')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={type === 'income'}
          className={type === 'income' ? 'on' : ''}
          onClick={() => pickType('income')}
        >
          {t('Money in')}
        </button>
      </div>
      <label className="field">
        <span>{t('Description')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'income' ? t('Salary, client payment…') : t('Groceries, rent, coffee…')}
          autoFocus
        />
      </label>
      <AmountField
        value={amount}
        onChange={setAmount}
        hint={type === 'expense' && n > balance ? <small>{t('This will take your balance below zero.')}</small> : null}
      />
      {type === 'expense' && pots.length ? (
        <label className="field">
          <span>{t('Pay from')}</span>
          <select value={potId} onChange={(e) => setPotId(e.target.value)}>
            <option value="">{t('Unassigned')}</option>
            {pots.map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.name)} · {money(p.amount)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="field-row">
        <label className="field">
          <span>{t('Category')}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('Date')}</span>
          <input type="date" value={date} max={isoDay(new Date())} onChange={(e) => setDate(e.target.value || isoDay(new Date()))} />
        </label>
      </div>
      {guardNotice}
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="plus" size={18} stroke={2} />
        {type === 'income' ? t('Add income') : t('Add expense')}
      </button>
    </form>
  )
}

export function TransactionModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Add transaction')} sub={t('Record money that came in or went out')}>
      {open ? <TransactionBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- Add a contact ---------------- */
function ContactBody({ payload, onClose }) {
  const { addContact, openModal } = useApp()
  const [name, setName] = useState('')
  const ok = name.trim().length > 1

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    const c = addContact(name.trim())
    if (payload?.then) openModal(payload.then, { to: c.id })
    else onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('Full name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Priya Sharma')} autoFocus />
      </label>
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="plus" size={18} stroke={2} />
        {t('Add contact')}
      </button>
    </form>
  )
}

export function ContactModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('New contact')} sub={t('People you send money to or request money from')}>
      {open ? <ContactBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- Add a bill ---------------- */
function BillBody({ onClose }) {
  const { addBill } = useApp()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Bills')
  const inWeek = new Date()
  inWeek.setDate(inWeek.getDate() + 7)
  const [dueDate, setDueDate] = useState(isoDay(inWeek))
  const n = Number(amount)
  const ok = name.trim() && n > 0 && dueDate

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    addBill({ name: name.trim(), amount: n, dueDate, category })
    onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('Bill name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Electricity, phone, gym…')} autoFocus />
      </label>
      <AmountField value={amount} onChange={setAmount} />
      <div className="field-row">
        <label className="field">
          <span>{t('Category')}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('Due date')}</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="plus" size={18} stroke={2} />
        {t('Add bill')}
      </button>
    </form>
  )
}

export function BillModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('New bill')} sub={t('We’ll show it in Upcoming Bills until you pay it')}>
      {open ? <BillBody onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- Add money (just the numbers, no bank) ---------------- */
const SOURCES = [...INCOME_CATEGORIES.slice(0, 3), 'Gift', 'Refund', 'Savings', 'Other income']

/** Top up with a real card payment through Stripe Checkout (test mode until live keys are set). */
function CardTopUp({ payload }) {
  const { pots, balance } = useApp()
  const [amount, setAmount] = useState('')
  const [potId, setPotId] = useState(payload?.potId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const n = Number(amount)
  const ok = n >= MIN_TOPUP && n <= MAX_TOPUP

  const submit = async (e) => {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setError('')
    try {
      // leaves the site for Stripe's payment page; the money is added when Stripe sends the user back
      await startCardPayment({ amount: Math.round(n * 100) / 100, potId })
    } catch (err) {
      setError(
        err?.setup
          ? t('Card payments need a one-time setup: deploy the payments function in Supabase and add your Stripe key.')
          : t('Couldn’t open the payment page. Try again in a minute.'),
      )
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <AmountField
        value={amount}
        onChange={setAmount}
        bad={amount !== '' && !ok}
        hint={
          <small>
            {amount !== '' && !ok
              ? t('Between {min} and {max}', { min: money(MIN_TOPUP, '$', 0), max: money(MAX_TOPUP, '$', 0) })
              : t('Your balance after: {amount}', { amount: money(balance + (n || 0)) })}
          </small>
        }
      />
      <div className="chips">
        {[25, 50, 100, 250].map((q) => (
          <button key={q} type="button" className={`chip ${n === q ? 'on' : ''}`} onClick={() => setAmount(String(q))}>
            ${q}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{t('Put it in')}</span>
        <select value={potId} onChange={(e) => setPotId(e.target.value)}>
          <option value="">{t('Unassigned (sort it later)')}</option>
          {pots.map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.name)}
            </option>
          ))}
        </select>
      </label>
      <div className="pay-note">
        <Icon name="shield" size={18} />
        <p>
          {t('You’ll pay on Stripe’s secure page. {brand} never sees your card number.', { brand: BRAND.name })}
          <br />
          <b>{t('Test mode:')}</b> {t('use card 4242 4242 4242 4242, any future date and any CVC. No real money moves.')}
        </p>
      </div>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn solid lg block" disabled={!ok || busy}>
        <Icon name="card" size={18} />
        {busy ? t('Opening Stripe…') : ok ? t('Pay {amount} by card', { amount: money(n) }) : t('Enter an amount')}
      </button>
    </form>
  )
}

function AddMoneyBody({ payload, onClose }) {
  const { demo } = useApp()
  const [how, setHow] = useState('record')
  const cards = accountsEnabled && !demo
  return (
    <>
      {cards ? (
        <Segmented
          className="pay-how"
          value={how}
          onChange={setHow}
          items={[
            { key: 'record', label: t('Record money I have') },
            { key: 'card', label: t('Pay by card') },
          ]}
        />
      ) : null}
      {how === 'card' && cards ? <CardTopUp payload={payload} /> : <RecordMoney payload={payload} onClose={onClose} />}
    </>
  )
}

function RecordMoney({ payload, onClose }) {
  const { addMoney, pots, balance } = useApp()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Salary')
  const [name, setName] = useState('')
  const [potId, setPotId] = useState(payload?.potId ?? '')
  const [date, setDate] = useState(isoDay(new Date()))
  const n = Number(amount)

  const submit = (e) => {
    e.preventDefault()
    if (!(n > 0)) return
    const today = isoDay(new Date())
    addMoney({ amount: n, category, name: name.trim() || t(category), date: date === today ? localIso() : `${date}T12:00`, potId: potId || null })
    onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      <AmountField
        value={amount}
        onChange={setAmount}
        hint={<small>{t('Your balance after: {amount}', { amount: money(balance + (n || 0)) })}</small>}
      />
      <div className="chips">
        {[100, 500, 1000, 2500].map((q) => (
          <button key={q} type="button" className={`chip ${n === q ? 'on' : ''}`} onClick={() => setAmount(String(q))}>
            ${q.toLocaleString('en-US')}
          </button>
        ))}
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t('Where it came from')}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {SOURCES.map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('Date')}</span>
          <input type="date" value={date} max={isoDay(new Date())} onChange={(e) => setDate(e.target.value || isoDay(new Date()))} />
        </label>
      </div>
      <label className="field">
        <span>{t('Note (optional)')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('October salary, birthday money…')} />
      </label>
      <label className="field">
        <span>{t('Put it in')}</span>
        <select value={potId} onChange={(e) => setPotId(e.target.value)}>
          <option value="">{t('Unassigned (sort it later)')}</option>
          {pots.map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.name)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn solid lg block" disabled={!(n > 0)}>
        <Icon name="plus" size={18} stroke={2} />
        {n > 0 ? t('Add {amount}', { amount: money(n) }) : t('Enter an amount')}
      </button>
    </form>
  )
}

export function AddMoneyModal({ open, payload, onClose }) {
  const { demo } = useApp()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Add money')}
      sub={
        accountsEnabled && !demo
          ? t('Record money you have, or top up by card.')
          : t('Type in money you have. No bank needed, it’s just for tracking.')
      }
    >
      {open ? <AddMoneyBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- Move money between pots ---------------- */
function MoveMoneyBody({ payload, onClose }) {
  const { pots, unassigned, moveMoney, openModal } = useApp()
  const [from, setFrom] = useState(payload?.from ?? 'unassigned')
  const [to, setTo] = useState(payload?.to ?? pots.find((p) => p.id !== payload?.from)?.id ?? 'unassigned')
  const [amount, setAmount] = useState('')
  const n = Number(amount)
  const have = from === 'unassigned' ? Math.max(0, unassigned) : (pots.find((p) => p.id === from)?.amount ?? 0)
  const over = n > have
  const ok = n > 0 && !over && from !== to

  if (!pots.length)
    return (
      <div className="card-empty">
        <span>
          <Icon name="safe" size={20} />
        </span>
        <strong>{t('No pots yet')}</strong>
        <p>{t('Create a pot first, then move money into it.')}</p>
        <button type="button" className="btn solid lg" onClick={() => openModal('pot')}>
          <Icon name="plus" size={18} stroke={2} />
          {t('New pot')}
        </button>
      </div>
    )

  const options = [{ id: 'unassigned', name: 'Unassigned', amount: unassigned }, ...pots]
  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    moveMoney({ from, to, amount: n })
    onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="field-row">
        <label className="field">
          <span>{t('From')}</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {t(o.name)} · {money(o.amount)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('To')}</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {t(o.name)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <AmountField
        value={amount}
        onChange={setAmount}
        bad={over}
        hint={
          over ? (
            <small className="err">{t('Only {amount} available there.', { amount: money(have) })}</small>
          ) : (
            <small>{t('Available: {amount}', { amount: money(have) })}</small>
          )
        }
      />
      <div className="chips">
        <button type="button" className="chip" onClick={() => setAmount(String(Math.round(have * 100) / 100))} disabled={have <= 0}>
          {t('All of it')}
        </button>
        <button type="button" className="chip" onClick={() => setAmount(String(Math.round((have / 2) * 100) / 100))} disabled={have <= 0}>
          {t('Half')}
        </button>
      </div>
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="transfer" size={18} />
        {from === to ? t('Pick two different places') : n > 0 ? t('Move {amount}', { amount: money(n) }) : t('Enter an amount')}
      </button>
    </form>
  )
}

export function MoveMoneyModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Move money')} sub={t('Shift money between your pots and unassigned')}>
      {open ? <MoveMoneyBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- New pot ---------------- */
const POT_ICONS = ['home', 'cart', 'safe', 'plane', 'gift', 'car', 'heart', 'laptop', 'sack', 'luggage']

function PotBody({ onClose }) {
  const { createPot, unassigned } = useApp()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('safe')
  const [amount, setAmount] = useState('')
  const n = Number(amount) || 0
  const over = n > Math.max(0, unassigned)
  const ok = name.trim() && !over

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    createPot({ name: name.trim(), icon, amount: n })
    onClose()
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('Pot name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Rent, groceries, holiday…')} autoFocus />
      </label>
      <div className="field">
        <span>{t('Icon')}</span>
        <div className="icon-pick">
          {POT_ICONS.map((ic) => (
            <button key={ic} type="button" className={icon === ic ? 'on' : ''} onClick={() => setIcon(ic)} aria-label={ic} aria-pressed={icon === ic}>
              <Icon name={ic} size={20} />
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>{t('Start with (optional)')}</span>
        <div className={`amount-input ${over ? 'bad' : ''}`}>
          <b>$</b>
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          <em>USD</em>
        </div>
        <small className={over ? 'err' : undefined}>
          {t('Taken from unassigned: {amount} available', { amount: money(Math.max(0, unassigned)) })}
        </small>
      </label>
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="plus" size={18} stroke={2} />
        {t('Create pot')}
      </button>
    </form>
  )
}

export function PotModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('New pot')} sub={t('Set money aside for something specific')}>
      {open ? <PotBody onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- Grace's activity: the audit trail ---------------- */
function ActivityBody() {
  const { activity } = useApp()
  if (!activity.length)
    return (
      <div className="card-empty">
        <span>
          <Icon name="shield" size={20} />
        </span>
        <strong>{t('Nothing yet')}</strong>
        <p>{t('Every time Grace changes something for you, it’s listed here with what you asked and why.')}</p>
      </div>
    )
  return (
    <ol className="activity-list">
      {activity.map((a) => (
        <li key={a.id}>
          <div className="activity-top">
            <b>{a.action}</b>
            <time dateTime={a.at}>{new Date(a.at).toLocaleString()}</time>
          </div>
          {a.detail ? <small>{a.detail}</small> : null}
          <p>
            <span>{t('You asked')}</span> “{a.request}”
          </p>
        </li>
      ))}
    </ol>
  )
}

export function ActivityModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Grace’s activity')} sub={t('Everything Grace has done on your account, newest first')} width={520}>
      {open ? <ActivityBody /> : null}
    </Modal>
  )
}

/* ---------------- Invest: record buying a coin or stock ---------------- */
const qtyText = (n) =>
  n >= 1 ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : n.toLocaleString(undefined, { maximumSignificantDigits: 4 })

function InvestBody({ payload, onClose }) {
  const { pots, unassigned, invest } = useApp()
  const [amount, setAmount] = useState(payload?.amount ? String(payload.amount) : '')
  const [price, setPrice] = useState(payload?.price ? String(+Number(payload.price).toPrecision(8)) : '')
  const [potId, setPotId] = useState('')
  const [done, setDone] = useState(null)
  const n = Number(amount)
  const each = Number(price)
  const from = potId ? pots.find((p) => p.id === potId) : null
  const have = from ? from.amount : Math.max(0, unassigned)
  const over = n > have
  const qty = n > 0 && each > 0 ? n / each : 0
  const [guardNotice, guardOk] = useGuardCheck(n)
  const ok = qty > 0 && !over && guardOk

  if (done)
    return (
      <Success
        title={t('Investment recorded')}
        body={t('{qty} {symbol} for {amount}.', { qty: qtyText(done.qty), symbol: done.symbol, amount: money(done.amount) })}
      />
    )

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    invest({ kind: payload.kind, asset: payload.asset, name: payload.name, symbol: payload.symbol, amount: n, price: each, potId: potId || null })
    setDone({ qty, symbol: payload.symbol, amount: n })
    window.setTimeout(onClose, 1300)
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="invest-head">
        <b>{payload?.name}</b>
        <small>
          {payload?.symbol} · {payload?.kind === 'crypto' ? t('Crypto') : t('Stocks')}
        </small>
      </div>
      <AmountField
        value={amount}
        onChange={setAmount}
        bad={over}
        hint={over ? <small className="bad">{t('You only have {amount} there.', { amount: money(have) })}</small> : null}
      />
      <div className="chips">
        {QUICK.map((q) => (
          <button key={q} type="button" className={`chip ${n === q ? 'on' : ''}`} onClick={() => setAmount(String(q))}>
            ${q}
          </button>
        ))}
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t('Price per unit')}</span>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className="field">
          <span>{t('Pay from')}</span>
          <select value={potId} onChange={(e) => setPotId(e.target.value)}>
            <option value="">
              {t('Unassigned')} · {money(Math.max(0, unassigned))}
            </option>
            {pots.map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.name)} · {money(p.amount)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="invest-preview">
        {qty > 0
          ? t('You’ll get about **{qty} {symbol}**.', { qty: qtyText(qty), symbol: payload.symbol }).replace(/\*\*/g, '')
          : t('Enter an amount to see how much you get.')}
      </p>
      <p className="form-note">
        {t('This records the purchase in {brand} and tracks its value live. No real trade is placed, so buy it with your broker or exchange too.', {
          brand: BRAND.name,
        })}
      </p>
      {guardNotice}
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="trendUp" size={18} stroke={2} />
        {t('Buy {symbol}', { symbol: payload?.symbol ?? '' })}
      </button>
    </form>
  )
}

export function InvestModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Invest')} sub={t('Record buying a coin or stock with money from your balance')}>
      {open ? <InvestBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- Sell: record selling part or all of a holding ---------------- */
function SellBody({ payload, onClose }) {
  const { holdings, sellHolding } = useApp()
  const h = holdings.find((x) => x.id === payload?.id)
  const [share, setShare] = useState(100)
  const [price, setPrice] = useState(payload?.price ? String(+Number(payload.price).toPrecision(8)) : '')
  const [done, setDone] = useState(null)
  if (done) return <Success title={t('Sale recorded')} body={t('{amount} back in your balance.', { amount: money(done.value) })} />
  if (!h) return <p className="form-note">{t('That holding is gone.')}</p>
  const each = Number(price)
  const qty = (h.qty * share) / 100
  const value = qty * each
  const gain = value - h.cost * (share / 100)
  const ok = qty > 0 && each > 0

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    const r = sellHolding({ id: h.id, qty: share >= 100 ? h.qty : qty, price: each })
    setDone(r ?? { value })
    window.setTimeout(onClose, 1300)
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="invest-head">
        <b>{h.name}</b>
        <small>{t('You hold {qty} {symbol}, bought for {amount}', { qty: qtyText(h.qty), symbol: h.symbol, amount: money(h.cost) })}</small>
      </div>
      <div className="chips">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} type="button" className={`chip ${share === p ? 'on' : ''}`} onClick={() => setShare(p)}>
            {p === 100 ? t('All') : `${p}%`}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{t('Price per unit')}</span>
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} autoFocus={!payload?.price} />
      </label>
      <p className="invest-preview">
        {ok
          ? `${t('Selling {qty} {symbol} for {amount}', { qty: qtyText(qty), symbol: h.symbol, amount: money(value) })} · ${gain >= 0 ? '+' : '−'}${money(Math.abs(gain))} ${gain >= 0 ? t('profit') : t('loss')}`
          : t('Enter the price to see what you get.')}
      </p>
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="receive" size={18} stroke={2} />
        {t('Sell {symbol}', { symbol: h.symbol })}
      </button>
    </form>
  )
}

export function SellModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Sell')} sub={t('Record selling a holding. The money goes back to your balance.')}>
      {open ? <SellBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}
