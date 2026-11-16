/* ------------------------------------------------------------------
   Calls to the Supabase project for the features that live on the
   server: two-step login, signed-in sessions, payment links, group
   trips, family accounts, the receipts inbox, Gmail, monthly statement
   emails and the calendar feed. See the matching parts of
   supabase/schema.sql and supabase/functions/.
   ------------------------------------------------------------------ */
import { getSupabase, siteUrl } from './supabase'
import { SUPABASE } from '../config'

/** Thrown when that part of schema.sql (or a function) isn't in the project yet. */
export class NotSetUp extends Error {
  setup = true
}
const missing = (e) =>
  ['PGRST202', 'PGRST205', '42P01', '42883'].includes(e?.code) || /does not exist|could not find the (function|table)|schema cache/i.test(e?.message ?? '')
const check = (error) => {
  if (!error) return
  throw missing(error) ? new NotSetUp(error.message) : error
}
async function rpc(name, args) {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc(name, args)
  check(error)
  return data
}
async function rows(table, build = (q) => q) {
  const supabase = await getSupabase()
  const { data, error } = await build(supabase.from(table).select('*'))
  check(error)
  return Array.isArray(data) ? data : []
}
/** Call an Edge Function; errors carry the HTTP status and the function's message. */
async function fn(name, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE.anonKey }
  if (auth) {
    const supabase = await getSupabase()
    const { data } = await supabase.auth.getSession()
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  const res = await fetch(`${SUPABASE.url}/functions/v1/${name}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = res.status === 404 && !out.error ? new NotSetUp(name) : new Error(out.error || `${name} ${res.status}`)
    err.status = res.status
    if (out.setup) err.setup = true
    throw err
  }
  return out
}

/* ---------------- two-step login (TOTP, an authenticator app) ---------------- */
export async function mfaFactors() {
  const supabase = await getSupabase()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return (data?.totp ?? []).filter((f) => f.status === 'verified')
}
/** Start turning it on: returns { id, qr (an SVG data link), secret } to show. */
export async function mfaEnroll() {
  const supabase = await getSupabase()
  // an unfinished earlier try would block a new one
  const { data: list } = await supabase.auth.mfa.listFactors()
  for (const f of list?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => null)
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` })
  if (error) throw error
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}
/** Check a 6-digit code for a factor (finishes turning it on, or signs in with it). */
export async function mfaVerify(factorId, code) {
  const supabase = await getSupabase()
  const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId })
  if (e1) throw e1
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: String(code).replace(/\s/g, '') })
  if (error) throw error
}
export async function mfaRemove(factorId) {
  const supabase = await getSupabase()
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}
/** Does this session still need a code? (two-step login is on, and this session hasn't entered one) */
export async function needsCode() {
  const supabase = await getSupabase()
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) return false
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
}

/* ---------------- signed-in sessions ---------------- */
export const mySessions = () => rpc('my_sessions')
export const endSession = (id) => rpc('end_session', { p_id: id })
/** 'others': every other device; 'global': here too. */
export async function signOutScope(scope) {
  const supabase = await getSupabase()
  const { error } = await supabase.auth.signOut({ scope })
  if (error) throw error
}
/** "Chrome on Windows" from a browser's user agent. */
export function deviceName(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

/* ---------------- payment links ---------------- */
export const createPayLink = (amount, note) => rpc('create_pay_link', { p_amount: amount, p_note: note })
export const cancelPayLink = (id) => rpc('cancel_pay_link', { p_id: id })
export const myPayLinks = () => rows('pay_links', (q) => q.order('created_at', { ascending: false }).limit(100))
export const payLinkUrl = (id) => `${siteUrl()}?pay=${id}`
// the public page (no account): these don't send a login
export const payLinkInfo = (id) => fn('payments', { action: 'link-info', id }, { auth: false })
export const payLinkCheckout = (id, name) => fn('payments', { action: 'link-checkout', id, name, returnUrl: siteUrl() }, { auth: false })
export const payLinkConfirm = (id, session) => fn('payments', { action: 'link-confirm', id, session }, { auth: false })

/* ---------------- group trips ---------------- */
export const groupTrips = (group) => rows('group_trips', (q) => q.eq('group_id', group).order('created_at', { ascending: false }))
export const createTrip = ({ group, name, budget, categories = {}, starts = null, ends = null }) =>
  rpc('create_trip', { p_group: group, p_name: name, p_budget: budget, p_categories: categories, p_starts: starts, p_ends: ends })
export const deleteTrip = (id) => rpc('delete_trip', { p_trip: id })
export const tagSplit = (split, trip, category) => rpc('tag_split', { p_split: split, p_trip: trip, p_category: category })
export const tripSplits = (trip) => rows('splits', (q) => q.eq('trip_id', trip))

/* ---------------- family ---------------- */
export const familyLinks = () => rows('family_links')
export const spendRequests = () => rows('spend_requests', (q) => q.order('created_at', { ascending: false }).limit(100))
export const inviteChild = ({ child, allowance, every, approve }) =>
  rpc('invite_child', { p_child: child, p_allowance: allowance, p_every: every, p_approve: approve })
export const acceptFamily = (id) => rpc('accept_family', { p_id: id })
export const leaveFamily = (id) => rpc('leave_family', { p_id: id })
export const setFamily = ({ id, allowance, every, approve }) => rpc('set_family', { p_id: id, p_allowance: allowance, p_every: every, p_approve: approve })
export const payAllowance = (id) => rpc('pay_allowance', { p_id: id })
export const askToSpend = ({ amount, name, category }) => rpc('ask_to_spend', { p_amount: amount, p_name: name, p_category: category })
export const decideSpend = (id, ok) => rpc('decide_spend', { p_id: id, p_ok: ok })
export const spendRecorded = (id) => rpc('spend_recorded', { p_id: id })

/* ---------------- receipts inbox and Gmail ---------------- */
export const inboxToken = (reset = false) => rpc('my_inbox_token', { p_reset: reset })
/** The address to forward receipts to: the Postmark inbound address with the token after a "+". */
export function inboxAddress(base, token) {
  const [user, domain] = String(base ?? '').split('@')
  return user && domain && token ? `${user}+${token}@${domain}` : ''
}
export const pendingExpenses = () => rows('pending_expenses', (q) => q.order('created_at', { ascending: false }).limit(100))
export async function dismissPending(id) {
  const supabase = await getSupabase()
  const { error } = await supabase.from('pending_expenses').delete().eq('id', id)
  check(error)
}
export const gmailStatus = async () => (await rpc('gmail_status'))?.[0] ?? null
export const gmailConnect = () => fn('gmail', { action: 'connect', returnUrl: siteUrl() })
export const gmailScan = () => fn('gmail', { action: 'scan' })
export const gmailDisconnect = () => fn('gmail', { action: 'disconnect' })

/* ---------------- monthly statement email and the calendar feed ---------------- */
export async function statementPref() {
  const list = await rows('statement_prefs')
  return list[0]?.enabled ?? false
}
export async function setStatementPref(userId, enabled) {
  const supabase = await getSupabase()
  const { error } = await supabase.from('statement_prefs').upsert({ user_id: userId, enabled })
  check(error)
}
export const sendStatementNow = () => fn('statement-email', { action: 'test' })
export const calendarToken = (reset = false) => rpc('my_calendar_token', { p_reset: reset })
export const calendarFeedUrl = (token) => `${SUPABASE.url}/functions/v1/calendar?token=${token}`
