// Watchdog Wallet: a calendar feed of bills and repeating payments.
//
// Google Calendar, Apple Calendar or Outlook subscribe to
//   https://<project>.supabase.co/functions/v1/calendar?token=<private token>
// and check it every few hours. The token (from my_calendar_token in
// schema.sql) is the only key: whoever has the link sees the bills, so
// the app can make a new link, which stops the old one working.
//
// Deploy: Edge Functions > Deploy a new function > name it "calendar",
// paste this file, and turn OFF "Verify JWT" (calendar apps can't sign in).
// It reads with the service key, which Supabase gives every function.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

async function db(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!res.ok) throw new Error(`database ${res.status}`)
  return res.json()
}

/* the same calendar as src/lib/ics.js builds in the app */
const FREQ: Record<string, string> = { weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }
const text = (s: unknown) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1')
const fold = (line: string) => {
  const out: string[] = []
  let rest = line
  while (rest.length > 74) {
    out.push(rest.slice(0, 74))
    rest = ` ${rest.slice(74)}`
  }
  out.push(rest)
  return out.join('\r\n')
}
const day = (iso: string) => String(iso).slice(0, 10).replace(/-/g, '')
const nextDay = (iso: string) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1, d + 1))
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`
}
const money = (n: unknown) => `$${Math.abs(Number(n) || 0).toFixed(2)}`
const isDay = (s: unknown) => /^\d{4}-\d{2}-\d{2}/.test(String(s ?? ''))

function build(data: any) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const events: string[][] = []
  const alarm = (name: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(`${name} is due`)}`, 'TRIGGER:-P1D', 'END:VALARM']
  for (const r of data?.recurring ?? []) {
    if (!r?.active || !(r.amount < 0) || !isDay(r.next)) continue
    events.push([
      'BEGIN:VEVENT',
      `UID:repeat-${r.id}@watchdog-wallet`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(r.next)}`,
      `DTEND;VALUE=DATE:${nextDay(r.next)}`,
      `RRULE:${FREQ[r.every] ?? FREQ.monthly}`,
      `SUMMARY:${text(`${r.name} ${money(r.amount)}`)}`,
      `DESCRIPTION:${text(`${r.category ?? 'Repeating payment'} · ${money(r.amount)}`)}`,
      'TRANSP:TRANSPARENT',
      ...alarm(r.name),
      'END:VEVENT',
    ])
  }
  for (const b of data?.bills ?? []) {
    if (b?.paid || !isDay(b.dueDate)) continue
    events.push([
      'BEGIN:VEVENT',
      `UID:bill-${b.id}@watchdog-wallet`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(b.dueDate)}`,
      `DTEND;VALUE=DATE:${nextDay(b.dueDate)}`,
      `SUMMARY:${text(`${b.name} ${money(b.amount)}`)}`,
      `DESCRIPTION:${text(`Bill due · ${money(b.amount)}`)}`,
      'TRANSP:TRANSPARENT',
      ...alarm(b.name),
      'END:VEVENT',
    ])
  }
  // credit card payment due dates, every month
  for (const a of data?.accounts ?? []) {
    if (a?.type !== 'credit' || !a.dueDay) continue
    const now = new Date()
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(a.dueDay, 28)))
    const iso = first.toISOString().slice(0, 10)
    events.push([
      'BEGIN:VEVENT',
      `UID:card-${a.id}@watchdog-wallet`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(iso)}`,
      `DTEND;VALUE=DATE:${nextDay(iso)}`,
      `RRULE:FREQ=MONTHLY;BYMONTHDAY=${a.dueDay > 28 ? -1 : a.dueDay}`,
      `SUMMARY:${text(`${a.name} payment due`)}`,
      'TRANSP:TRANSPARENT',
      ...alarm(`${a.name} payment`),
      'END:VEVENT',
    ])
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Watchdog Wallet//Bills//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Watchdog Wallet bills',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...events.flat(),
    'END:VCALENDAR',
  ]
  return `${lines.map(fold).join('\r\n')}\r\n`
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Use GET', { status: 405 })
  if (!SERVICE_KEY) return new Response('Not set up', { status: 503 })
  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!/^[0-9a-f]{32,64}$/.test(token)) return new Response('Not found', { status: 404 })
  try {
    const rows = await db(`calendar_tokens?token=eq.${token}&select=user_id`)
    const userId = rows?.[0]?.user_id
    if (!userId) return new Response('Not found', { status: 404 })
    const state = await db(`user_state?user_id=eq.${userId}&select=data`)
    const body = build(state?.[0]?.data ?? {})
    return new Response(req.method === 'HEAD' ? null : body, {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline; filename="bills.ics"' },
    })
  } catch (err) {
    console.error(err)
    return new Response('Try again later', { status: 502 })
  }
})
