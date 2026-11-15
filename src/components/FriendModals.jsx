/* ------------------------------------------------------------------
   Money between friends (real accounts): pay a friend or one of their
   requests, ask a friend for money, and split a bill between friends.
   The checks that matter (are you friends, is the request still open)
   run in Supabase; these windows add the balance check and Grace's
   payment guard on top.
   ------------------------------------------------------------------ */
import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Persona } from './Brand'
import { Modal, Success } from './ui'
import { AmountField } from './Modals'
import { useGuardCheck } from './useGuardCheck'
import { useApp } from '../lib/store'
import { money } from '../lib/format'
import { t } from '../lib/i18n'
import { expenseCategories } from '../lib/stats'
import { addToGroupGoal, createGroupGoal, deleteGroupGoal, friendError, loadGroupGoals, MAX_FRIEND_PAYMENT, MAX_GROUP, splitEqually } from '../lib/social'
import { netText, paysText, settlePlan } from '../lib/settle'

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
  const { social, addTransaction, toast, budgets } = useApp()
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
            {expenseCategories(budgets).map((c) => (
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

/* ---------------- settle up a group ----------------
   Everyone's open debts in the group, and the fewest payments that clear
   them. Nobody ends up owing or being owed a different amount. */
function SettleBody({ payload, onClose }) {
  const { social, toast } = useApp()
  const group = social.groups.find((g) => g.id === payload?.group)
  const [debts, setDebts] = useState(null) // null while loading
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    if (!group) return undefined
    let alive = true
    social
      .groupDebts(group.id)
      .then((rows) => alive && setDebts(rows ?? []))
      .catch((err) => alive && setError(/group_debts|PGRST202|function/i.test(err?.message ?? '') ? 'setup' : friendError(err)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id])

  if (!group) return <p className="tool-sum">{t('That group isn’t available any more.')}</p>
  if (done !== null)
    return (
      <Success
        title={t('Settled up')}
        body={
          done === 1
            ? t('1 payment now clears everything. It can be paid in the group chat.')
            : done
              ? t('{n} payments now clear everything. Everyone can pay their part in the group chat.', { n: done })
              : t('Everyone’s square.')
        }
      />
    )
  if (error === 'setup')
    return (
      <p className="tool-sum">
        {t(
          'Settle up needs a one-time setup: run the latest supabase/schema.sql in your Supabase project (SQL Editor > New query > paste > Run), then try again.',
        )}
      </p>
    )
  if (error)
    return (
      <p className="auth-error" role="alert">
        {error}
      </p>
    )
  if (!debts) return <div className="friends-loading settle-loading" role="status" aria-label={t('Loading…')} />

  const plan = settlePlan(debts)
  const first = (id) => social.nameOf(id).split(' ')[0]
  const pays = (from, to) => paysText(t, from, to, social.me, first)
  const count = (n, one, many) => (n === 1 ? t(one) : t(many, { n }))
  const people = [...plan.net].filter(([, c]) => c !== 0).sort((a, b) => b[1] - a[1])

  if (plan.square)
    return (
      <div className="form">
        <div className="settle-square">
          <Icon name="check" size={22} />
          <b>{t('Everyone’s square')}</b>
          <small>{t('Nobody in {name} owes anyone right now.', { name: group.name })}</small>
        </div>
      </div>
    )

  const go = async () => {
    setBusy(true)
    try {
      const made = await social.settleGroup(group.id)
      toast(t('Settled up'), t('{name}: {before} payments became {after}.', { name: group.name, before: plan.before, after: made }), {
        icon: 'check',
      })
      setDone(made)
      window.setTimeout(onClose, 1800)
    } catch (err) {
      setError(/simplify_group_debts|PGRST202|function/i.test(err?.message ?? '') ? 'setup' : friendError(err))
    }
    setBusy(false)
  }

  return (
    <div className="form">
      <div className="settle-net">
        {people.map(([id, c]) => (
          <span key={id} className={`${c > 0 ? 'in' : 'out'} ${id === social.me ? 'me' : ''}`}>
            {netText(t, id, c, social.me, first, money)}
          </span>
        ))}
      </div>
      <div className="settle-cols">
        <section>
          <h3>{count(plan.before, 'Now: 1 payment', 'Now: {n} payments')}</h3>
          <ul>
            {debts.map((r) => (
              <li key={r.id}>
                {pays(r.payer, r.requester)} <b>{money(Number(r.amount))}</b>
              </li>
            ))}
          </ul>
        </section>
        <section className="after">
          <h3>{count(plan.after.length, 'After: 1 payment', 'After: {n} payments')}</h3>
          <ul>
            {plan.after.map((p, k) => (
              <li key={k} className={p.from === social.me || p.to === social.me ? 'me' : ''}>
                {pays(p.from, p.to)} <b>{money(p.amount)}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="tool-sum">
        {plan.saves > 0
          ? (plan.saves === 1 ? t('That’s 1 fewer payment.') : t('That’s {n} fewer payments.', { n: plan.saves })) +
            ' ' +
            t('Nobody ends up owing or being owed a different amount; only who pays whom changes. Everyone in the group sees the new payments.')
          : t('This is already the fewest payments. Settling up would just replace them with the same ones.')}
      </p>
      <button type="button" className="btn solid lg block" disabled={busy || plan.saves <= 0} onClick={go}>
        <Icon name="check" size={18} />
        {busy ? t('Settling up…') : t('Settle up')}
      </button>
    </div>
  )
}

export function SettleModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Settle up')} sub={t('The fewest payments that clear the group')} width={560}>
      {open ? <SettleBody payload={payload} onClose={onClose} /> : null}
    </Modal>
  )
}

/* ---------------- shared goals in a group ---------------- */
function GoalsBody({ payload }) {
  const { social, balance, addTransaction, toast } = useApp()
  const group = social.groups.find((g) => g.id === payload?.group)
  const [goals, setGoals] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [amounts, setAmounts] = useState({})
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!group) return undefined
    let alive = true
    loadGroupGoals(group.id)
      .then((list) => alive && setGoals(list))
      .catch((err) => alive && setError(/group_goals|relation|PGRST20|schema cache/i.test(err?.message ?? '') ? 'setup' : friendError(err)))
    return () => {
      alive = false
    }
  }, [group?.id, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) return <p className="tool-sum">{t('That group isn’t available any more.')}</p>
  if (error === 'setup')
    return <p className="tool-sum">{t('Shared goals need a one-time setup: run the latest supabase/schema.sql in your Supabase project, then try again.')}</p>
  const first = (id) => (id === social.me ? t('You') : social.nameOf(id).split(' ')[0])
  const me = group.members.find((m) => m.me)

  const create = async (e) => {
    e.preventDefault()
    if (!name.trim() || !(Number(target) > 0) || busy) return
    setBusy(true)
    try {
      await createGroupGoal({ group: group.id, name: name.trim(), target: Number(target) })
      setName('')
      setTarget('')
      setAdding(false)
      setTick((n) => n + 1)
      social.refresh?.()
    } catch (err) {
      setError(friendError(err))
    }
    setBusy(false)
  }
  const add = async (g) => {
    const n = Number(amounts[g.id])
    if (!(n > 0) || busy) return
    if (n > balance) return setError(t('That is more than your balance of {amount}.', { amount: money(balance) }))
    setBusy(true)
    try {
      await addToGroupGoal(g.id, n)
      // the money leaves your own balance, saved for the group
      addTransaction({ name: `${g.name} (${group.name})`, amount: -n, category: 'Savings', method: 'Shared goal' })
      setAmounts((a) => ({ ...a, [g.id]: '' }))
      setTick((k) => k + 1)
      social.refresh?.()
      if (g.saved + n >= g.target) toast(t('Goal reached! 🎉'), t('{name} is fully funded.', { name: g.name }), { icon: 'trophy' })
    } catch (err) {
      setError(friendError(err))
    }
    setBusy(false)
  }
  const remove = async (g) => {
    if (busy) return
    setBusy(true)
    try {
      await deleteGroupGoal(g.id)
      setTick((k) => k + 1)
      social.refresh?.()
    } catch (err) {
      setError(friendError(err))
    }
    setBusy(false)
  }

  return (
    <div className="form">
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {goals === null ? <div className="friends-loading settle-loading" role="status" aria-label={t('Loading…')} /> : null}
      {goals?.length === 0 && !adding ? <p className="tool-sum">{t('Save towards something together: a trip, a gift, a new sofa for the flat. Everyone sees the progress and who put in what.')}</p> : null}
      {goals?.map((g) => {
        const pct = Math.min(100, Math.round((g.saved / g.target) * 100))
        const canRemove = g.createdBy === social.me || me?.role === 'admin'
        return (
          <section key={g.id} className="gg-goal">
            <div className="gg-top">
              <b>{g.name}</b>
              <span>
                {money(g.saved)} <em>{t('of {amount}', { amount: money(g.target) })}</em>
              </span>
            </div>
            <div className="meter">
              <i style={{ '--p': `${pct}%` }} />
            </div>
            {g.byPerson.length ? (
              <p className="gg-who">{g.byPerson.map(([id, amt]) => `${first(id)} ${money(amt)}`).join(' · ')}</p>
            ) : (
              <p className="gg-who">{t('Nobody has added money yet.')}</p>
            )}
            {g.saved < g.target ? (
              <div className="gg-add">
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amounts[g.id] ?? ''}
                  onChange={(e) => setAmounts((a) => ({ ...a, [g.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                  aria-label={t('Amount to add to {name}', { name: g.name })}
                />
                <button type="button" className="btn solid sm" disabled={busy || !(Number(amounts[g.id]) > 0)} onClick={() => add(g)}>
                  {t('Add money')}
                </button>
                {canRemove ? (
                  <button type="button" className="btn sm" disabled={busy} onClick={() => remove(g)}>
                    {t('Remove')}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="gg-done">🎉 {t('Fully funded')}</p>
            )}
          </section>
        )
      })}
      {adding ? (
        <form className="form rule-form" onSubmit={create}>
          <div className="field-row">
            <label className="field">
              <span>{t('Goal')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t('Goa trip, Mum’s birthday…')} autoFocus />
            </label>
            <label className="field">
              <span>{t('Target')}</span>
              <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
            </label>
          </div>
          <div className="budget-form-btns">
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              {t('Cancel')}
            </button>
            <button type="submit" className="btn solid" disabled={busy || !name.trim() || !(Number(target) > 0)}>
              {t('Start the goal')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn solid lg block" onClick={() => setAdding(true)}>
          <Icon name="target" size={18} />
          {t('New shared goal')}
        </button>
      )}
      <p className="tool-sum">{t('Money you add comes out of your own balance, recorded as savings. Removing a goal doesn’t move money back.')}</p>
    </div>
  )
}

export function GroupGoalsModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Shared goals')} sub={t('Save towards something together')} width={520}>
      {open ? <GoalsBody payload={payload} /> : null}
    </Modal>
  )
}
