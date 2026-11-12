/* ------------------------------------------------------------------
   Grace's free-form answers. When her own rules (assistant.js) don't
   recognise a question, the chat asks the "grace" Supabase Edge
   Function (supabase/functions/grace), which passes it to a hosted LLM
   (Google Gemini's free tier by default). The model only talks: every
   action still goes through Grace's rules and your confirmation.

   It sends the question, the last few messages and a short summary of
   the account below. Nothing else, and no card or account numbers.
   ------------------------------------------------------------------ */
import { SUPABASE } from '../config'
import { getLocale } from './i18n'
import { getSupabase } from './supabase'

const usd = (n) => `$${(Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-US')}`
const noDigits = (s) => String(s ?? '').replace(/\d{4,}/g, '••••')

/** A few lines about the account, for the model to answer from. */
export function financeBrief(app) {
  if (!app) return ''
  const lines = []
  if (Number.isFinite(app.balance)) lines.push(`Balance: ${usd(app.balance)}`)
  if (app.currency && app.currency !== 'USD') lines.push(`The user views amounts in ${app.currency}.`)
  const month = app.stats?.periods?.month
  if (month) lines.push(`This month: income ${usd(month.income)}, spending ${usd(month.expenses)}, net ${usd(month.net)}`)
  const cats = (app.stats?.categories ?? []).slice(0, 6)
  if (cats.length) lines.push(`Spending by category this month: ${cats.map((c) => `${c.name} ${usd(c.v)}`).join(', ')}`)
  const budgets = app.stats?.budgets ?? app.budgets ?? []
  if (budgets.length) lines.push(`Budgets (spent of limit): ${budgets.map((b) => `${b.name} ${usd(b.spent ?? 0)} of ${usd(b.limit)}`).join(', ')}`)
  const goals = app.goals ?? []
  if (goals.length) lines.push(`Goals: ${goals.map((g) => `${g.name} ${usd(g.saved)} of ${usd(g.target)}${g.due ? ` by ${g.due}` : ''}`).join(', ')}`)
  const bills = (app.bills ?? []).filter((b) => !b.paid)
  if (bills.length) lines.push(`Unpaid bills: ${bills.map((b) => `${b.name} ${usd(b.amount)} due ${b.due}`).join(', ')}`)
  const pots = app.pots ?? []
  if (pots.length) lines.push(`Pots: ${pots.map((p) => `${p.name} ${usd(p.amount)}`).join(', ')}`)
  const tx = (app.transactions ?? []).slice(0, 8)
  if (tx.length)
    lines.push(
      `Latest transactions: ${tx.map((x) => `${String(x.date ?? '').slice(0, 10)} ${noDigits(x.name)} ${x.amount < 0 ? '-' : '+'}${usd(Math.abs(x.amount))} (${x.category})`).join('; ')}`,
    )
  return lines.join('\n').slice(0, 4000)
}

/**
 * Ask the model. Resolves to its answer, or null when it isn't available
 * (not signed in, the demo, the function isn't set up, offline or busy).
 */
export async function askModel(question, history, app) {
  if (!SUPABASE.url || app?.demo) return null
  try {
    const supabase = await getSupabase()
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return null
    const res = await fetch(`${SUPABASE.url.replace(/\/rest\/v1\/?$/, '')}/functions/v1/grace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        question: noDigits(question),
        history: (history ?? [])
          .filter((m) => (m.from === 'me' || m.from === 'bot') && typeof m.text === 'string' && m.text)
          .slice(-10)
          .map((m) => ({ from: m.from, text: noDigits(m.text).slice(0, 1000) })),
        brief: financeBrief(app),
        language: getLocale(),
      }),
      signal: AbortSignal.timeout?.(20000),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      // shows why in the browser console (F12), e.g. a bad key or the free tier's limit
      console.warn(`Grace's LLM: ${res.status} ${out.error ?? ''}`)
      return null
    }
    return typeof out.text === 'string' && out.text.trim() ? out.text.trim() : null
  } catch {
    return null
  }
}
