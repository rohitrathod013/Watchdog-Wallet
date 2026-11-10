/* ------------------------------------------------------------------
   Card top-ups through Stripe Checkout. The Stripe secret key lives
   only in the "payments" Supabase Edge Function
   (supabase/functions/payments); the site just asks it for a payment
   page, and afterwards asks it whether that payment went through.
   ------------------------------------------------------------------ */
import { SUPABASE } from '../config'
import { getSupabase, siteUrl } from './supabase'

/** Thrown when the payments function isn't deployed or has no Stripe key yet. */
export class PaymentsNotSetUp extends Error {
  setup = true
}

export const MIN_TOPUP = 1
export const MAX_TOPUP = 10000

async function call(body) {
  const supabase = await getSupabase()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Log in first')
  let res
  try {
    res = await fetch(`${SUPABASE.url.replace(/\/rest\/v1\/?$/, '')}/functions/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch (err) {
    // a function that isn't deployed fails the browser's CORS check, which looks like a network error
    throw new PaymentsNotSetUp(err?.message ?? 'payments function unreachable')
  }
  const out = await res.json().catch(() => ({}))
  if (res.status === 404 && !out.error) throw new PaymentsNotSetUp('payments function: 404')
  if (res.status === 503 || out.setup) throw new PaymentsNotSetUp(out.error ?? 'no Stripe key')
  if (!res.ok) throw Object.assign(new Error(out.error ?? `payments function: ${res.status}`), { status: res.status })
  return out
}

/** Send the user to Stripe's payment page for this amount (USD). */
export async function startCardPayment({ amount, potId }) {
  const { url } = await call({ action: 'checkout', amount, potId: potId || '', returnUrl: siteUrl() })
  if (!url) throw new Error('Stripe sent no payment page')
  window.location.assign(url)
}

/** Ask whether a finished Stripe payment is paid: { id, amount, currency, potId, test }. */
export const confirmCardPayment = (session) => call({ action: 'confirm', session })

/**
 * The Stripe result in the address bar after coming back from Checkout:
 * a session id, 'cancel', or null. Removes it so a reload can't count it twice.
 */
export function takePaymentReturn() {
  const params = new URLSearchParams(window.location.search)
  const paid = params.get('paid')
  if (!paid) return null
  params.delete('paid')
  const q = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`)
  return paid
}
