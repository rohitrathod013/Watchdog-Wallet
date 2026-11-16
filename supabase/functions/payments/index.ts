// Watchdog Wallet: card top-ups with Stripe Checkout.
//
// A Supabase Edge Function that keeps the Stripe secret key on the server, so
// it never ships in the website. Deploy it once:
//   1. Stripe dashboard (test mode) > Developers > API keys: copy the
//      "Secret key" (sk_test_...)
//   2. Supabase dashboard > Edge Functions > Secrets: add STRIPE_SECRET_KEY
//   3. Edge Functions > Deploy a new function > name it "payments", paste this file
//   4. In the function's settings, turn OFF "Verify JWT" (this file checks the
//      signed-in user itself)
//
//   POST /functions/v1/payments { action: 'checkout', amount, potId, returnUrl }
//     -> { url }  the Stripe payment page to send the user to
//   POST /functions/v1/payments { action: 'confirm', session }
//     -> { id, amount, currency, potId, test }  once Stripe says it's paid
//
// Those two need the user's login token (Authorization: Bearer ...), and a
// payment can only be confirmed by the account that started it.
//
// Payment links (anyone can pay one, no account needed):
//   POST { action: 'link-info', id }                       -> { amount, note, status, to }
//   POST { action: 'link-checkout', id, name, returnUrl }  -> { url }
//   POST { action: 'link-confirm', id, session }           -> { status: 'paid' }
// The link's owner sees it paid in their app, which adds the money once.

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Stripe only sends people back to the live site or a local dev server
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

async function stripe(path: string, form?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: form ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form ? new URLSearchParams(form) : undefined,
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message ?? `Stripe ${res.status}`)
  return body
}

/** The signed-in Supabase user behind this request, or null. */
async function userOf(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  // try the key the site sent first (the project's publishable key), then the legacy anon key:
  // projects with legacy keys turned off reject the old one, which made every request a 401
  const keys = [req.headers.get('apikey'), ANON_KEY].filter((k, i, all): k is string => Boolean(k) && all.indexOf(k) === i)
  for (const key of keys) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: key } })
    if (res.ok) {
      const user = await res.json().catch(() => null)
      if (user?.id) return user
    } else {
      console.error(`sign-in check: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`)
    }
  }
  return null
}

/* ---------------- payment links: the database, with the service key ---------------- */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`database ${res.status}`)
  return res.status === 204 ? null : res.json()
}
async function linkOf(id: string) {
  if (!UUID.test(id)) return null
  const rows = await db(`pay_links?id=eq.${id}&select=id,owner,amount,note,status,paid_session`)
  return rows?.[0] ?? null
}

async function links(input: any, test: boolean) {
  if (!SERVICE_KEY) return json({ error: 'Payment links aren’t set up', setup: true }, 503)
  const id = String(input.id ?? '')
  const link = await linkOf(id)
  if (!link) return json({ error: 'This payment link doesn’t exist' }, 404)
  const amount = Math.round(Number(link.amount) * 100)

  if (input.action === 'link-info') {
    const who = await db(`profiles?id=eq.${link.owner}&select=name`)
    const to = String(who?.[0]?.name ?? '').trim().split(' ')[0] || 'Someone'
    return json({ amount: amount / 100, note: link.note, status: link.status, to, test })
  }
  if (input.action === 'link-checkout') {
    if (link.status !== 'open') return json({ error: link.status === 'paid' ? 'This link is already paid' : 'This link was cancelled' }, 409)
    const back = allowedReturn(input.returnUrl)
    if (!back) return json({ error: 'That return address isn’t allowed' }, 400)
    const name = String(input.name ?? '').trim().slice(0, 60)
    const session = await stripe('/checkout/sessions', {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': link.note ? `Payment: ${String(link.note).slice(0, 80)}` : 'Payment',
      client_reference_id: `link-${link.id}`,
      'metadata[link_id]': link.id,
      'metadata[payer_name]': name,
      success_url: `${back}?pay=${link.id}&link_paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${back}?pay=${link.id}`,
    })
    return json({ url: session.url, test })
  }
  if (input.action === 'link-confirm') {
    const sid = String(input.session ?? '')
    if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return json({ error: 'Unknown payment' }, 400)
    if (link.status === 'paid') return json({ status: 'paid', same: link.paid_session === sid })
    const s = await stripe(`/checkout/sessions/${sid}`)
    if (s.metadata?.link_id !== link.id || s.amount_total !== amount) return json({ error: 'Unknown payment' }, 404)
    if (s.payment_status !== 'paid') return json({ error: 'Not paid yet', status: s.payment_status }, 409)
    await db(`pay_links?id=eq.${link.id}&status=eq.open`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paid', paid_session: sid, paid_at: new Date().toISOString(), payer_name: String(s.metadata?.payer_name ?? '').slice(0, 60) || null }),
    })
    return json({ status: 'paid' })
  }
  return json({ error: 'Unknown action' }, 400)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  if (!STRIPE_KEY) return json({ error: 'STRIPE_SECRET_KEY is not set', setup: true }, 503)
  const test = STRIPE_KEY.startsWith('sk_test_')
  let input: any = {}
  try {
    input = await req.json()
  } catch {
    return json({ error: 'Send JSON' }, 400)
  }
  // payment links are for people without an account: no login needed
  if (String(input.action ?? '').startsWith('link-')) {
    try {
      return await links(input, test)
    } catch (err) {
      return json({ error: String(err?.message ?? err) }, 502)
    }
  }
  const user = await userOf(req)
  if (!user) return json({ error: 'Log in first' }, 401)

  try {
    if (input.action === 'checkout') {
      const amount = Math.round(Number(input.amount) * 100)
      if (!(amount >= 100 && amount <= 1_000_000)) return json({ error: 'Amount must be between $1 and $10,000' }, 400)
      const back = allowedReturn(input.returnUrl)
      if (!back) return json({ error: 'That return address isn’t allowed' }, 400)
      const potId = typeof input.potId === 'string' ? input.potId.slice(0, 60) : ''
      const session = await stripe('/checkout/sessions', {
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(amount),
        'line_items[0][price_data][product_data][name]': 'Watchdog Wallet top-up',
        client_reference_id: user.id,
        ...(user.email ? { customer_email: user.email } : {}),
        'metadata[user_id]': user.id,
        'metadata[pot_id]': potId,
        success_url: `${back}?paid={CHECKOUT_SESSION_ID}#/dashboard`,
        cancel_url: `${back}?paid=cancel#/dashboard`,
      })
      return json({ url: session.url, test })
    }

    if (input.action === 'confirm') {
      const id = String(input.session ?? '')
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: 'Unknown payment' }, 400)
      const s = await stripe(`/checkout/sessions/${id}`)
      if (s.client_reference_id !== user.id) return json({ error: 'Unknown payment' }, 404)
      if (s.payment_status !== 'paid') return json({ error: 'Not paid yet', status: s.payment_status }, 409)
      return json({ id: s.id, amount: s.amount_total / 100, currency: s.currency, potId: s.metadata?.pot_id || null, test })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 502)
  }
})
