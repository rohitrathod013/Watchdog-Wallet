import { useState } from 'react'
import Icon from './Icon'
import { Persona } from './Brand'
import { Modal, Success } from './ui'
import { useApp } from '../lib/store'
import { money } from '../lib/format'
import { BRAND } from '../config'
import { t } from '../lib/i18n'

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
  const { contacts, balance, sendMoney } = useApp()
  const [to, setTo] = useState(payload?.to ?? contacts[0].id)
  const [amount, setAmount] = useState(payload?.amount ? String(payload.amount) : '')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(null)
  const n = Number(amount)
  const over = n > balance
  const person = contacts.find((c) => c.id === to)

  if (done) return <Success title={t('Money sent')} body={t('{amount} is on its way to {name}.', { amount: money(done.amount), name: done.name })} />

  const submit = (e) => {
    e.preventDefault()
    if (!n || over) return
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
      <button type="submit" className="btn solid lg block" disabled={!n || over}>
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
  const { user, receiveMoney, toast } = useApp()
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
  const [from, setFrom] = useState(contacts[1].id)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(null)
  const n = Number(amount)
  const person = contacts.find((c) => c.id === from)

  if (done)
    return <Success title={t('Request sent')} body={t('{name} will get a request for {amount}.', { name: done.name, amount: money(done.amount) })} />

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
