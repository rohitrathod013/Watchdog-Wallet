/* ------------------------------------------------------------------
   Friends, chat and shared money, between real accounts.
   Everything lives in Supabase (see the "Friends, chat and shared
   money" part of supabase/schema.sql): row level security shows each
   person only their own friends and messages, and money only moves
   through SQL functions that check both people are friends.
   ------------------------------------------------------------------ */
import { getSupabase, siteUrl } from './supabase'
import { t } from './i18n'

/** Thrown when the friends tables haven't been added to the Supabase project yet. */
export class SocialNotSetUp extends Error {
  setup = true
}

const missing = (e) =>
  ['PGRST202', 'PGRST205', '42P01', '42883'].includes(e?.code) || /does not exist|could not find the (function|table)/i.test(e?.message ?? '')
const check = (error) => {
  if (!error) return
  throw missing(error) ? new SocialNotSetUp(error.message) : error
}

async function rpc(name, args) {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc(name, args)
  check(error)
  return data
}

export const MAX_FRIEND_PAYMENT = 10000

export const ensureProfile = (name) => rpc('ensure_profile', { p_name: name || null })
/** { status: 'sent' | 'accepted' | 'already' | 'pending' | 'not_found' | 'self', id, name } */
export const connectWith = ({ email = null, code = null }) => rpc('connect_with', { p_email: email, p_code: code })
export const acceptConnection = (id) => rpc('accept_connection', { p_id: id })
export const sendToFriend = ({ to = null, amount = null, note = '', request = null }) =>
  rpc('send_to_friend', { p_to: to, p_amount: amount, p_note: note, p_request: request })
export const requestFromFriend = ({ from, amount, note = '' }) => rpc('request_from_friend', { p_from: from, p_amount: amount, p_note: note })
export const respondRequest = (id, action) => rpc('respond_request', { p_id: id, p_action: action })
export const createSplit = ({ title, total, shares }) => rpc('create_split', { p_title: title, p_total: total, p_shares: shares })
export const markRead = (friend) => rpc('mark_read', { p_friend: friend })

export async function removeConnection(id) {
  const supabase = await getSupabase()
  const { error } = await supabase.from('connections').delete().eq('id', id)
  check(error)
}

/** A photo, video, file or voice note that's already uploaded (see media.js), with an optional caption. */
export async function sendMediaMessage(to, media, body = '') {
  const supabase = await getSupabase()
  const { error } = await supabase.from('messages').insert({ recipient: to, kind: 'media', body: body.slice(0, 2000), media })
  check(error)
}

export async function sendChat(to, body) {
  const supabase = await getSupabase()
  const { error } = await supabase.from('messages').insert({ recipient: to, body })
  check(error)
}

/** Everything the Friends page shows, in one go. */
export async function loadSocial() {
  const supabase = await getSupabase()
  const recent = (table, n) => supabase.from(table).select('*').order('created_at', { ascending: false }).limit(n)
  const [connections, profiles, messages, requests, splits, transfers] = await Promise.all([
    supabase.from('connections').select('*'),
    supabase.from('profiles').select('id, name, email, invite_code'),
    recent('messages', 600),
    recent('money_requests', 300),
    recent('splits', 100),
    recent('transfers', 300),
  ])
  for (const r of [connections, profiles, messages, requests, splits, transfers]) check(r.error)
  return {
    connections: connections.data,
    profiles: profiles.data,
    messages: messages.data.slice().reverse(),
    requests: requests.data,
    splits: splits.data,
    transfers: transfers.data,
  }
}

/** Calls onChange(table, payload) for every new or changed row this user is allowed to see. */
export async function watchSocial(onChange) {
  const supabase = await getSupabase()
  const channel = supabase.channel(`ww-social-${Math.random().toString(36).slice(2)}`)
  for (const table of ['connections', 'messages', 'money_requests', 'transfers'])
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => onChange(table, payload))
  channel.subscribe()
  return () => supabase.removeChannel(channel)
}

/**
 * "Typing…" between two friends: a Realtime broadcast, nothing is stored.
 * Returns { send(typing), stop() }.
 */
export async function typingChannel(me, friend, onTyping) {
  const supabase = await getSupabase()
  const channel = supabase.channel(`ww-typing-${[me, friend].sort().join('-')}`, { config: { broadcast: { self: false } } })
  channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
    if (payload?.from === friend) onTyping(Boolean(payload.typing))
  })
  channel.subscribe()
  return {
    send: (typing) => channel.send({ type: 'broadcast', event: 'typing', payload: { from: me, typing } }).catch(() => null),
    stop: () => supabase.removeChannel(channel),
  }
}

/** A short line for a media message in previews and pop-ups: "📷 Photo", "🎤 Voice message 0:12"… */
export function mediaLabel(media) {
  const type = media?.type
  if (type === 'image') return `📷 ${t('Photo')}`
  if (type === 'video') return `🎬 ${t('Video')}`
  if (type === 'audio') {
    const s = Math.round(media?.duration || 0)
    return `🎤 ${t('Voice message')}${s ? ` ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''}`
  }
  return `📎 ${media?.name || t('File')}`
}

/* ---------------- chat layout ---------------- */
const GROUP_GAP = 5 * 60 * 1000
const dayKey = (iso) => new Date(iso).toDateString()

/**
 * The thread as rows for display: day dividers, and messages marked as the
 * first/last of a run from the same person (one timestamp per run).
 */
export function chatRows(thread) {
  const rows = []
  thread.forEach((m, i) => {
    const prev = thread[i - 1]
    const next = thread[i + 1]
    const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
    if (newDay) rows.push({ type: 'day', key: `day-${m.id}`, at: m.created_at })
    const joins = (a, b) =>
      a &&
      b &&
      a.sender === b.sender &&
      a.kind === 'text' &&
      b.kind === 'text' &&
      dayKey(a.created_at) === dayKey(b.created_at) &&
      Math.abs(new Date(b.created_at) - new Date(a.created_at)) < GROUP_GAP
    rows.push({ type: 'msg', key: m.id, m, first: newDay || !joins(prev, m), last: !joins(m, next) })
  })
  return rows
}

/** Only emoji (up to 6), shown large like other messengers do. */
export const emojiOnly = (text) => {
  const s = text.trim()
  const marks = /\s|\u200d|\ufe0f/g
  return Boolean(s) && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\s|\u200d|\ufe0f)+$/u.test(s) && [...s.replace(marks, '')].length <= 6
}

/* ---------------- invite links: #/friends/invite/<code> ---------------- */
const INVITE_KEY = 'ww-invite'
export const inviteLink = (code) => `${siteUrl()}#/friends/invite/${code}`

/** Keep an invite code from the address bar until someone is signed in to use it. */
export function stashInvite() {
  const m = window.location.hash.match(/^#\/friends\/invite\/([a-z0-9]{6,20})/i)
  if (!m) return
  try {
    localStorage.setItem(INVITE_KEY, m[1].toLowerCase())
  } catch {
    /* storage blocked */
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/friends`)
}
export function takeInvite() {
  try {
    const code = localStorage.getItem(INVITE_KEY)
    localStorage.removeItem(INVITE_KEY)
    return code
  } catch {
    return null
  }
}

/* ---------------- shaping the rows for the page ---------------- */
const round = (n) => Math.round(n * 100) / 100

/**
 * Friends and friend requests with the latest message, unread count and
 * what's owed either way (from open money requests).
 */
export function shapeSocial(me, data) {
  if (!data) return null
  const people = new Map(data.profiles.map((p) => [p.id, p]))
  const nameOf = (id) => {
    const p = people.get(id)
    return p?.name || p?.email?.split('@')[0] || 'Someone'
  }
  const self = people.get(me) ?? null
  const friends = data.connections.map((c) => {
    const id = c.requester === me ? c.addressee : c.requester
    const chat = data.messages.filter((m) => m.sender === id || m.recipient === id)
    const open = data.requests.filter((r) => r.status === 'pending' && (r.payer === id || r.requester === id))
    const owesMe = round(open.filter((r) => r.payer === id).reduce((s, r) => s + Number(r.amount), 0))
    const iOwe = round(open.filter((r) => r.requester === id).reduce((s, r) => s + Number(r.amount), 0))
    return {
      id,
      connId: c.id,
      name: nameOf(id),
      email: people.get(id)?.email ?? '',
      status: c.status === 'accepted' ? 'friend' : c.requester === me ? 'outgoing' : 'incoming',
      since: c.created_at,
      last: chat[chat.length - 1] ?? null,
      unread: chat.filter((m) => m.recipient === me && !m.read_at).length,
      owesMe,
      iOwe,
      hue: [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7),
    }
  })
  friends.sort((a, b) => (b.last?.created_at ?? b.since).localeCompare(a.last?.created_at ?? a.since))
  const requests = new Map(data.requests.map((r) => [r.id, r]))
  const transfers = new Map(data.transfers.map((x) => [x.id, x]))
  const splits = new Map(data.splits.map((s) => [s.id, s]))
  return {
    self,
    friends,
    nameOf,
    requests,
    transfers,
    splits,
    messages: data.messages,
    toPay: data.requests.filter((r) => r.status === 'pending' && r.payer === me),
    waiting: data.requests.filter((r) => r.status === 'pending' && r.requester === me),
    unread: friends.reduce((s, f) => s + f.unread, 0) + friends.filter((f) => f.status === 'incoming').length,
  }
}

/** A friendly line for an error from the friends functions. */
export function friendError(err) {
  const m = err?.message ?? ''
  if (err?.setup) return t('Friends need a one-time setup in Supabase: run the latest supabase/schema.sql.')
  if (/no longer open/i.test(m)) return t('That request is no longer open.')
  if (/only (pay|ask|split)/i.test(m)) return t('You can only do that with friends.')
  if (/more than the bill/i.test(m)) return t('The shares add up to more than the bill.')
  return t('Something went wrong, so nothing was changed. Try again in a minute.')
}

/** Equal shares in cents; any leftover cents go to me (or the first friend if I'm not in it). */
export function splitEqually(total, friendIds, includeMe) {
  const cents = Math.round(total * 100)
  const people = friendIds.length + (includeMe ? 1 : 0)
  if (!people || cents <= 0) return { shares: [], mine: 0 }
  const each = Math.floor(cents / people)
  const left = cents - each * people
  const shares = friendIds.map((id, i) => ({ friend: id, amount: (each + (!includeMe && i === 0 ? left : 0)) / 100 }))
  return { shares, mine: includeMe ? (each + left) / 100 : 0 }
}
