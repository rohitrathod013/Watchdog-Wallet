/* ------------------------------------------------------------------
   Friends: connect with other Watchdog Wallet accounts, chat, send and
   request money, and split bills. Live through Supabase Realtime.
   ------------------------------------------------------------------ */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { Persona } from '../components/Brand'
import { PageHead, Stage } from '../components/ui'
import { useApp } from '../lib/store'
import { accountsEnabled } from '../lib/supabase'
import { chatRows, emojiOnly, friendError, typingChannel } from '../lib/social'
import { money, shortDate } from '../lib/format'
import { t, tMonths } from '../lib/i18n'
import { BRAND } from '../config'

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

const EMOJI = ['😀', '😂', '😍', '🥳', '😅', '🙏', '👍', '👏', '🔥', '❤️', '🎉', '💸', '🍕', '🍻', '☕', '🚕']
const QUICK_REPLIES = ['👍', 'Thanks!', 'On my way', 'Sounds good', 'Paid you back 💸']
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return t('Today')
  if (d.toDateString() === yesterday.toDateString()) return t('Yesterday')
  return tMonths(shortDate(iso))
}

/** Message text with web links made clickable. */
function Linked({ text }) {
  const parts = text.split(URL_RE)
  return parts.map((part, i) =>
    i % 2 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  )
}

function Composer({ friend, onSend, onTyping, disabled }) {
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState(false)
  const box = useRef(null)
  const first = friend.name.split(' ')[0]

  // the box grows with the message, up to about five lines
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
    el.style.overflowY = el.scrollHeight > 132 ? 'auto' : 'hidden'
  }, [text])

  const send = (body = text) => {
    const clean = body.trim()
    if (!clean || disabled) return
    onSend(clean.slice(0, 2000))
    setText('')
    setEmoji(false)
    onTyping(false)
    box.current?.focus()
  }
  const insert = (e) => {
    const el = box.current
    const at = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = text.slice(0, at) + e + text.slice(end)
    setText(next)
    window.requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + e.length, at + e.length)
    })
  }

  return (
    <div className="composer-wrap">
      {!text ? (
        <div className="quick-replies" aria-label={t('Quick replies')}>
          {QUICK_REPLIES.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => send(t(q))} disabled={disabled}>
              {t(q)}
            </button>
          ))}
        </div>
      ) : null}
      {emoji ? (
        <div className="emoji-pop" role="dialog" aria-label={t('Emoji')}>
          {EMOJI.map((e) => (
            <button key={e} type="button" onClick={() => insert(e)} aria-label={e}>
              {e}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <button
          type="button"
          className={`icon-btn soft emoji-btn ${emoji ? 'on' : ''}`}
          onClick={() => setEmoji((v) => !v)}
          aria-label={t('Emoji')}
          aria-expanded={emoji}
        >
          <Icon name="smile" size={19} />
        </button>
        <textarea
          ref={box}
          rows={1}
          value={text}
          maxLength={2000}
          placeholder={t('Message {name}…', { name: first })}
          onChange={(e) => {
            setText(e.target.value)
            onTyping(Boolean(e.target.value.trim()))
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter starts a new line (and nothing fires mid IME composition)
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
            if (e.key === 'Escape') setEmoji(false)
          }}
          onBlur={() => onTyping(false)}
          aria-label={t('Message {name}…', { name: first })}
        />
        <button type="submit" className="btn solid icon" disabled={!text.trim() || disabled} aria-label={t('Send message')}>
          <Icon name="send" size={18} />
        </button>
      </form>
      {text.length > 1800 ? <small className="composer-count">{2000 - text.length}</small> : null}
    </div>
  )
}

function Chat({ friend, onBack }) {
  const { social, openModal } = useApp()
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  // messages on their way: shown straight away, replaced by the saved one
  const [outbox, setOutbox] = useState([])
  // they are typing: the id of their latest message when it started, so a new message from them ends it
  const [typingAfter, setTypingAfter] = useState(null)
  const [below, setBelow] = useState(0) // new messages that arrived while scrolled up
  const scroller = useRef(null)
  const atBottom = useRef(true)
  const typing = useRef(null)
  const typingSent = useRef(false)
  const first = friend.name.split(' ')[0]

  const thread = social.messages.filter((m) => m.sender === friend.id || m.recipient === friend.id)
  const all = [...thread, ...outbox]
  const rows = chatRows(all)
  const lastMine = [...thread].reverse().find((m) => m.sender === social.me)
  const lastId = all[all.length - 1]?.id
  const lastFromThem = [...thread].reverse().find((m) => m.sender === friend.id)?.id ?? ''
  const theirLast = useRef(lastFromThem)
  useEffect(() => {
    theirLast.current = lastFromThem
  }, [lastFromThem])
  // once their message lands, they've stopped typing
  const theyType = typingAfter !== null && typingAfter === lastFromThem

  // "typing…" both ways, over a Realtime broadcast
  useEffect(() => {
    let alive = true
    let hide = 0
    typingChannel(social.me, friend.id, (on) => {
      window.clearTimeout(hide)
      setTypingAfter(on ? (theirLast.current ?? '') : null)
      // in case their "stopped" never arrives
      if (on) hide = window.setTimeout(() => setTypingAfter(null), 6000)
    }).then((ch) => {
      if (alive) typing.current = ch
      else ch.stop()
    })
    return () => {
      alive = false
      window.clearTimeout(hide)
      typing.current?.stop()
      typing.current = null
    }
  }, [social.me, friend.id])
  const onTyping = useCallback((on) => {
    if (typingSent.current === on) return
    typingSent.current = on
    typing.current?.send(on)
  }, [])

  // stay pinned to the newest message, unless the user scrolled up to read
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const mineNow = all[all.length - 1]?.sender === social.me
    if (atBottom.current || mineNow) {
      el.scrollTop = el.scrollHeight
      setBelow(0)
    } else setBelow((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId])
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
    atBottom.current = true
  }, [friend.id])
  useEffect(() => {
    if (theyType && atBottom.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [theyType])
  const onScroll = () => {
    const el = scroller.current
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (atBottom.current && below) setBelow(0)
  }
  const jump = () => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
    setBelow(0)
  }

  useEffect(() => {
    if (friend.unread) social.read(friend.id)
  }, [friend.id, friend.unread, social])

  const send = async (body, retry) => {
    const id = retry ?? `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const draft = { id, sender: social.me, recipient: friend.id, kind: 'text', body, created_at: new Date().toISOString(), sending: true }
    setOutbox((list) => [...list.filter((m) => m.id !== id), draft])
    setError('')
    try {
      await social.chat(friend.id, body)
      setOutbox((list) => list.filter((m) => m.id !== id))
    } catch (err) {
      setOutbox((list) => list.map((m) => (m.id === id ? { ...m, sending: false, failed: true } : m)))
      setError(friendError(err))
    }
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
          <small className={theyType ? 'typing-line' : ''}>{theyType ? t('typing…') : friend.email}</small>
        </div>
        <button
          type="button"
          className="icon-btn soft"
          onClick={() => setConfirmRemove((v) => !v)}
          aria-label={t('Remove friend')}
          aria-expanded={confirmRemove}
        >
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
        {friend.owesMe ? <span className="owe in">{t('{name} owes you {amount}', { name: first, amount: money(friend.owesMe) })}</span> : null}
        {friend.iOwe ? <span className="owe out">{t('You owe {name} {amount}', { name: first, amount: money(friend.iOwe) })}</span> : null}
      </div>
      <div className="chat-body">
        <div className="chat-scroll" ref={scroller} onScroll={onScroll} aria-live="polite">
          {!all.length ? (
            <div className="chat-empty">
              <Persona name={friend.name} hue={friend.hue} size={56} />
              <p>{t('No messages yet. Say hello, or split your next dinner.')}</p>
            </div>
          ) : null}
          {rows.map((row) => {
            if (row.type === 'day')
              return (
                <div key={row.key} className="day-sep">
                  <span>{dayLabel(row.at)}</span>
                </div>
              )
            const { m, first: start, last: end } = row
            const mine = m.sender === social.me
            const big = m.kind === 'text' && emojiOnly(m.body)
            const status = m.failed ? 'failed' : m.sending ? 'sending' : m.id === lastMine?.id ? (m.read_at ? 'seen' : 'sent') : null
            return (
              <div
                key={row.key}
                className={`msg ${mine ? 'mine' : ''} ${start ? 'start' : ''} ${end ? 'end' : ''} ${m.sending ? 'sending' : ''} ${m.failed ? 'failed' : ''}`}
              >
                {m.kind === 'text' ? (
                  <p className={`bubble ${big ? 'big' : ''}`} title={new Date(m.created_at).toLocaleString()}>
                    {big ? m.body : <Linked text={m.body} />}
                  </p>
                ) : (
                  <MoneyCard m={m} friend={friend} />
                )}
                {end || status ? (
                  <span className="msg-meta">
                    <time dateTime={m.created_at}>{clock(m.created_at)}</time>
                    {status === 'seen' ? <em className="seen">· {t('Seen')}</em> : null}
                    {status === 'sent' ? <em>· {t('Sent')}</em> : null}
                    {status === 'sending' ? <em>· {t('Sending…')}</em> : null}
                    {status === 'failed' ? (
                      <button type="button" className="retry" onClick={() => send(m.body, m.id)}>
                        {t('Not sent. Tap to retry')}
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>
            )
          })}
          {theyType ? (
            <div className="msg start end typing-msg" aria-label={t('{name} is typing', { name: first })}>
              <p className="bubble typing-dots">
                <i />
                <i />
                <i />
              </p>
            </div>
          ) : null}
        </div>
        {below ? (
          <button type="button" className="jump-new" onClick={jump}>
            <Icon name="arrowDown" size={15} />
            {below === 1 ? t('1 new message') : t('{count} new messages', { count: below })}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <Composer friend={friend} onSend={(body) => send(body)} onTyping={onTyping} disabled={false} />
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
