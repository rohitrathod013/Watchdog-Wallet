// Watchdog Wallet: find receipts and bills in Gmail (optional).
//
// The person connects their Gmail once (Google's own sign-in page, read
// only). "Check Gmail" then looks at the last 30 days for receipts and
// bills and adds each one as a pending expense, which they confirm or
// dismiss in the app, the same way Grace asks before adding anything.
// Only the amount, shop, date and subject are kept, never the email.
//
//   POST { action: 'connect', returnUrl }  (signed in)  -> { url }  Google's sign-in page
//   GET  ?code=...&state=...               (Google sends the person back here)
//   POST { action: 'scan' }                (signed in)  -> { found, added }
//   POST { action: 'disconnect' }          (signed in)
//
// Deploy:
//   1. Google Cloud console > a project > APIs & Services: enable the Gmail API;
//      OAuth consent screen: External, add yourself as a test user, scope
//      .../auth/gmail.readonly; Credentials > OAuth client ID (Web application)
//      with this redirect URI: https://<project>.supabase.co/functions/v1/gmail
//   2. Supabase > Edge Functions > Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   3. Deploy this file as "gmail" with "Verify JWT" OFF (Google's redirect has
//      no login token; the signed state is the check).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')
const REDIRECT = `${SUPABASE_URL}/functions/v1/gmail`
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const ALLOWED = (Deno.env.get('SITE_ORIGINS') ?? 'https://rohitrathod013.github.io').split(',').map((s) => s.trim())
const allowedReturn = (raw: unknown) => {
  try {
    const u = new URL(String(raw))
    const local = u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)
    return local || ALLOWED.includes(u.origin) ? `${u.origin}${u.pathname}` : null
  } catch {
    return null
  }
}

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`database ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.status === 204 || res.status === 201 ? null : res.json()
}

async function userOf(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const keys = [req.headers.get('apikey'), ANON_KEY].filter((k, i, all): k is string => Boolean(k) && all.indexOf(k) === i)
  for (const key of keys) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: key } })
    if (res.ok) {
      const user = await res.json().catch(() => null)
      if (user?.id) return user
    }
  }
  return null
}

/* ---------------- the signed state that carries who's connecting ---------------- */
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enc = new TextEncoder()
async function sign(text: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(CLIENT_SECRET!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))))
}
async function makeState(userId: string, back: string) {
  const body = b64u(enc.encode(JSON.stringify({ u: userId, r: back, t: Date.now() })))
  return `${body}.${await sign(body)}`
}
async function readState(state: string) {
  const [body, mac] = String(state).split('.')
  if (!body || !mac || (await sign(body)) !== mac) return null
  const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
  return Date.now() - data.t < 15 * 60 * 1000 ? data : null
}

async function google(url: string, form: Record<string, string>) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error_description ?? body?.error ?? `Google ${res.status}`)
  return body
}

/* ---------------- reading a receipt (the same rules as the inbound-email function) ---------------- */
const SYMBOL: Record<string, string> = { $: 'USD', 'US$': 'USD', USD: 'USD', '€': 'EUR', EUR: 'EUR', '£': 'GBP', GBP: 'GBP', '₹': 'INR', INR: 'INR', Rs: 'INR', 'Rs.': 'INR' }
const AMOUNT = /(US\$|USD|EUR|GBP|INR|Rs\.?|[$€£₹])\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:\.\d{2})?)/g
const TOTAL = /(grand total|order total|total charged|amount charged|amount paid|total paid|payment total|you paid|amount due|balance due|\btotal\b)/i
const NOT_TOTAL = /(sub-?total|tax|vat|shipping|delivery fee|discount|savings|you saved|tip|points)/i
const stripHtml = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#36;/g, '$')
    .replace(/[ \t]+/g, ' ')
const merchantOf = (name: string, email: string) => {
  const clean = String(name ?? '')
    .replace(/["<>]/g, '')
    .replace(/\b(no-?reply|noreply|receipts?|orders?|billing|payments?|notifications?|team|support|via)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length >= 2) return clean.slice(0, 80)
  const domain = String(email ?? '').split('@')[1] ?? ''
  const base = domain.split('.').slice(-2, -1)[0] ?? ''
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Receipt'
}
function readReceipt({ subject = '', text = '', fromName = '', fromEmail = '', date = '' }) {
  const lines = `${subject}\n${text.slice(0, 20000)}`.split(/\n+/)
  let best: { amount: number; cur: string } | null = null
  let biggest: { amount: number; cur: string } | null = null
  for (const line of lines) {
    for (const m of line.matchAll(AMOUNT)) {
      const amount = Number(m[2].replace(/,/g, ''))
      if (!(amount > 0) || amount > 100000) continue
      const found = { amount, cur: SYMBOL[m[1]] ?? 'USD' }
      if (!biggest || amount > biggest.amount) biggest = found
      if (TOTAL.test(line) && !NOT_TOTAL.test(line)) best = found
    }
  }
  const pick = best ?? biggest
  const when = date ? new Date(date) : new Date()
  return {
    merchant: merchantOf(fromName, fromEmail),
    amount: pick ? Math.round(pick.amount * 100) / 100 : null,
    currency: pick?.cur ?? 'USD',
    spent_on: Number.isNaN(when.getTime()) ? null : when.toISOString().slice(0, 10),
    subject: String(subject).slice(0, 200),
  }
}

/* the text of a Gmail message: its plain-text part, or its HTML part without the tags */
const decode = (data: string) => new TextDecoder().decode(Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))
function bodyOf(part: any): { text: string; html: string } {
  if (!part) return { text: '', html: '' }
  if (part.mimeType === 'text/plain' && part.body?.data) return { text: decode(part.body.data), html: '' }
  if (part.mimeType === 'text/html' && part.body?.data) return { text: '', html: decode(part.body.data) }
  let text = ''
  let html = ''
  for (const p of part.parts ?? []) {
    const b = bodyOf(p)
    text ||= b.text
    html ||= b.html
  }
  return { text, html }
}

const QUERY =
  'newer_than:30d (subject:(receipt OR invoice OR "order confirmation" OR "your order" OR "payment received" OR "payment confirmation" OR bill OR statement) OR from:(receipts OR billing OR orders OR invoice))'

async function scan(userId: string) {
  const rows = await db(`gmail_links?user_id=eq.${userId}&select=refresh_token`)
  const refresh = rows?.[0]?.refresh_token
  if (!refresh) return json({ error: 'Gmail isn’t connected' }, 409)
  const { access_token } = await google('https://oauth2.googleapis.com/token', {
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    refresh_token: refresh,
    grant_type: 'refresh_token',
  })
  const api = (path: string) =>
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${access_token}` } }).then((r) => {
      if (!r.ok) throw new Error(`Gmail ${r.status}`)
      return r.json()
    })
  const list = await api(`messages?maxResults=25&q=${encodeURIComponent(QUERY)}`)
  const found = list.messages ?? []
  const fresh: any[] = []
  for (const m of found) {
    const msg = await api(`messages/${m.id}?format=full`)
    const head = (name: string) => msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === name)?.value ?? ''
    const from = head('from')
    const fm = from.match(/^"?([^"<]*)"?\s*<([^>]+)>/)
    const { text, html } = bodyOf(msg.payload)
    const r = readReceipt({
      subject: head('subject'),
      text: text || stripHtml(html) || msg.snippet || '',
      fromName: fm?.[1] ?? '',
      fromEmail: fm?.[2] ?? from,
      date: head('date'),
    })
    if (r.amount) fresh.push({ user_id: userId, source: 'gmail', ref: `gmail:${m.id}`, ...r })
  }
  if (fresh.length)
    await db('pending_expenses?on_conflict=user_id,ref', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(fresh) })
  await db(`gmail_links?user_id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ last_scan: new Date().toISOString() }) })
  return json({ found: found.length, added: fresh.length })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set', setup: true }, 503)

  // Google sends the person back here after they say yes (or no)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const state = await readState(url.searchParams.get('state') ?? '').catch(() => null)
    if (!state) return new Response('This link has expired. Go back to the app and try again.', { status: 400 })
    const back = (result: string) => Response.redirect(`${state.r}?gmail=${result}#/dashboard/transactions`, 302)
    const code = url.searchParams.get('code')
    if (!code) return back('cancelled')
    try {
      const tokens = await google('https://oauth2.googleapis.com/token', {
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      })
      if (!tokens.refresh_token) return back('failed')
      const profile = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then((r) => r.json())
      await db('gmail_links?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: state.u, email: String(profile?.emailAddress ?? '').slice(0, 120), refresh_token: tokens.refresh_token, connected_at: new Date().toISOString() }),
      })
      return back('connected')
    } catch (err) {
      console.error(err)
      return back('failed')
    }
  }

  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  const user = await userOf(req)
  if (!user) return json({ error: 'Log in first' }, 401)
  let input: any = {}
  try {
    input = await req.json()
  } catch {
    return json({ error: 'Send JSON' }, 400)
  }
  try {
    if (input.action === 'connect') {
      const back = allowedReturn(input.returnUrl)
      if (!back) return json({ error: 'That return address isn’t allowed' }, 400)
      const q = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state: await makeState(user.id, back),
      })
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` })
    }
    if (input.action === 'scan') return await scan(user.id)
    if (input.action === 'disconnect') {
      const rows = await db(`gmail_links?user_id=eq.${user.id}&select=refresh_token`)
      const tok = rows?.[0]?.refresh_token
      if (tok) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tok)}`, { method: 'POST' }).catch(() => null)
      await db(`gmail_links?user_id=eq.${user.id}`, { method: 'DELETE' })
      return json({ ok: true })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error(err)
    return json({ error: String(err?.message ?? err) }, 502)
  }
})
