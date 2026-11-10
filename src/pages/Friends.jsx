/* ------------------------------------------------------------------
   Friends: connect with other Watchdog Wallet accounts, chat, send and
   request money, and split bills. Live through Supabase Realtime.
   ------------------------------------------------------------------ */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { Persona } from '../components/Brand'
import { PageHead, Stage } from '../components/ui'
import { useApp } from '../lib/store'
import { accountsEnabled } from '../lib/supabase'
import { friendError } from '../lib/social'
import { money, shortDate } from '../lib/format'
import { t, tMonths } from '../lib/i18n'
import { BRAND } from '../config'

const when = (iso) => {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const today = new Date().toDateString() === d.toDateString()
  return today ? time : `${tMonths(shortDate(iso))} · ${time}`
}

const STATUS = { pending: 'Pending', paid: 'Paid', declined: 'Declined', cancelled: 'Cancelled' }

function Gate({ icon, title, body, action, onAction }) {
  return (
    <section className="card friends-gate rv" style={{ '--i': 1 }}>
      <span className="ic-ring">
        <Icon name={icon} size={22} />
      </span>
      <h2 className="card-h">{title}</h2>
      <p>{body}</p>
      {action ? (
        <button type="button" className="btn solid lg" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </section>
  )
}

/* ---------------- add a friend / invite link ---------------- */
function AddFriend() {
  const { social, toast } = useApp()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null) // { tone, text }

  const submit = async (e) => {
    e.preventDefault()
    const value = email.trim()
    if (!value || busy) return
    setBusy(true)
    setNote(null)
    try {
      const r = await social.addFriend(value)
      const text = {
        sent: t('Friend request sent to {name}.', { name: r.name }),
        accepted: t('You and {name} are now friends.', { name: r.name }),
        already: t('You and {name} are already friends.', { name: r.name }),
        pending: t('You already asked {name}. Waiting for them to accept.', { name: r.name }),
        self: t('That’s your own email.'),
        not_found: t('Nobody with that email is on {brand} yet. Send them your invite link below.', { brand: BRAND.name }),
      }[r.status]
      setNote({ tone: ['sent', 'accepted', 'already'].includes(r.status) ? 'good' : 'info', text })
      if (['sent', 'accepted'].includes(r.status)) setEmail('')
    } catch (err) {
      setNote({ tone: 'bad', text: friendError(err) })
    }
    setBusy(false)
  }

  const copy = () => {
    navigator.clipboard?.writeText(social.inviteUrl).catch(() => {})
    toast(t('Invite link copied'), t('Send it to a friend. When they open it and log in, you’re connected.'), { icon: 'copy' })
  }
  const share = () =>
    navigator
      .share?.({
        title: BRAND.name,
        text: t('Be my friend on {brand}, so we can split bills and pay each other back.', { brand: BRAND.name }),
        url: social.inviteUrl,
      })
      .catch(() => {})

  return (
    <section className="card add-friend rv" style={{ '--i': 1 }}>
      <div className="c-head">
        <div>
          <h2 className="card-h">{t('Add a friend')}</h2>
          <p className="card-sub">{t('Find someone by the email they use on {brand}', { brand: BRAND.name })}</p>
        </div>
        <span className="ic-ring">
          <Icon name="users" size={19} />
        </span>
      </div>
      <form className="add-row" onSubmit={submit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="friend@example.com"
          aria-label={t('Friend’s email')}
        />
        <button type="submit" className="btn solid" disabled={!email.trim() || busy}>
          {busy ? t('Adding…') : t('Add')}
        </button>
      </form>
      {note ? (
        <p className={`add-note ${note.tone}`} role="status">
          {note.text}
        </p>
      ) : null}
      {social.inviteUrl ? (
        <div className="invite">
          <small>{t('Or share your invite link')}</small>
          <div className="invite-row">
            <input readOnly value={social.inviteUrl} onFocus={(e) => e.target.select()} aria-label={t('Your invite link')} />
            <button type="button" className="btn sm" onClick={copy}>
              <Icon name="copy" size={15} />
              {t('Copy')}
            </button>
            {navigator.share ? (
              <button type="button" className="btn sm" onClick={share} aria-label={t('Share')}>
                <Icon name="external" size={15} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* ---------------- friend requests and money waiting on you ---------------- */
function Waiting() {
  const { social, openModal } = useApp()
  const [busy, setBusy] = useState(null)
  const incoming = social.friends.filter((f) => f.status === 'incoming')
  if (!incoming.length && !social.toPay.length) return null
  const act = async (id, work) => {
    setBusy(id)
    await work().catch(() => null)
    setBusy(null)
  }
  const friendOf = (id) => social.friends.find((f) => f.id === id)
  return (
    <section className="card waiting-card rv" style={{ '--i': 2 }}>
      <h2 className="card-h">{t('Waiting for you')}</h2>
      <div className="wait-list">
        {incoming.map((f) => (
          <div key={f.connId} className="wait-row">
            <Persona name={f.name} hue={f.hue} size={40} />
            <div>
              <b>{f.name}</b>
              <small>{t('wants to be friends')}</small>
            </div>
            <button type="button" className="btn sm solid" disabled={busy === f.connId} onClick={() => act(f.connId, () => social.accept(f.connId))}>
              {t('Accept')}
            </button>
            <button type="button" className="btn sm" disabled={busy === f.connId} onClick={() => act(f.connId, () => social.removeFriend(f.connId))}>
              {t('Decline')}
            </button>
          </div>
        ))}
        {social.toPay.map((r) => {
          const f = friendOf(r.requester)
          return (
            <div key={r.id} className="wait-row">
              <Persona name={social.nameOf(r.requester)} hue={f?.hue ?? 20} size={40} />
              <div>
                <b>{t('{name} asked for {amount}', { name: social.nameOf(r.requester), amount: money(Number(r.amount)) })}</b>
                <small>{r.note || (r.split_id ? t('Split bill') : t('No note'))}</small>
              </div>
              <button
                type="button"
                className="btn sm solid"
                disabled={!f || f.status !== 'friend'}
                onClick={() => openModal('friendPay', { friend: f, request: r })}
              >
                {t('Pay')}
              </button>
              <button type="button" className="btn sm" disabled={busy === r.id} onClick={() => act(r.id, () => social.decline(r.id))}>
                {t('Decline')}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ---------------- the list of friends ---------------- */
function preview(m, me, social) {
  if (!m) return t('Say hello 👋')
  const mine = m.sender === me
  if (m.kind === 'text') return `${mine ? `${t('You')}: ` : ''}${m.body}`
  if (m.kind === 'payment') {
    const x = social.transfers.get(m.ref)
    const amount = money(Number(x?.amount ?? 0))
    return mine ? t('You sent {amount}', { amount }) : t('Sent you {amount}', { amount })
  }
  const r = social.requests.get(m.ref)
  const amount = money(Number(r?.amount ?? 0))
  if (m.kind === 'split')
    return mine ? t('You split “{title}”', { title: m.body }) : t('Split “{title}”: your share is {amount}', { title: m.body, amount })
  return mine ? t('You asked for {amount}', { amount }) : t('Asked you for {amount}', { amount })
}

function FriendList({ selected, onPick }) {
  const { social } = useApp()
  const [busy, setBusy] = useState(null)
  const list = social.friends.filter((f) => f.status !== 'incoming')
  return (
    <section className="card friend-list rv" style={{ '--i': 3 }}>
      <div className="c-head">
        <h2 className="card-h">{t('Friends')}</h2>
        <span className="pill-tag">{social.friends.filter((f) => f.status === 'friend').length}</span>
      </div>
      {!list.length ? (
        <p className="friend-empty">{t('No friends yet. Add someone by email or share your invite link.')}</p>
      ) : (
        <ul>
          {list.map((f) => (
            <li key={f.connId}>
              {f.status === 'outgoing' ? (
                <div className="friend-row muted">
                  <Persona name={f.name} hue={f.hue} size={42} />
                  <div className="fr-main">
                    <b>{f.name}</b>
                    <small>{t('Friend request sent')}</small>
                  </div>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busy === f.connId}
                    onClick={async () => {
                      setBusy(f.connId)
                      await social.removeFriend(f.connId).catch(() => null)
                      setBusy(null)
                    }}
                  >
                    {t('Cancel')}
                  </button>
                </div>
              ) : (
                <button type="button" className={`friend-row ${selected === f.id ? 'on' : ''}`} onClick={() => onPick(f.id)}>
                  <Persona name={f.name} hue={f.hue} size={42} />
                  <div className="fr-main">
                    <b>{f.name}</b>
                    <small>{preview(f.last, social.me, social)}</small>
                  </div>
                  <div className="fr-side">
                    {f.unread ? <em className="badge">{f.unread}</em> : null}
                    {f.owesMe ? <span className="owe in">{t('owes you {amount}', { amount: money(f.owesMe) })}</span> : null}
                    {f.iOwe ? <span className="owe out">{t('you owe {amount}', { amount: money(f.iOwe) })}</span> : null}
                  </div>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---------------- chat ---------------- */
function MoneyCard({ m, friend }) {
  const { social, openModal } = useApp()
  const [busy, setBusy] = useState(false)
  const mine = m.sender === social.me
  if (m.kind === 'payment') {
    const x = social.transfers.get(m.ref)
    const amount = money(Number(x?.amount ?? 0))
    return (
      <div className={`money-msg payment ${mine ? 'mine' : ''}`}>
        <span className="mm-ic">
          <Icon name={mine ? 'arrowUpRight' : 'arrowDown'} size={17} />
        </span>
        <div>
          <b>{mine ? t('You sent {amount}', { amount }) : t('{name} sent you {amount}', { name: friend.name.split(' ')[0], amount })}</b>
          {m.body ? <small>{m.body}</small> : null}
        </div>
      </div>
    )
  }
  const r = social.requests.get(m.ref)
  if (!r) return null
  const amount = money(Number(r.amount))
  const split = m.kind === 'split' ? social.splits.get(r.split_id) : null
  const iPay = r.payer === social.me
  const run = async (work) => {
    setBusy(true)
    await work().catch(() => null)
    setBusy(false)
  }
  return (
    <div className={`money-msg request ${mine ? 'mine' : ''} ${r.status}`}>
      <span className="mm-ic">
        <Icon name={split ? 'receipt' : 'request'} size={17} />
      </span>
      <div>
        {split || m.kind === 'split' ? (
          <>
            <b>{t('Split: {title}', { title: m.body })}</b>
            <small>
              {split ? t('Bill {total}', { total: money(Number(split.total)) }) + ' · ' : ''}
              {iPay ? t('your share is {amount}', { amount }) : t('{name}’s share is {amount}', { name: friend.name.split(' ')[0], amount })}
            </small>
          </>
        ) : (
          <>
            <b>{iPay ? t('{name} asked you for {amount}', { name: friend.name.split(' ')[0], amount }) : t('You asked for {amount}', { amount })}</b>
            {r.note ? <small>{r.note}</small> : null}
          </>
        )}
        <div className="mm-foot">
          <span className={`status ${r.status}`}>{t(STATUS[r.status])}</span>
          {r.status === 'pending' && iPay ? (
            <>
              <button type="button" className="btn sm solid" onClick={() => openModal('friendPay', { friend, request: r })}>
                {t('Pay {amount}', { amount })}
              </button>
              <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => social.decline(r.id))}>
                {t('Decline')}
              </button>
            </>
          ) : null}
          {r.status === 'pending' && !iPay ? (
            <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => social.cancel(r.id))}>
              {t('Cancel request')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Chat({ friend, onBack }) {
  const { social, openModal } = useApp()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const scroller = useRef(null)
  const thread = social.messages.filter((m) => m.sender === friend.id || m.recipient === friend.id)
  const last = thread[thread.length - 1]?.id

  // keep the newest message in view, and mark the thread read while it's open
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [last, friend.id])
  useEffect(() => {
    if (friend.unread) social.read(friend.id)
  }, [friend.id, friend.unread, social])

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    setError('')
    try {
      await social.chat(friend.id, body.slice(0, 2000))
      setText('')
    } catch (err) {
      setError(friendError(err))
    }
    setBusy(false)
  }

  return (
    <section className="card chat-card rv" style={{ '--i': 2 }}>
      <header className="chat-head">
        <button type="button" className="icon-btn soft chat-back" onClick={onBack} aria-label={t('Back to friends')}>
          <Icon name="chevLeft" size={18} />
        </button>
        <Persona name={friend.name} hue={friend.hue} size={44} />
        <div className="ch-main">
          <b>{friend.name}</b>
          <small>{friend.email}</small>
        </div>
        <button type="button" className="icon-btn soft" onClick={() => setConfirmRemove((v) => !v)} aria-label={t('Remove friend')}>
          <Icon name="dotsH" size={18} />
        </button>
      </header>
      {confirmRemove ? (
        <div className="acct-confirm danger chat-remove">
          <p>{t('Remove {name} from your friends? Your chat and past payments stay in your history.', { name: friend.name })}</p>
          <div>
            <button
              type="button"
              className="btn solid danger"
              onClick={() =>
                social
                  .removeFriend(friend.connId)
                  .then(onBack)
                  .catch(() => null)
              }
            >
              {t('Remove')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      ) : null}
      <div className="chat-actions">
        <button type="button" className="btn solid" onClick={() => openModal('friendPay', { friend })}>
          <Icon name="send" size={16} />
          {t('Send')}
        </button>
        <button type="button" className="btn" onClick={() => openModal('friendAsk', { friend })}>
          <Icon name="request" size={16} />
          {t('Request')}
        </button>
        <button type="button" className="btn" onClick={() => openModal('split', { friend: friend.id })}>
          <Icon name="receipt" size={16} />
          {t('Split a bill')}
        </button>
      </div>
      {friend.owesMe || friend.iOwe ? (
        <div className="settle">
          {friend.owesMe ? (
            <span className="owe in">{t('{name} owes you {amount}', { name: friend.name.split(' ')[0], amount: money(friend.owesMe) })}</span>
          ) : null}
          {friend.iOwe ? (
            <span className="owe out">{t('You owe {name} {amount}', { name: friend.name.split(' ')[0], amount: money(friend.iOwe) })}</span>
          ) : null}
        </div>
      ) : null}
      <div className="chat-scroll" ref={scroller}>
        {!thread.length ? <p className="chat-empty">{t('No messages yet. Say hello, or split your next dinner.')}</p> : null}
        {thread.map((m) => {
          const mine = m.sender === social.me
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              {m.kind === 'text' ? <p className="bubble">{m.body}</p> : <MoneyCard m={m} friend={friend} />}
              <time dateTime={m.created_at}>{when(m.created_at)}</time>
            </div>
          )
        })}
      </div>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="composer" onSubmit={send}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('Message {name}…', { name: friend.name.split(' ')[0] })}
          maxLength={2000}
        />
        <button type="submit" className="btn solid icon" disabled={!text.trim() || busy} aria-label={t('Send message')}>
          <Icon name="send" size={18} />
        </button>
      </form>
    </section>
  )
}

export default function Friends() {
  const { social, demo, leaveDemo, openModal } = useApp()
  const [picked, setPicked] = useState(null)
  const friends = social.friends.filter((f) => f.status === 'friend')
  const current = friends.find((f) => f.id === picked) ?? null
  const { setOpenChat } = social
  useEffect(() => {
    setOpenChat(current?.id ?? null)
    return () => setOpenChat(null)
  }, [current?.id, setOpenChat])

  const head = (
    <PageHead title={t('Friends')} sub={t('Chat, send and request money, and split bills with friends')}>
      {social.ready && friends.length ? (
        <button type="button" className="btn solid lg" onClick={() => openModal('split')}>
          <Icon name="receipt" size={19} />
          {t('Split a bill')}
        </button>
      ) : null}
    </PageHead>
  )

  let body
  if (!accountsEnabled || demo)
    body = (
      <Gate
        icon="users"
        title={t('Friends need an account')}
        body={t('Create a free account to chat with friends, send and request money, and split bills like dinner or rent.')}
        action={accountsEnabled ? t('Create your account') : null}
        onAction={() => leaveDemo('signup')}
      />
    )
  else if (!social.setup)
    body = (
      <Gate
        icon="gear"
        title={t('Friends need a one-time setup')}
        body={t('Run the latest supabase/schema.sql in your Supabase project (SQL Editor > New query > paste > Run), then reload.')}
      />
    )
  else if (!social.ready)
    body = social.failed ? (
      <Gate
        icon="info"
        title={t('Couldn’t load your friends')}
        body={t('Check your connection and try again.')}
        action={t('Try again')}
        onAction={social.refresh}
      />
    ) : (
      <div className="friends-loading" role="status" aria-label={t('Loading…')} />
    )
  else
    body = (
      <div className={`friends-grid ${current ? 'chatting' : ''}`}>
        <div className="stack friends-side">
          <Waiting />
          <FriendList selected={current?.id} onPick={setPicked} />
          <AddFriend />
        </div>
        <div className="friends-main">
          {current ? (
            <Chat key={current.id} friend={current} onBack={() => setPicked(null)} />
          ) : (
            <Gate
              icon="chat"
              title={friends.length ? t('Pick a friend to chat') : t('Add your first friend')}
              body={
                friends.length
                  ? t('Chat, send money, ask for money or split a bill, all in one thread.')
                  : t('Add a friend by email, or share your invite link. Once they accept, you can chat and pay each other back.')
              }
            />
          )}
        </div>
      </div>
    )

  return (
    <Stage>
      {head}
      {body}
    </Stage>
  )
}
