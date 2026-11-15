/* ------------------------------------------------------------------
   What's coming: repeating transactions and unpaid bills due in a date
   range, and one list of everything you pay for on repeat (the rules
   you set up, plus repeat charges spotted in your history).
   Dates are 'YYYY-MM-DD' days.
   ------------------------------------------------------------------ */
import { nextRun, validDay } from './recurring'
import { subscriptions } from './insights'
import { merchantKey } from './ml/anomaly.js'

const PER_MONTH = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, yearly: 1 / 12 }
const round2 = (n) => Math.round(n * 100) / 100
const two = (n) => String(n).padStart(2, '0')
export const dayOf = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  return dayOf(new Date(y, m - 1, d + n))
}

/** Every run of a rule after `from` and up to `to` (both 'YYYY-MM-DD'). Paused rules have none. */
export function runsBetween(rule, from, to) {
  if (!rule?.active || !validDay(rule.next)) return []
  const out = []
  let d = rule.next
  let guard = 0
  while (d <= to && guard++ < 400) {
    if (d > from) out.push(d)
    d = nextRun(d, rule.every, rule.anchor)
  }
  return out
}

/**
 * Money due after `from` up to `to`: runs of repeating transactions and unpaid bills with a due date.
 * → [{ day, name, amount (signed), category, source: 'repeat' | 'bill' }], soonest first.
 */
export function upcoming({ rules = [], bills = [] }, from, to) {
  const out = []
  for (const r of rules) for (const day of runsBetween(r, from, to)) out.push({ day, name: r.name, amount: r.amount, category: r.category, source: 'repeat' })
  for (const b of bills) {
    if (b.paid || !b.dueDate) continue
    const day = String(b.dueDate).slice(0, 10)
    if (day > from && day <= to && !out.some((x) => x.day === day && merchantKey(x.name) === merchantKey(b.name)))
      out.push({ day, name: b.name, amount: -Math.abs(b.amount), category: b.category ?? 'Bills', source: 'bill' })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.amount - b.amount)
}

/** Next 7 days by default. */
export const nextDays = (app, days = 7, now = new Date()) => {
  const today = dayOf(now)
  return upcoming({ rules: app.recurring ?? [], bills: app.bills ?? [] }, addDays(today, -1), addDays(today, days - 1))
}

/**
 * Everything paid for on repeat, as one list:
 *  - expense rules the user set up (active or paused), with their real next date
 *  - repeat charges spotted in the history that no rule covers, with an estimated next date
 * Each: { key, name, amount (positive), every, monthly, yearly, next, category, source: 'rule' | 'spotted' | 'bill',
 *         ruleId, active, rise: { from, to } | null, last }
 * Totals count active items only.
 */
export function subscriptionList({ transactions = [], bills = [], rules = [], now = new Date() }) {
  const items = []
  const covered = new Set()
  for (const r of rules) {
    if (!(r.amount < 0)) continue
    covered.add(merchantKey(r.name))
    const amount = -r.amount
    // the last time this rule added a charge, to spot a price change against what it charges now
    const made = transactions.filter((x) => x.repeat === r.id || merchantKey(x.name) === merchantKey(r.name)).sort((a, b) => b.date.localeCompare(a.date))
    const prev = made.find((x) => Math.abs(-x.amount - amount) > 0.009)
    items.push({
      key: `rule:${r.id}`,
      name: r.name,
      amount,
      every: r.every,
      monthly: round2(amount * PER_MONTH[r.every]),
      yearly: round2(amount * PER_MONTH[r.every] * 12),
      next: r.active ? r.next : null,
      category: r.category,
      source: 'rule',
      ruleId: r.id,
      active: Boolean(r.active),
      rise: prev && -prev.amount < amount ? { from: -prev.amount, to: amount } : null,
      last: made[0]?.date?.slice(0, 10) ?? null,
    })
  }
  for (const s of subscriptions(transactions, bills).items) {
    if (covered.has(merchantKey(s.name))) continue
    covered.add(merchantKey(s.name))
    // spotted ones repeat monthly: next is a month after the last charge (rolled forward past today)
    let next = null
    if (s.last) {
      const [y, m, d] = s.last.slice(0, 10).split('-').map(Number)
      next = nextRun(dayOf(new Date(y, m - 1, d)), 'monthly', d)
      const today = dayOf(now)
      let guard = 0
      while (next <= today && guard++ < 24) next = nextRun(next, 'monthly', d)
    }
    items.push({
      key: `spotted:${merchantKey(s.name)}`,
      name: s.name,
      amount: s.amount,
      every: 'monthly',
      monthly: round2(s.amount),
      yearly: round2(s.amount * 12),
      next,
      category: s.tx?.category ?? 'Subscriptions',
      source: s.count ? 'spotted' : 'bill',
      ruleId: null,
      active: true,
      rise: s.previous != null && s.amount > s.previous + 0.009 ? { from: s.previous, to: s.amount } : null,
      last: s.last?.slice(0, 10) ?? null,
    })
  }
  items.sort((a, b) => Number(b.active) - Number(a.active) || b.monthly - a.monthly)
  const on = items.filter((i) => i.active)
  const monthly = round2(on.reduce((s, i) => s + i.monthly, 0))
  return { items, monthly, yearly: round2(monthly * 12) }
}
