/* ------------------------------------------------------------------
   Money between friends (real accounts): pay a friend or one of their
   requests, ask a friend for money, and split a bill between friends.
   The checks that matter (are you friends, is the request still open)
   run in Supabase; these windows add the balance check and Grace's
   payment guard on top.
   ------------------------------------------------------------------ */
import { useState } from 'react'
import Icon from './Icon'
import { Persona } from './Brand'
import { Modal, Success } from './ui'
import { AmountField } from './Modals'
import { useGuardCheck } from './useGuardCheck'
import { useApp } from '../lib/store'
import { money } from '../lib/format'
import { t } from '../lib/i18n'
import { EXPENSE_CATEGORIES } from '../lib/stats'
import { friendError, MAX_FRIEND_PAYMENT, MAX_GROUP, splitEqually } from '../lib/social'

const QUICK = [10, 25, 50, 100]
const round = (n) => Math.round(n * 100) / 100

/* ---------------- pay a friend (or one of their requests) ---------------- */
function PayBody({ payload, onClose }) {
  const { balance, transactions, social } = useApp()
  const friend = payload.friend
  const request = payload.request ?? null
  const [amount, setAmount] = useState(request ? String(Number(request.amount)) : '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const n = round(Number(amount))
  const over = n > balance
  const tooBig = n > MAX_FRIEND_PAYMENT
  const firstTime = !transactions.some((x) => x.name === `Transfer to ${friend.name}`)
  const [guardNotice, guardOk] = useGuardCheck(n, { payee: friend.name, firstTime })
  const ok = n > 0 && !over && !tooBig && guardOk && !busy

  if (done) return <Success title={t('Money sent')} body={t('{amount} is on its way to {name}.', { amount: money(done), name: friend.name })} />

  const submit = async (e) => {
    e.preventDefault()
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await social.pay(request ? { request: request.id, note } : { to: friend.id, amount: n, note })
      setDone(n)
      window.setTimeout(onClose, 1500)
    } catch (err) {
      setError(friendError(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="friend-to">
        <Persona name={friend.name} hue={friend.hue} src={friend.avatar} size={44} />
        <div>
          <b>{friend.name}</b>
          <small>{request ? t('Paying their request{note}', { note: request.note ? `: ${request.note}` : '' }) : friend.email}</small>
        </div>
      </div>
      {request ? (
        <div className="friend-fixed">
          <small>{t('Amount')}</small>
          <b>{money(n)}</b>
        </div>
      ) : (
        <>
          <AmountField
            value={amount}
            onChange={setAmount}
            bad={over || tooBig}
            hint={
              over ? (
                <small className="err">{t('That is more than your balance of {amount}.', { amount: money(balance) })}</small>
              ) : tooBig ? (
                <small className="err">{t('You can send up to {amount} at a time.', { amount: money(MAX_FRIEND_PAYMENT, '$', 0) })}</small>
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
        </>
      )}
      {request && over ? <small className="err">{t('That is more than your balance of {amount}.', { amount: money(balance) })}</small> : null}
      <label className="field">
        <span>{t('Note (optional)')}</span>
        <input value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder={t('Dinner, rent, birthday…')} />
      </label>
      {guardNotice}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="send" size={18} />
        {busy ? t('Sending…') : n > 0 ? t('Send {amount} to {name}', { amount: money(n), name: friend.name.split(' ')[0] }) : t('Enter an amount')}
      </button>
    </form>
  )
}

export function FriendPayModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Send Money')} sub={t('It lands in their balance straight away')}>
      {open && payload?.friend ? <PayBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- ask a friend for money ---------------- */
function AskBody({ payload, onClose }) {
  const { social, toast } = useApp()
  const friend = payload.friend
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const n = round(Number(amount))
  const ok = n > 0 && n <= MAX_FRIEND_PAYMENT && !busy

  const submit = async (e) => {
    e.preventDefault()
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await social.ask({ from: friend.id, amount: n, note })
      toast(t('Request sent'), t('{name} will get a request for {amount}.', { name: friend.name, amount: money(n) }), { icon: 'request' })
      onClose()
    } catch (err) {
      setError(friendError(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="friend-to">
        <Persona name={friend.name} hue={friend.hue} src={friend.avatar} size={44} />
        <div>
          <b>{friend.name}</b>
          <small>{friend.email}</small>
        </div>
      </div>
      <AmountField
        value={amount}
        onChange={setAmount}
        bad={n > MAX_FRIEND_PAYMENT}
        hint={<small>{t('They can pay it from the chat in one tap.')}</small>}
      />
      <div className="chips">
        {QUICK.map((q) => (
          <button key={q} type="button" className={`chip ${n === q ? 'on' : ''}`} onClick={() => setAmount(String(q))}>
            ${q}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{t('What it’s for')}</span>
        <input value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder={t('Concert tickets, groceries…')} />
      </label>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="request" size={18} />
        {busy ? t('Sending…') : n > 0 ? t('Ask {name} for {amount}', { name: friend.name.split(' ')[0], amount: money(n) }) : t('Enter an amount')}
      </button>
    </form>
  )
}

export function FriendAskModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Request money')} sub={t('Your friend can pay it in one tap')}>
      {open && payload?.friend ? <AskBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- split a bill ---------------- */
function SplitBody({ payload, onClose }) {
  const { social, addTransaction, toast } = useApp()
  // in a group: everyone else in it (they needn't be my friends), all picked to start with
  const group = payload?.group ? social.groups.find((g) => g.id === payload.group) : null
  const friends = group ? group.members.filter((x) => !x.me) : social.friends.filter((f) => f.status === 'friend')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [picked, setPicked] = useState(() => (group ? friends.map((f) => f.id) : payload?.friend ? [payload.friend] : []))
  const [includeMe, setIncludeMe] = useState(true)
  const [record, setRecord] = useState(true)
  const [category, setCategory] = useState('Food & Dining')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const total = round(Number(amount))
  const { shares, mine } = splitEqually(total, picked, includeMe)
  const each = shares[0]?.amount ?? 0
  const ok = title.trim() && total > 0 && shares.length && shares.every((s) => s.amount > 0 && s.amount <= MAX_FRIEND_PAYMENT) && !busy

  if (!friends.length)
    return (
      <div className="card-empty">
        <span>
          <Icon name="users" size={20} />
        </span>
        <strong>{t('No friends yet')}</strong>
        <p>{t('Add a friend on the Friends page first, then you can split bills with them.')}</p>
      </div>
    )

  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const submit = async (e) => {
    e.preventDefault()
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await social.split({ title: title.trim(), total, shares, group: group?.id ?? null })
      if (record) addTransaction({ name: title.trim(), amount: -total, category, method: 'Split with friends' })
      toast(
        t('Bill split'),
        shares.length === 1
          ? t('{name} was asked for {amount}.', { name: social.nameOf(shares[0].friend), amount: money(each) })
          : t('{count} friends were asked for {amount} each.', { count: shares.length, amount: money(each) }),
        { icon: 'receipt' },
      )
      onClose()
    } catch (err) {
      setError(friendError(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('What was it?')}</span>
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={t('Dinner at Luigi’s')} autoFocus />
      </label>
      <label className="field">
        <span>{t('Total bill')}</span>
        <div className="amount-input">
          <b>$</b>
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          <em>USD</em>
        </div>
      </label>
      <div className="field">
        <span>{t('Split with')}</span>
        <div className="people split-people">
          {friends.map((f, i) => (
            <button
              key={f.id}
              type="button"
              className={`person ${picked.includes(f.id) ? 'on' : ''}`}
              style={{ '--i': i }}
              onClick={() => toggle(f.id)}
              aria-pressed={picked.includes(f.id)}
            >
              <Persona name={f.name} hue={f.hue} src={f.avatar} size={46} />
              {f.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} />
        {t('Include my share')}
      </label>
      {shares.length && total > 0 ? (
        <div className="split-sum" role="status">
          <span>
            {t('Each friend pays')} <b>{money(each)}</b>
          </span>
          {includeMe ? (
            <span>
              {t('Your share')} <b>{money(mine)}</b>
            </span>
          ) : null}
        </div>
      ) : null}
      <label className="check-row">
        <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
        {total > 0 ? t('I paid {amount}: add it to my spending', { amount: money(total) }) : t('I paid the bill: add it to my spending')}
      </label>
      {record ? (
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
      ) : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="receipt" size={18} />
        {busy ? t('Sending…') : !picked.length ? t('Pick who to split with') : t('Split {amount}', { amount: money(total || 0) })}
      </button>
    </form>
  )
}

export function SplitModal({ open, payload, onClose }) {
  const { social } = useApp()
  const group = payload?.group ? social.groups.find((g) => g.id === payload.group) : null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? t('Split a bill in {name}', { name: group.name }) : t('Split a bill')}
      sub={t('Each friend gets a request for their share')}
      width={500}
    >
      {open ? <SplitBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- start a group ---------------- */
function GroupBody({ onClose }) {
  const { social, toast } = useApp()
  const friends = social.friends.filter((f) => f.status === 'friend')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const room = MAX_GROUP - 1
  const ok = name.trim() && picked.length && !busy

  if (!friends.length)
    return (
      <div className="card-empty">
        <span>
          <Icon name="users" size={20} />
        </span>
        <strong>{t('No friends yet')}</strong>
        <p>{t('Add a friend first, then you can make a group.')}</p>
      </div>
    )

  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < room ? [...list, id] : list))
  const submit = async (e) => {
    e.preventDefault()
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await social.newGroup({ name: name.trim(), members: picked })
      toast(t('Group created'), t('{name} is ready with {count} people.', { name: name.trim(), count: picked.length + 1 }), { icon: 'users' })
      onClose()
    } catch (err) {
      setError(friendError(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('Group name')}</span>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('Goa trip, Flat 4B, Football team…')} autoFocus />
      </label>
      <div className="field">
        <span>
          {t('Who’s in it?')} <em className="field-count">{t('{count} of {max}', { count: picked.length + 1, max: MAX_GROUP })}</em>
        </span>
        <div className="people split-people">
          {friends.map((f, i) => (
            <button
              key={f.id}
              type="button"
              className={`person ${picked.includes(f.id) ? 'on' : ''}`}
              style={{ '--i': i }}
              onClick={() => toggle(f.id)}
              aria-pressed={picked.includes(f.id)}
            >
              <Persona name={f.name} hue={f.hue} src={f.avatar} size={46} />
              {f.name.split(' ')[0]}
            </button>
          ))}
        </div>
        <small>{t('You can add up to {count} friends. Everyone in the group can chat and split bills together.', { count: room })}</small>
      </div>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn solid lg block" disabled={!ok}>
        <Icon name="users" size={18} />
        {busy ? t('Creating…') : picked.length ? t('Create group with {count} people', { count: picked.length + 1 }) : t('Pick friends to add')}
      </button>
    </form>
  )
}

export function GroupModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('New group')}
      sub={t('Chat and split bills with up to {count} people', { count: MAX_GROUP })}
      width={500}
    >
      {open ? <GroupBody onClose={onClose} /> : null}
    </Modal>
  )
}
