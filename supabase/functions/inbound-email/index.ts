// Watchdog Wallet: receipts sent by email become pending expenses.
//
// Each account gets a private address like
//   <your-postmark-address>+<token>@inbound.postmarkapp.com
// (the token comes from my_inbox_token in schema.sql). Forward a receipt
// there, or set a Gmail filter to forward them, and Postmark posts the
// email here. The amount, shop and date are read from it and it waits in
// the app until the person confirms or dismisses it.
//
// Deploy:
//   1. Postmark (free developer plan) > a server > Inbound stream: copy its
//      inbound address, and set the webhook URL to
//      https://<project>.supabase.co/functions/v1/inbound-email?key=<INBOUND_SECRET>
//   2. Supabase > Edge Functions > Secrets: INBOUND_SECRET (a long random
//      text you make), INBOUND_ADDRESS (the Postmark inbound address)
//   3. Deploy this file as "inbound-email" with "Verify JWT" OFF (Postmark
//      can't sign in; the secret in the URL is the check).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const SECRET = Deno.env.get('INBOUND_SECRET')

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`database ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.status === 204 || res.status === 201 ? null : res.json()
}

/* ---------------- reading a receipt (the same rules as the gmail function) ---------------- */
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

export function readReceipt({ subject = '', text = '', html = '', fromName = '', fromEmail = '', date = '' }) {
  let body = text || stripHtml(html)
  // a forwarded email: the shop is the original sender, not the person forwarding
  const fwd = body.match(/From:\s*"?([^"<\n]*)"?\s*<([^>\n]+)>/i)
  if (fwd) {
    fromName = fwd[1]
    fromEmail = fwd[2]
  }
  body = body.slice(0, 20000)
  const lines = `${subject}\n${body}`.split(/\n+/)
  let best: { amount: number; cur: string } | null = null
  let biggest: { amount: number; cur: string } | null = null
  for (const line of lines) {
    for (const m of line.matchAll(AMOUNT)) {
      const amount = Number(m[2].replace(/,/g, ''))
      if (!(amount > 0) || amount > 100000) continue
      const found = { amount, cur: SYMBOL[m[1]] ?? 'USD' }
      if (!biggest || amount > biggest.amount) biggest = found
      // the last "total" line wins (orders list the subtotal first)
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 })
  if (!SECRET || !SERVICE_KEY) return new Response('Not set up', { status: 503 })
  if (new URL(req.url).searchParams.get('key') !== SECRET) return new Response('Forbidden', { status: 403 })
  let mail: any
  try {
    mail = await req.json()
  } catch {
    return new Response('Send JSON', { status: 400 })
  }
  // the private token: the part after "+" in the address it was sent to
  const hash = String(mail.MailboxHash ?? '')
    .trim()
    .toLowerCase()
  if (!/^[0-9a-f]{12}$/.test(hash)) return new Response('ok') // not one of ours: accept quietly so Postmark doesn't retry
  try {
    const owner = await db(`inbox_tokens?token=eq.${hash}&select=user_id`)
    const userId = owner?.[0]?.user_id
    if (!userId) return new Response('ok')
    const r = readReceipt({
      subject: mail.Subject,
      text: mail.TextBody,
      html: mail.HtmlBody,
      fromName: mail.FromFull?.Name ?? mail.FromName,
      fromEmail: mail.FromFull?.Email ?? mail.From,
      date: mail.Date,
    })
    await db('pending_expenses?on_conflict=user_id,ref', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ user_id: userId, source: 'email', ref: String(mail.MessageID ?? crypto.randomUUID()).slice(0, 200), ...r }),
    })
    return new Response('ok')
  } catch (err) {
    console.error(err)
    return new Response('Try again', { status: 500 })
  }
})
