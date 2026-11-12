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
import { chatRows, emojiOnly, friendError, mediaLabel, roomOf, systemText, typingChannel } from '../lib/social'
import { canRecord, durationLabel, MAX_VOICE_SECONDS, prepareFile, removeMedia, sizeLabel, startRecording, uploadMedia } from '../lib/media'
import { MediaBubble } from '../components/ChatMedia'
import { MAX_GROUP } from '../lib/social'
import { money, shortDate } from '../lib/format'
import { t, tMonths } from '../lib/i18n'
import { BRAND } from '../config'
import { allowContacts, canPickContacts, contactsAllowed, inviteHref, pickContacts } from '../lib/contacts'

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
/* Friends from the phone's contacts: the user agrees here first, then picks people in the phone's own list */
function FromContacts() {
  const { social } = useApp()
  const [step, setStep] = useState('idle') // idle | ask | busy | done
  const [found, setFound] = useState([]) // [{ contact, status, name }]
  const [problem, setProblem] = useState(null)
  const can = canPickContacts()

  const pick = async () => {
    allowContacts()
    setProblem(null)
    let picked
    try {
      picked = await pickContacts()
    } catch (err) {
      setProblem(
        err?.name === 'SecurityError' || err?.name === 'NotAllowedError'
          ? t('Your phone didn’t allow access to contacts.')
          : t('Couldn’t open your contacts. Try again.'),
      )
      setStep('idle')
      return
    }
    if (!picked.length) {
      setStep('idle')
      return
    }
    setStep('busy')
    const out = []
    // one at a time: each person's emails in turn until one is on the app
    for (const contact of picked.slice(0, 25)) {
      let r = { status: 'not_found' }
      for (const email of contact.emails) {
        try {
          r = await social.addFriend(email)
        } catch {
          r = { status: 'error' }
        }
        if (r.status !== 'not_found') break
      }
      out.push({ contact, status: r.status, name: r.name || contact.name })
    }
    setFound(out)
    setStep('done')
  }

  const start = () => (can && contactsAllowed() ? pick() : setStep('ask'))
  const inviteText = t('Be my friend on {brand}, so we can split bills and pay each other back.', { brand: BRAND.name })
  const label = {
    sent: t('Request sent'),
    accepted: t('Now friends'),
    already: t('Already friends'),
    pending: t('Already asked'),
    self: t('That’s you'),
    error: t('Couldn’t add'),
  }

  return (
    <div className="from-contacts">
      {step === 'idle' || step === 'busy' ? (
        <button type="button" className="btn sm" onClick={start} disabled={step === 'busy'}>
          <Icon name="users" size={15} />
          {step === 'busy' ? t('Adding…') : t('Add from my contacts')}
        </button>
      ) : null}
      {problem ? <p className="add-note bad">{problem}</p> : null}

      {step === 'ask' ? (
        <div className="contacts-ask" role="dialog" aria-label={t('Use your contacts?')}>
          <b>{t('Use your contacts?')}</b>
          {can ? (
            <>
              <p>
                {t(
                  'Your phone will show your contacts and you choose who to share. {brand} only sees the people you pick, uses their email to find them, and sends each one who’s here a friend request. Nothing else is saved.',
                  { brand: BRAND.name },
                )}
              </p>
              <div className="contacts-btns">
                <button type="button" className="btn sm solid" onClick={pick}>
                  {t('Allow and choose')}
                </button>
                <button type="button" className="btn sm" onClick={() => setStep('idle')}>
                  {t('Not now')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                {t(
                  'This browser can’t share contacts with websites yet. It works in Chrome on Android. Here, add friends by email or send your invite link.',
                )}
              </p>
              <div className="contacts-btns">
                <button type="button" className="btn sm" onClick={() => setStep('idle')}>
                  {t('OK')}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {step === 'done' ? (
        <div className="contacts-found">
          <ul>
            {found.map((f, i) => {
              const invite = f.status === 'not_found' && social.inviteUrl ? inviteHref(f.contact, social.inviteUrl, inviteText) : null
              return (
                <li key={i}>
                  <span>{f.name}</span>
                  {f.status === 'not_found' ? (
                    invite ? (
                      <a className="btn sm" href={invite}>
                        {t('Invite')}
                      </a>
                    ) : (
                      <small>{t('Not on {brand} yet', { brand: BRAND.name })}</small>
                    )
                  ) : (
                    <small className={['sent', 'accepted', 'already'].includes(f.status) ? 'good' : ''}>{label[f.status] ?? label.error}</small>
                  )}
                </li>
              )
            })}
          </ul>
          <button type="button" className="link" onClick={() => setStep('idle')}>
            {t('Done')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

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
      <FromContacts />
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
            <Persona name={f.name} hue={f.hue} src={f.avatar} size={40} />
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
  const who = mine ? `${t('You')}: ` : m.group_id ? `${social.nameOf(m.sender).split(' ')[0]}: ` : ''
  if (m.kind === 'system') return systemText(m, me, social.nameOf)
  if (m.kind === 'text') return `${who}${m.body}`
  if (m.kind === 'media') return `${who}${m.body || mediaLabel(m.media)}`
  if (m.group_id && m.kind === 'split') return `${who}${t('Split “{title}”', { title: m.body })}`
  if (m.group_id && m.kind === 'payment') return `${who}${t('paid their share')}`
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

/** A group's picture: the first two members' initials, overlapping. */
function GroupAvatar({ group, size = 42 }) {
  const others = group.members.filter((x) => !x.me)
  const [a, b] = others.length ? others : group.members
  return (
    <span className="group-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {a ? <Persona name={a.name} hue={a.hue} src={a.avatar} size={Math.round(size * 0.7)} /> : null}
      {b ? <Persona name={b.name} hue={b.hue} src={b.avatar} size={Math.round(size * 0.7)} /> : <Icon name="users" size={Math.round(size * 0.4)} />}
    </span>
  )
}

function FriendList({ selected, onPick }) {
  const { social, openModal } = useApp()
  const [busy, setBusy] = useState(null)
  const list = social.friends.filter((f) => f.status !== 'incoming')
  const canGroup = social.friends.some((f) => f.status === 'friend')
  return (
    <section className="card friend-list rv" style={{ '--i': 3 }}>
      <div className="c-head">
        <h2 className="card-h">{t('Groups')}</h2>
        <button
          type="button"
          className="btn sm"
          onClick={() => openModal('newGroup')}
          disabled={!canGroup}
          title={canGroup ? undefined : t('Add a friend first')}
        >
          <Icon name="plus" size={15} stroke={2} />
          {t('New group')}
        </button>
      </div>
      {social.groups.length ? (
        <ul className="group-list">
          {social.groups.map((g) => (
            <li key={g.id}>
              <button type="button" className={`friend-row ${selected === `g:${g.id}` ? 'on' : ''}`} onClick={() => onPick(`g:${g.id}`)}>
                <GroupAvatar group={g} />
                <div className="fr-main">
                  <b>{g.name}</b>
                  <small>{g.last ? preview(g.last, social.me, social) : t('{count} people', { count: g.members.length })}</small>
                </div>
                <div className="fr-side">{g.unread ? <em className="badge">{g.unread}</em> : null}</div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="friend-empty">
          {canGroup
            ? t('Make a group for a trip, a flat or a team, and split bills with everyone at once.')
            : t('Add a friend first, then you can make a group.')}
        </p>
      )}
      <hr className="list-sep" />
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
                  <Persona name={f.name} hue={f.hue} src={f.avatar} size={42} />
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
                <button type="button" className={`friend-row ${selected === `f:${f.id}` ? 'on' : ''}`} onClick={() => onPick(`f:${f.id}`)}>
                  <Persona name={f.name} hue={f.hue} src={f.avatar} size={42} />
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
/** Someone in a group, shaped like a friend for the pay window. */
const personFor = (social, id) => ({ id, name: social.nameOf(id), hue: [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7), email: '' })

/** A bill split inside a group: everyone sees it; each payer gets Pay on their own share. */
function GroupSplitCard({ m }) {
  const { social, openModal } = useApp()
  const [busy, setBusy] = useState(false)
  const split = social.splits.get(m.ref)
  const shares = [...social.requests.values()].filter((r) => r.split_id === m.ref)
  const mine = shares.find((r) => r.payer === social.me)
  const creator = m.sender === social.me
  const paid = shares.filter((r) => r.status === 'paid').length
  const who = creator ? t('You') : social.nameOf(m.sender).split(' ')[0]
  return (
    <div className={`money-msg request group-split ${creator ? 'mine' : ''}`}>
      <span className="mm-ic">
        <Icon name="receipt" size={17} />
      </span>
      <div>
        <b>{t('Split: {title}', { title: m.body })}</b>
        <small>
          {split ? `${t('Bill {total}', { total: money(Number(split.total)) })} · ` : ''}
          {t('{name} paid the bill', { name: who })}
        </small>
        {creator && shares.length ? (
          <ul className="split-shares">
            {shares.map((r) => (
              <li key={r.id} className={r.status}>
                <span>{social.nameOf(r.payer).split(' ')[0]}</span>
                <b>{money(Number(r.amount))}</b>
                <em>{t(STATUS[r.status])}</em>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mm-foot">
          {creator ? (
            <span className={`status ${paid === shares.length ? 'paid' : 'pending'}`}>
              {t('{paid} of {count} paid', { paid, count: shares.length })}
            </span>
          ) : null}
          {mine ? (
            <>
              <span className={`status ${mine.status}`}>{t('your share is {amount}', { amount: money(Number(mine.amount)) })}</span>
              {mine.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="btn sm solid"
                    onClick={() => openModal('friendPay', { friend: personFor(social, mine.requester), request: mine })}
                  >
                    {t('Pay {amount}', { amount: money(Number(mine.amount)) })}
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      await social.decline(mine.id).catch(() => null)
                      setBusy(false)
                    }}
                  >
                    {t('Decline')}
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function MoneyCard({ m, friend }) {
  const { social, openModal } = useApp()
  const [busy, setBusy] = useState(false)
  const mine = m.sender === social.me
  if (m.group_id && m.kind === 'split') return <GroupSplitCard m={m} />
  if (m.group_id && m.kind === 'payment') {
    const x = social.transfers.get(m.ref)
    const who = mine ? t('You') : social.nameOf(m.sender).split(' ')[0]
    return (
      <div className={`money-msg payment ${mine ? 'mine' : ''}`}>
        <span className="mm-ic">
          <Icon name="check" size={17} />
        </span>
        <div>
          <b>
            {x
              ? t('{name} paid {other} {amount}', {
                  name: who,
                  other: x.recipient === social.me ? t('you') : social.nameOf(x.recipient).split(' ')[0],
                  amount: money(Number(x.amount)),
                })
              : t('{name} paid their share', { name: who })}
          </b>
          {m.body ? <small>{m.body}</small> : null}
        </div>
      </div>
    )
  }
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
const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

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

/** A friendly line for something that went wrong with a photo, file or voice note. */
function mediaError(err) {
  if (err?.setup) return t('Photos and voice notes need a one-time setup: run the latest supabase/schema.sql in Supabase.')
  if (err?.tooBig) return t('Files can be up to {size}.', { size: '10 MB' })
  if (err?.notAllowed) return t('You can send photos, videos, audio, PDFs and text files.')
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return t('Allow the microphone in your browser to record a voice note.')
  if (err?.name === 'NotFoundError') return t('No microphone was found.')
  return friendError(err)
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

/* ---------------- recording a voice note ---------------- */
function Recorder({ onDone, onCancel, onError }) {
  const [secs, setSecs] = useState(0)
  const [bars, setBars] = useState(() => Array(28).fill(0.08))
  const handle = useRef(null)
  const started = useRef(0)
  const finished = useRef(false)

  const stop = useCallback(async () => {
    if (finished.current || !handle.current) return
    finished.current = true
    const note = await handle.current.stop()
    if (note.seconds < 0.8) onCancel()
    else onDone(note)
  }, [onDone, onCancel])

  useEffect(() => {
    let alive = true
    let timer = 0
    let lastBar = 0
    startRecording((level) => {
      const now = performance.now()
      if (now - lastBar < 90) return
      lastBar = now
      setBars((list) => [...list.slice(1), Math.max(0.08, level)])
    })
      .then((h) => {
        if (!alive) return h.cancel()
        handle.current = h
        started.current = performance.now()
        timer = window.setInterval(() => {
          const s = (performance.now() - started.current) / 1000
          setSecs(s)
          if (s >= MAX_VOICE_SECONDS) stop()
        }, 200)
      })
      .catch((err) => alive && onError(err))
    return () => {
      alive = false
      window.clearInterval(timer)
      if (!finished.current) handle.current?.cancel()
    }
  }, [onError, stop])

  return (
    <div className="recorder" role="group" aria-label={t('Recording a voice message')}>
      <button
        type="button"
        className="icon-btn soft rec-cancel"
        onClick={() => {
          finished.current = true
          handle.current?.cancel()
          onCancel()
        }}
        aria-label={t('Delete recording')}
      >
        <Icon name="trash" size={18} />
      </button>
      <span className="rec-dot" aria-hidden="true" />
      <span className="rec-time">{durationLabel(secs)}</span>
      <div className="rec-bars" aria-hidden="true">
        {bars.map((b, i) => (
          <i key={i} style={{ '--l': b }} />
        ))}
      </div>
      <button type="button" className="btn solid icon" onClick={stop} aria-label={t('Send voice message')}>
        <Icon name="send" size={18} />
      </button>
    </div>
  )
}

/* ---------------- the message box ---------------- */
function Composer({ friend, onSend, onSendMedia, onTyping, attachment, setAttachment, onError, showQuick, onMoney, group = false }) {
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState(false)
  const [menu, setMenu] = useState(false)
  const [recording, setRecording] = useState(false)
  const box = useRef(null)
  const photoInput = useRef(null)
  const fileInput = useRef(null)
  const cameraInput = useRef(null)
  const first = group ? friend.name : friend.name.split(' ')[0]

  // the box grows with the message, up to about five lines
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
    el.style.overflowY = el.scrollHeight > 132 ? 'auto' : 'hidden'
  }, [text, attachment])

  const attach = async (file) => {
    setMenu(false)
    if (!file) return
    try {
      const prepared = await prepareFile(file)
      setAttachment({ prepared, preview: ['image', 'video'].includes(prepared.type) ? URL.createObjectURL(prepared.blob) : null })
      box.current?.focus()
    } catch (err) {
      onError(mediaError(err))
    }
  }

  const send = (body = text) => {
    const clean = body.trim().slice(0, 2000)
    if (attachment) {
      onSendMedia(attachment, clean)
      setAttachment(null)
    } else if (clean) onSend(clean)
    else return
    setText('')
    setEmoji(false)
    onTyping(false)
    box.current?.focus()
  }
  const insert = (e) => {
    const el = box.current
    const at = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    setText(text.slice(0, at) + e + text.slice(end))
    window.requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + e.length, at + e.length)
    })
  }
  const pick = (input) => {
    if (input.current) input.current.value = ''
    input.current?.click()
  }
  const canSend = Boolean(text.trim() || attachment)

  if (recording)
    return (
      <div className="composer-wrap">
        <Recorder
          onCancel={() => setRecording(false)}
          onError={(err) => {
            setRecording(false)
            onError(mediaError(err))
          }}
          onDone={(note) => {
            setRecording(false)
            onSendMedia(
              {
                prepared: { blob: note.blob, mime: note.mime, name: 'voice-message', size: note.blob.size, type: 'audio' },
                extra: { duration: Math.round(note.seconds * 10) / 10, peaks: note.peaks },
              },
              '',
            )
          }}
        />
      </div>
    )

  return (
    <div className="composer-wrap">
      {showQuick && !text && !attachment ? (
        <div className="quick-replies" aria-label={t('Quick replies')}>
          {QUICK_REPLIES.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => send(t(q))}>
              {t(q)}
            </button>
          ))}
        </div>
      ) : null}
      {attachment ? (
        <div className="attach-tray">
          {attachment.prepared.type === 'image' ? <img src={attachment.preview} alt="" /> : null}
          {attachment.prepared.type === 'video' ? <video src={attachment.preview} muted playsInline /> : null}
          {!['image', 'video'].includes(attachment.prepared.type) ? (
            <span className="mf-ic">
              <Icon name="file" size={20} />
            </span>
          ) : null}
          <div>
            <b>{attachment.prepared.name}</b>
            <small>{sizeLabel(attachment.prepared.size)}</small>
          </div>
          <button type="button" className="icon-btn soft" onClick={() => setAttachment(null)} aria-label={t('Remove attachment')}>
            <Icon name="close" size={16} />
          </button>
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
      {menu ? (
        <div className="attach-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => pick(photoInput)}>
            <Icon name="image" size={18} />
            {t('Photo or video')}
          </button>
          {touch ? (
            <button type="button" role="menuitem" onClick={() => pick(cameraInput)}>
              <Icon name="eye" size={18} />
              {t('Camera')}
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => pick(fileInput)}>
            <Icon name="file" size={18} />
            {t('File')}
          </button>
          <hr />
          {group ? null : (
            <>
              <button type="button" role="menuitem" onClick={() => (setMenu(false), onMoney('pay'))}>
                <Icon name="send" size={18} />
                {t('Send money')}
              </button>
              <button type="button" role="menuitem" onClick={() => (setMenu(false), onMoney('ask'))}>
                <Icon name="request" size={18} />
                {t('Request money')}
              </button>
            </>
          )}
          <button type="button" role="menuitem" onClick={() => (setMenu(false), onMoney('split'))}>
            <Icon name="receipt" size={18} />
            {t('Split a bill')}
          </button>
        </div>
      ) : null}
      <input ref={photoInput} type="file" accept="image/*,video/*" hidden onChange={(e) => attach(e.target.files?.[0])} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => attach(e.target.files?.[0])} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*,audio/*,application/pdf,text/plain"
        hidden
        onChange={(e) => attach(e.target.files?.[0])}
      />
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <button
          type="button"
          className={`icon-btn soft attach-btn ${menu ? 'on' : ''}`}
          onClick={() => (setMenu((v) => !v), setEmoji(false))}
          aria-label={t('Attach a photo, video or file')}
          aria-expanded={menu}
        >
          <Icon name="plus" size={19} stroke={2} />
        </button>
        <div className="composer-field">
          <textarea
            ref={box}
            rows={1}
            value={text}
            maxLength={2000}
            placeholder={attachment ? t('Add a caption…') : t('Message {name}…', { name: first })}
            onChange={(e) => {
              setText(e.target.value)
              onTyping(Boolean(e.target.value.trim()))
            }}
            onPaste={(e) => {
              const file = e.clipboardData?.files?.[0]
              if (file) {
                e.preventDefault()
                attach(file)
              }
            }}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line (and nothing fires mid IME composition)
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
              if (e.key === 'Escape') (setEmoji(false), setMenu(false))
            }}
            onBlur={() => onTyping(false)}
            aria-label={t('Message {name}…', { name: first })}
          />
          <button
            type="button"
            className={`emoji-btn ${emoji ? 'on' : ''}`}
            onClick={() => (setEmoji((v) => !v), setMenu(false))}
            aria-label={t('Emoji')}
            aria-expanded={emoji}
          >
            <Icon name="smile" size={19} />
          </button>
        </div>
        {canSend || !canRecord() ? (
          <button type="submit" className="btn solid icon" disabled={!canSend} aria-label={t('Send message')}>
            <Icon name="send" size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="btn solid icon mic-btn"
            onClick={() => (setRecording(true), setEmoji(false), setMenu(false))}
            aria-label={t('Record a voice message')}
          >
            <Icon name="mic" size={19} />
          </button>
        )}
      </form>
      {text.length > 1800 ? <small className="composer-count">{2000 - text.length}</small> : null}
    </div>
  )
}

/* ---------------- group settings: members, rename, leave ---------------- */
function GroupInfo({ group, onClose, onLeft }) {
  const { social } = useApp()
  const [name, setName] = useState(group.name)
  const [adding, setAdding] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const inGroup = new Set(group.members.map((x) => x.id))
  const addable = social.friends.filter((f) => f.status === 'friend' && !inGroup.has(f.id))
  const room = MAX_GROUP - group.members.length
  const run = async (work) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (err) {
      setError(friendError(err))
    }
    setBusy(false)
  }
  return (
    <div className="group-info">
      <div className="gi-head">
        <b>{t('Group info')}</b>
        <button type="button" className="icon-btn soft" onClick={onClose} aria-label={t('Close')}>
          <Icon name="close" size={16} />
        </button>
      </div>
      {group.admin ? (
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && name.trim() !== group.name) run(() => social.renameGroup(group.id, name.trim()))
          }}
        >
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label={t('Group name')} />
          <button type="submit" className="btn sm" disabled={busy || !name.trim() || name.trim() === group.name}>
            {t('Rename')}
          </button>
        </form>
      ) : null}
      <small className="gi-label">{t('{count} of {max} people', { count: group.members.length, max: MAX_GROUP })}</small>
      <ul className="gi-members">
        {group.members.map((x) => (
          <li key={x.id}>
            <Persona name={x.name} hue={x.hue} src={x.avatar} size={32} />
            <span>{x.name}</span>
            {x.role === 'admin' ? <em className="pill-tag">{t('Admin')}</em> : null}
            {group.admin && !x.me ? (
              <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => social.removeFromGroup(group.id, x.id))}>
                {t('Remove')}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {group.admin && addable.length && room > 0 ? (
        <>
          <small className="gi-label">{t('Add friends')}</small>
          <div className="people split-people">
            {addable.map((f, i) => (
              <button
                key={f.id}
                type="button"
                className={`person ${adding.includes(f.id) ? 'on' : ''}`}
                style={{ '--i': i }}
                aria-pressed={adding.includes(f.id)}
                onClick={() =>
                  setAdding((list) => (list.includes(f.id) ? list.filter((x) => x !== f.id) : list.length < room ? [...list, f.id] : list))
                }
              >
                <Persona name={f.name} hue={f.hue} src={f.avatar} size={40} />
                {f.name.split(' ')[0]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn solid sm"
            disabled={busy || !adding.length}
            onClick={() => run(async () => (await social.addToGroup(group.id, adding), setAdding([])))}
          >
            {adding.length ? t('Add {count} to the group', { count: adding.length }) : t('Pick friends to add')}
          </button>
        </>
      ) : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {leaving ? (
        <div className="acct-confirm danger">
          <p>{t('Leave {name}? You won’t see new messages, and someone will need to add you back.', { name: group.name })}</p>
          <div>
            <button
              type="button"
              className="btn solid danger"
              disabled={busy}
              onClick={() => run(async () => (await social.leaveGroup(group.id), onLeft()))}
            >
              {t('Leave group')}
            </button>
            <button type="button" className="btn" onClick={() => setLeaving(false)}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn sm danger gi-leave" onClick={() => setLeaving(true)}>
          <Icon name="logout" size={15} />
          {t('Leave group')}
        </button>
      )}
    </div>
  )
}

function Chat({ peer, onBack }) {
  const friend = peer
  const isGroup = Boolean(peer.group)
  const { social, openModal } = useApp()
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  // messages on their way: shown straight away, replaced by the saved one
  const [outbox, setOutbox] = useState([])
  const [attachment, setAttachmentState] = useState(null)
  const [dragging, setDragging] = useState(false)
  // who is typing, and the id of the latest message from others when they started, so a new message ends it
  const [typingAfter, setTypingAfter] = useState(null)
  const [typer, setTyper] = useState(null)
  const [below, setBelow] = useState(0) // new messages that arrived while scrolled up
  const scroller = useRef(null)
  const atBottom = useRef(true)
  const typing = useRef(null)
  const typingSent = useRef(false)
  const first = friend.name.split(' ')[0]

  const setAttachment = useCallback((next) => {
    setAttachmentState((prev) => {
      if (prev?.preview && prev !== next) URL.revokeObjectURL(prev.preview)
      return next
    })
  }, [])

  const thread = isGroup
    ? social.messages.filter((m) => m.group_id === peer.id)
    : social.messages.filter((m) => !m.group_id && (m.sender === peer.id || m.recipient === peer.id))
  const all = [...thread, ...outbox]
  const rows = chatRows(all)
  const lastMine = [...thread].reverse().find((m) => m.sender === social.me)
  const lastId = all[all.length - 1]?.id
  const lastFromThem = [...thread].reverse().find((m) => m.sender !== social.me && m.kind !== 'system')?.id ?? ''
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
    typingChannel(social.me, roomOf(social.me, peer), (from, on) => {
      window.clearTimeout(hide)
      setTyper(on ? from : null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [social.me, peer.id])
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
  // a photo that just loaded makes the thread taller: keep the bottom in view
  const keepBottom = () => {
    if (atBottom.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }

  useEffect(() => {
    if (!peer.unread) return
    if (isGroup) social.readGroup(peer.id)
    else social.read(peer.id)
  }, [peer.id, peer.unread, isGroup, social])

  const draftId = () => `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const sendText = async (body, retry) => {
    const id = retry ?? draftId()
    const draft = {
      id,
      sender: social.me,
      recipient: isGroup ? null : peer.id,
      group_id: isGroup ? peer.id : null,
      kind: 'text',
      body,
      created_at: new Date().toISOString(),
      sending: true,
    }
    setOutbox((list) => [...list.filter((m) => m.id !== id), draft])
    setError('')
    try {
      if (isGroup) await social.groupChat(peer.id, body)
      else await social.chat(peer.id, body)
      setOutbox((list) => list.filter((m) => m.id !== id))
    } catch (err) {
      setOutbox((list) => list.map((m) => (m.id === id ? { ...m, sending: false, failed: true } : m)))
      setError(friendError(err))
    }
  }
  const sendMedia = async ({ prepared, extra = {} }, caption, retry) => {
    const id = retry ?? draftId()
    const local = URL.createObjectURL(prepared.blob)
    const preview = {
      type: prepared.type,
      mime: prepared.mime,
      name: prepared.name,
      size: prepared.size,
      width: prepared.width,
      height: prepared.height,
      ...extra,
    }
    const draft = {
      id,
      sender: social.me,
      recipient: isGroup ? null : peer.id,
      group_id: isGroup ? peer.id : null,
      kind: 'media',
      body: caption,
      media: preview,
      local,
      upload: { prepared, extra },
      created_at: new Date().toISOString(),
      sending: true,
    }
    setOutbox((list) => [...list.filter((m) => m.id !== id), draft])
    setError('')
    let media = null
    try {
      media = await uploadMedia(social.me, isGroup ? `g-${peer.id}` : peer.id, prepared, extra)
      if (isGroup) await social.groupMedia(peer.id, media, caption)
      else await social.chatMedia(peer.id, media, caption)
      setOutbox((list) => list.filter((m) => m.id !== id))
      window.setTimeout(() => URL.revokeObjectURL(local), 4000)
    } catch (err) {
      // uploaded but the message didn't go: don't leave the file behind
      if (media) removeMedia(media.path).catch(() => null)
      setOutbox((list) => list.map((m) => (m.id === id ? { ...m, sending: false, failed: true } : m)))
      setError(mediaError(err))
    }
  }
  const retry = (m) => (m.kind === 'media' ? sendMedia(m.upload, m.body, m.id) : sendText(m.body, m.id))

  const onDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    try {
      const prepared = await prepareFile(file)
      setAttachment({ prepared, preview: ['image', 'video'].includes(prepared.type) ? URL.createObjectURL(prepared.blob) : null })
    } catch (err) {
      setError(mediaError(err))
    }
  }

  const typerName = typer ? social.nameOf(typer).split(' ')[0] : first
  const sub = theyType ? (
    <small className="typing-line">{isGroup ? t('{name} is typing…', { name: typerName }) : t('typing…')}</small>
  ) : isGroup ? (
    <small>{peer.members.map((x) => x.name.split(' ')[0]).join(', ')}</small>
  ) : friend.owesMe ? (
    <small className="owe in">{t('{name} owes you {amount}', { name: first, amount: money(friend.owesMe) })}</small>
  ) : friend.iOwe ? (
    <small className="owe out">{t('You owe {name} {amount}', { name: first, amount: money(friend.iOwe) })}</small>
  ) : (
    <small>{friend.email}</small>
  )

  return (
    <section
      className={`card chat-card rv ${dragging ? 'dragging' : ''}`}
      style={{ '--i': 2 }}
      onDragOver={(e) => {
        if ([...(e.dataTransfer?.types ?? [])].includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget) || setDragging(false)}
      onDrop={onDrop}
    >
      <header className="chat-head">
        <button type="button" className="icon-btn soft chat-back" onClick={onBack} aria-label={t('Back to friends')}>
          <Icon name="chevLeft" size={18} />
        </button>
        {isGroup ? <GroupAvatar group={peer} size={42} /> : <Persona name={friend.name} hue={friend.hue} src={friend.avatar} size={42} />}
        <div className="ch-main">
          <b>{friend.name}</b>
          {sub}
        </div>
        <div className="ch-actions">
          {isGroup ? (
            <>
              <button type="button" className="ch-act solid" onClick={() => openModal('split', { group: peer.id })} title={t('Split a bill')}>
                <Icon name="receipt" size={16} />
                <span>{t('Split a bill')}</span>
              </button>
              <button
                type="button"
                className="ch-act more"
                onClick={() => setConfirmRemove((v) => !v)}
                aria-label={t('Group info')}
                aria-expanded={confirmRemove}
              >
                <Icon name="users" size={17} />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ch-act solid" onClick={() => openModal('friendPay', { friend })} title={t('Send money')}>
                <Icon name="send" size={16} />
                <span>{t('Send')}</span>
              </button>
              <button type="button" className="ch-act extra" onClick={() => openModal('friendAsk', { friend })} title={t('Request money')}>
                <Icon name="request" size={16} />
                <span>{t('Request')}</span>
              </button>
              <button type="button" className="ch-act extra" onClick={() => openModal('split', { friend: friend.id })} title={t('Split a bill')}>
                <Icon name="receipt" size={16} />
                <span>{t('Split')}</span>
              </button>
              <button
                type="button"
                className="ch-act more"
                onClick={() => setConfirmRemove((v) => !v)}
                aria-label={t('Remove friend')}
                aria-expanded={confirmRemove}
              >
                <Icon name="dotsH" size={17} />
              </button>
            </>
          )}
        </div>
      </header>
      {confirmRemove && isGroup ? <GroupInfo group={peer} onClose={() => setConfirmRemove(false)} onLeft={onBack} /> : null}
      {confirmRemove && !isGroup ? (
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
      <div className="chat-body">
        <div className="chat-scroll" ref={scroller} onScroll={onScroll} onLoadCapture={keepBottom} aria-live="polite">
          {!all.length ? (
            <div className="chat-empty">
              {isGroup ? <GroupAvatar group={peer} size={56} /> : <Persona name={friend.name} hue={friend.hue} src={friend.avatar} size={56} />}
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
            if (m.kind === 'system')
              return (
                <div key={row.key} className="sys-msg">
                  <span>{systemText(m, social.me, social.nameOf)}</span>
                </div>
              )
            const mine = m.sender === social.me
            const big = m.kind === 'text' && emojiOnly(m.body)
            const seenBy = isGroup && m.id === lastMine?.id ? peer.members.filter((x) => !x.me && x.last_read_at >= m.created_at).length : 0
            const status = m.failed
              ? 'failed'
              : m.sending
                ? 'sending'
                : m.id === lastMine?.id
                  ? isGroup
                    ? seenBy
                      ? 'seenBy'
                      : 'sent'
                    : m.read_at
                      ? 'seen'
                      : 'sent'
                  : null
            const sender = isGroup && !mine && start ? personFor(social, m.sender) : null
            return (
              <div
                key={row.key}
                className={`msg ${mine ? 'mine' : ''} ${start ? 'start' : ''} ${end ? 'end' : ''} ${m.sending ? 'sending' : ''} ${m.failed ? 'failed' : ''}`}
              >
                {sender ? (
                  <span className="msg-from" style={{ '--hue': sender.hue }}>
                    {sender.name}
                  </span>
                ) : null}
                {m.kind === 'text' ? (
                  <p className={`bubble ${big ? 'big' : ''}`} title={new Date(m.created_at).toLocaleString()}>
                    {big ? m.body : <Linked text={m.body} />}
                  </p>
                ) : m.kind === 'media' ? (
                  <MediaBubble media={m.media} local={m.local} caption={m.body} />
                ) : (
                  <MoneyCard m={m} friend={friend} />
                )}
                {end || status ? (
                  <span className="msg-meta">
                    <time dateTime={m.created_at}>{clock(m.created_at)}</time>
                    {status === 'seen' ? <em className="seen">· {t('Seen')}</em> : null}
                    {status === 'seenBy' ? (
                      <em className="seen">
                        · {seenBy >= peer.members.length - 1 ? t('Seen by everyone') : t('Seen by {count}', { count: seenBy })}
                      </em>
                    ) : null}
                    {status === 'sent' ? <em>· {t('Sent')}</em> : null}
                    {status === 'sending' ? <em>· {m.kind === 'media' ? t('Uploading…') : t('Sending…')}</em> : null}
                    {status === 'failed' ? (
                      <button type="button" className="retry" onClick={() => retry(m)}>
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
        {dragging ? (
          <div className="drop-hint">
            <Icon name="upload" size={22} />
            {t('Drop to send to {name}', { name: first })}
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="auth-error chat-error" role="alert">
          {error}
          <button type="button" onClick={() => setError('')} aria-label={t('Close')}>
            <Icon name="close" size={14} />
          </button>
        </p>
      ) : null}
      <Composer
        friend={friend}
        onSend={(body) => sendText(body)}
        onSendMedia={(att, caption) => sendMedia(att, caption)}
        onTyping={onTyping}
        attachment={attachment}
        setAttachment={setAttachment}
        onError={setError}
        showQuick={!thread.length || thread[thread.length - 1]?.sender !== social.me}
        group={isGroup}
        onMoney={(what) =>
          isGroup
            ? openModal('split', { group: peer.id })
            : what === 'pay'
              ? openModal('friendPay', { friend })
              : what === 'ask'
                ? openModal('friendAsk', { friend })
                : openModal('split', { friend: friend.id })
        }
      />
    </section>
  )
}

export default function Friends() {
  const { social, demo, leaveDemo, openModal } = useApp()
  const [chosen, setChosen] = useState(null)
  // a group you just made opens straight away, until you pick something else
  const [handled, setHandled] = useState(null)
  const { justMade } = social
  const picked = justMade && justMade !== handled ? `g:${justMade}` : chosen
  const setPicked = (key) => {
    setHandled(justMade)
    setChosen(key)
  }
  const friends = social.friends.filter((f) => f.status === 'friend')
  const [kind, pickedId] = picked ? picked.split(':') : []
  const current =
    kind === 'g' ? (social.groups.find((g) => g.id === pickedId) ?? null) : kind === 'f' ? (friends.find((f) => f.id === pickedId) ?? null) : null
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
          <FriendList selected={picked} onPick={setPicked} />
          <AddFriend />
        </div>
        <div className="friends-main">
          {current ? (
            <Chat key={current.id} peer={current} onBack={() => setPicked(null)} />
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
    <Stage className={`friends-page ${current ? 'chatting' : ''}`}>
      {head}
      {body}
    </Stage>
  )
}
