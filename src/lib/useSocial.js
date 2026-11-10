/* ------------------------------------------------------------------
   The Friends feature's state for the signed-in account: friends,
   chat, money requests and splits, kept live with Supabase Realtime.

   Money between friends is a row in the transfers table. Each one is
   added to this account's balance and transactions exactly once: the
   transaction keeps the transfer id (ref), so seeing it again changes
   nothing. Transfers from before `since` (set when the user clears
   their data) are left alone, so clearing doesn't replay old money.
   ------------------------------------------------------------------ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BRAND } from '../config'
import { localIso, money } from './format'
import { t } from './i18n'
import {
  acceptConnection,
  connectWith,
  createSplit,
  ensureProfile,
  inviteLink,
  loadSocial,
  markRead,
  removeConnection,
  requestFromFriend,
  respondRequest,
  sendChat,
  sendToFriend,
  shapeSocial,
  takeInvite,
  watchSocial,
} from './social'

const round = (n) => Math.round(n * 100) / 100

export function useSocial({ enabled, userId, userName, transactions, since, setBalance, addTx, notify, toast }) {
  // the loaded rows, tagged with whose they are so a different login never sees them
  const [loaded, setLoaded] = useState(null)
  const data = loaded?.for === userId ? loaded.rows : null
  // false when the friends tables aren't in the Supabase project yet
  const [setup, setSetup] = useState(true)
  const [failed, setFailed] = useState(false)
  // the friend whose chat is open, so their messages don't also pop up as toasts
  const [openChat, setOpenChat] = useState(null)

  // the latest values, for callbacks that run later (realtime, timers)
  const live = useRef({})
  useEffect(() => {
    live.current = { transactions, since, openChat, data }
  })
  // transfer ids already counted this session, per account
  const applied = useRef({ for: null, ids: new Set() })

  /** Add friend transfers this account hasn't counted yet to the balance. */
  const reconcile = useCallback(
    (d) => {
      if (applied.current.for !== userId) applied.current = { for: userId, ids: new Set() }
      const seen = applied.current.ids
      const have = new Set(live.current.transactions.map((x) => x.ref).filter(Boolean))
      const after = live.current.since ? new Date(live.current.since) : null
      const shaped = shapeSocial(userId, d)
      const fresh = d.transfers.filter((x) => !have.has(x.id) && !seen.has(x.id) && (!after || new Date(x.created_at) > after)).reverse()
      if (!fresh.length) return
      let delta = 0
      for (const x of fresh) {
        seen.add(x.id)
        const inbound = x.recipient === userId
        const amount = Number(x.amount)
        const other = shaped.nameOf(inbound ? x.sender : x.recipient)
        delta += inbound ? amount : -amount
        addTx({
          name: inbound ? `Payment from ${other}` : `Transfer to ${other}`,
          category: 'Transfer',
          kind: inbound ? 'request' : 'transfer',
          method: `${BRAND.name} Pay`,
          amount: inbound ? amount : -amount,
          note: x.note || undefined,
          date: localIso(new Date(x.created_at)),
          ref: x.id,
        })
        if (inbound) {
          notify({
            icon: 'arrowDown',
            tone: 'green',
            title: 'You received {amount}',
            body: 'From {name}',
            vars: { amount: money(amount), name: other },
          })
          toast(t('Money received'), t('{name} sent you {amount}.', { name: other, amount: money(amount) }), { icon: 'receive' })
        }
      }
      setBalance((b) => round(b + delta))
    },
    [userId, addTx, notify, toast, setBalance],
  )

  const refresh = useCallback(async () => {
    try {
      const d = await loadSocial()
      setLoaded({ for: userId, rows: d })
      setSetup(true)
      setFailed(false)
      reconcile(d)
      return d
    } catch (err) {
      if (err?.setup) setSetup(false)
      else setFailed(true)
      return null
    }
  }, [reconcile, userId])

  // pop-ups for things that arrive while the user is elsewhere in the app
  const announce = useCallback(
    (events, d) => {
      const shaped = shapeSocial(userId, d)
      for (const { table, payload } of events) {
        const row = payload.new
        if (payload.eventType !== 'INSERT' || !row) continue
        if (table === 'messages' && row.kind === 'text' && row.recipient === userId && live.current.openChat !== row.sender)
          toast(t('New message from {name}', { name: shaped.nameOf(row.sender) }), row.body.slice(0, 90), { icon: 'chat' })
        if (table === 'money_requests' && row.payer === userId)
          toast(t('{name} asked you for {amount}', { name: shaped.nameOf(row.requester), amount: money(Number(row.amount)) }), row.note || '', {
            icon: 'request',
          })
        if (table === 'connections' && row.addressee === userId)
          toast(t('New friend request'), t('{name} wants to be friends on {brand}.', { name: shaped.nameOf(row.requester), brand: BRAND.name }), {
            icon: 'users',
          })
      }
    },
    [userId, toast],
  )

  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    let stop = null
    let timer = 0
    let queue = []
    const start = async () => {
      await ensureProfile(userName).catch(() => null)
      if (!alive) return
      const d = await refresh()
      if (!alive || !d) return
      // an invite link opened before signing in
      const code = takeInvite()
      if (code) {
        const r = await connectWith({ code }).catch(() => null)
        const say = {
          sent: [t('Friend request sent'), t('{name} will see it next time they open {brand}.', { name: r?.name, brand: BRAND.name })],
          accepted: [t('You’re now friends'), t('You and {name} can chat and send money.', { name: r?.name })],
          already: [t('Already friends'), t('You and {name} are already friends.', { name: r?.name })],
          pending: [t('Friend request sent'), t('{name} hasn’t answered yet.', { name: r?.name })],
          self: [t('That’s your own invite'), t('Send your link to a friend instead.')],
          not_found: [t('Invite link not found'), t('Ask your friend for a fresh link.')],
        }[r?.status] ?? [t('Couldn’t use the invite'), t('Something went wrong. Try again in a minute.')]
        toast(say[0], say[1], { icon: 'users' })
        refresh()
      }
      stop = await watchSocial((table, payload) => {
        queue.push({ table, payload })
        window.clearTimeout(timer)
        timer = window.setTimeout(async () => {
          const events = queue
          queue = []
          const fresh = await refresh()
          if (alive && fresh) announce(events, fresh)
        }, 250)
      })
      if (!alive) stop?.()
    }
    start()
    return () => {
      alive = false
      window.clearTimeout(timer)
      stop?.()
    }
  }, [enabled, userName, refresh, announce, toast])

  /* ---------- actions: each one checks with Supabase, then reloads ---------- */
  const after = useCallback(
    (work) =>
      async (...args) => {
        const out = await work(...args)
        await refresh()
        return out
      },
    [refresh],
  )

  const shaped = useMemo(() => shapeSocial(userId, data), [userId, data])
  // threads being marked read right now, so it's asked once
  const reading = useRef(new Set())
  const unreadFor = useCallback((friend) => shaped?.friends.find((f) => f.id === friend)?.unread ?? 0, [shaped])

  return useMemo(
    () => ({
      enabled,
      setup,
      failed,
      ready: Boolean(data),
      me: userId,
      ...(shaped ?? { friends: [], toPay: [], waiting: [], unread: 0, messages: [], nameOf: () => 'Someone' }),
      inviteUrl: shaped?.self?.invite_code ? inviteLink(shaped.self.invite_code) : null,
      openChat,
      setOpenChat,
      refresh,
      addFriend: after((email) => connectWith({ email })),
      accept: after(acceptConnection),
      removeFriend: after(removeConnection),
      chat: after(sendChat),
      pay: after(sendToFriend),
      ask: after(requestFromFriend),
      decline: after((id) => respondRequest(id, 'decline')),
      cancel: after((id) => respondRequest(id, 'cancel')),
      split: after(createSplit),
      read: async (friend) => {
        if (!unreadFor(friend) || reading.current.has(friend)) return
        reading.current.add(friend)
        await markRead(friend).catch(() => null)
        await refresh()
        reading.current.delete(friend)
      },
    }),
    [enabled, setup, failed, data, userId, shaped, openChat, refresh, after, unreadFor],
  )
}
