// Watchdog Wallet: last month's statement, emailed on the 1st.
//
// Everyone who turned it on (statement_prefs in schema.sql) gets an email
// with last month's money in and out, spending by category, budgets and
// every transaction. It's sent through Brevo (free: 300 emails a day).
//
//   POST (header x-cron-secret: <STATEMENT_CRON_SECRET>)  the monthly run, from pg_cron
//   POST { action: 'test' } (signed in)                   send me last month's now
//
// Deploy:
//   1. Brevo > SMTP & API > API keys: create one. Senders: add and verify the
//      email address the statements come from.
//   2. Supabase > Edge Functions > Secrets: BREVO_API_KEY, STATEMENT_FROM (that
//      sender address), STATEMENT_CRON_SECRET (a long random text you make)
//   3. Deploy this file as "statement-email" with "Verify JWT" OFF
//   4. The monthly run: see "Monthly statement email" in the setup notes.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const BREVO_KEY = Deno.env.get('BREVO_API_KEY')
const FROM = Deno.env.get('STATEMENT_FROM')
const CRON_SECRET = Deno.env.get('STATEMENT_CRON_SECRET')
const SITE = (Deno.env.get('SITE_ORIGINS') ?? 'https://rohitrathod013.github.io').split(',')[0].trim()
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`database ${res.status}`)
  return res.status === 204 ? null : res.json()
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
async function emailOf(userId: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!res.ok) return null
  const u = await res.json()
  return { email: u.email as string, name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? '').trim() }
}

/* ---------------- the statement ---------------- */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const c = (n: unknown) => Math.round((Number(n) || 0) * 100)
const money = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

/** The month before `now`, as 'YYYY-MM'. */
const lastMonth = (now = new Date()) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function statement(data: any, month: string) {
  const rows = (data?.transactions ?? []).filter((x: any) => String(x.date).startsWith(month) && (!x.status || x.status === 'Completed'))
  let inC = 0
  let outC = 0
  const byCat = new Map<string, number>()
  for (const x of rows) {
    if (x.amount > 0) inC += c(x.amount)
    else {
      outC += -c(x.amount)
      byCat.set(x.category, (byCat.get(x.category) ?? 0) - c(x.amount))
    }
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  const budgets = (data?.budgets ?? []).map((b: any) => ({ name: b.name, limit: c(b.limit), spent: byCat.get(b.name) ?? 0 }))
  return { rows: rows.sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))), inC, outC, cats, budgets, balance: c(data?.balance) }
}

function html(st: ReturnType<typeof statement>, month: string, name: string) {
  const [y, m] = month.split('-').map(Number)
  const title = `${MONTHS[m - 1]} ${y}`
  const td = 'padding:8px 10px;border-bottom:1px solid #eee;font-size:13px'
  const tile = (label: string, value: string, color = '#151515') =>
    `<td style="padding:12px;background:#f6f6f6;border-radius:12px"><div style="font-size:12px;color:#67676c">${label}</div><div style="font-size:20px;font-weight:600;color:${color}">${value}</div></td>`
  return `<!doctype html><html><body style="margin:0;background:#efefef;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#151515">
<div style="max-width:640px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:20px;padding:24px">
<p style="margin:0;color:#ef6c2f;font-weight:700">Watchdog Wallet</p>
<h1 style="margin:6px 0 4px;font-size:24px">Your ${esc(title)} statement</h1>
<p style="margin:0 0 18px;color:#67676c">Hi ${esc(name || 'there')}, here's how last month went.</p>
<table role="presentation" style="width:100%;border-spacing:8px 0"><tr>
${tile('Money in', money(st.inC), '#24704f')}${tile('Money out', money(st.outC), '#c42b31')}${tile('Net', money(st.inC - st.outC))}
</tr></table>
<p style="margin:12px 0 0;color:#67676c;font-size:13px">Balance today: <b style="color:#151515">${money(st.balance)}</b></p>
${
  st.cats.length
    ? `<h2 style="font-size:16px;margin:22px 0 8px">Spending by category</h2><table style="width:100%;border-collapse:collapse">${st.cats
        .slice(0, 10)
        .map(([cat, v]) => `<tr><td style="${td}">${esc(cat)}</td><td style="${td};text-align:right">${money(v)}</td></tr>`)
        .join('')}</table>`
    : ''
}
${
  st.budgets.length
    ? `<h2 style="font-size:16px;margin:22px 0 8px">Budgets</h2><table style="width:100%;border-collapse:collapse">${st.budgets
        .map(
          (b: any) =>
            `<tr><td style="${td}">${esc(b.name)}</td><td style="${td};text-align:right;color:${b.spent > b.limit ? '#c42b31' : '#151515'}">${money(b.spent)} of ${money(b.limit)}</td></tr>`,
        )
        .join('')}</table>`
    : ''
}
<h2 style="font-size:16px;margin:22px 0 8px">Transactions (${st.rows.length})</h2>
${
  st.rows.length
    ? `<table style="width:100%;border-collapse:collapse">${st.rows
        .slice(0, 150)
        .map(
          (x: any) =>
            `<tr><td style="${td};color:#67676c;white-space:nowrap">${esc(String(x.date).slice(5, 10))}</td><td style="${td}">${esc(x.name)}<br><span style="color:#67676c;font-size:12px">${esc(x.category)}</span></td><td style="${td};text-align:right;white-space:nowrap;color:${x.amount > 0 ? '#24704f' : '#151515'}">${money(c(x.amount))}</td></tr>`,
        )
        .join('')}</table>${st.rows.length > 150 ? `<p style="color:#67676c;font-size:12px">The first 150 are shown. Open the app for all of them.</p>` : ''}`
    : '<p style="color:#67676c">No transactions last month.</p>'
}
<p style="margin:22px 0 0"><a href="${esc(SITE)}/Watchdog-Wallet/#/dashboard/reports" style="background:#151515;color:#fff;padding:10px 16px;border-radius:99px;text-decoration:none;font-size:14px">Open Watchdog Wallet</a></p>
</div>
<p style="color:#8b8b8b;font-size:12px;text-align:center;margin:14px 0 0">You get this because monthly statements are on. Turn them off in the app under Account settings.</p>
</div></body></html>`
}

async function sendOne(userId: string, month: string) {
  const who = await emailOf(userId)
  if (!who?.email) return false
  const state = await db(`user_state?user_id=eq.${userId}&select=data`)
  const st = statement(state?.[0]?.data ?? {}, month)
  const [y, m] = month.split('-').map(Number)
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY!, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Watchdog Wallet', email: FROM },
      to: [{ email: who.email, ...(who.name ? { name: who.name } : {}) }],
      subject: `Your ${MONTHS[m - 1]} ${y} statement`,
      htmlContent: html(st, month, who.name.split(' ')[0]),
    }),
  })
  if (!res.ok) throw new Error(`Brevo ${res.status} ${(await res.text()).slice(0, 200)}`)
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  if (!BREVO_KEY || !FROM) return json({ error: 'BREVO_API_KEY and STATEMENT_FROM are not set', setup: true }, 503)
  const month = lastMonth()

  // the monthly run
  const secret = req.headers.get('x-cron-secret')
  if (secret) {
    if (!CRON_SECRET || secret !== CRON_SECRET) return json({ error: 'Forbidden' }, 403)
    const prefs = await db(`statement_prefs?enabled=eq.true&or=(last_sent.is.null,last_sent.neq.${month})&select=user_id&limit=250`)
    let sent = 0
    for (const p of prefs ?? []) {
      try {
        if (await sendOne(p.user_id, month)) sent++
        await db(`statement_prefs?user_id=eq.${p.user_id}`, { method: 'PATCH', body: JSON.stringify({ last_sent: month }) })
      } catch (err) {
        console.error(p.user_id, err)
      }
    }
    return json({ month, sent })
  }

  // "send me one now"
  const user = await userOf(req)
  if (!user) return json({ error: 'Log in first' }, 401)
  try {
    await sendOne(user.id, month)
    return json({ sent: true, month })
  } catch (err) {
    console.error(err)
    return json({ error: String(err?.message ?? err) }, 502)
  }
})
