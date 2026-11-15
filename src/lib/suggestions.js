/* ------------------------------------------------------------------
   Grace's suggestions: small changes that would make the app fit how
   you actually spend. Each one says why, and what Apply would do.
     repeat   a charge paid 3+ months running that isn't a repeating rule
     raise    a budget that went over its limit 3 full months in a row
     budget   a category with $150+ a month of spending and no budget
   Dismissed ones (by key) don't come back.
   ------------------------------------------------------------------ */
import { subscriptions } from './insights'
import { merchantKey } from './ml/anomaly.js'
import { nextRun } from './recurring'

const c = (n) => Math.round((Number(n) || 0) * 100)
const two = (n) => String(n).padStart(2, '0')
const monthKeyOf = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}`
const NOT_SPENDING = new Set(['Transfer', 'Investment', 'Savings', 'Transfer to pot'])
const BILL_LIKE = new Set(['Subscriptions', 'Bills', 'Utilities', 'Phone & Internet', 'Insurance', 'Housing', 'Fitness', 'Education', 'Debt Payments', 'Entertainment', 'Health'])

/** Spending per category for each of the last `n` full months: Map(category → [cents, …] oldest first). */
function monthlyByCategory(transactions, now, n = 3) {
  const months = []
  for (let k = n; k >= 1; k--) months.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - k, 1)))
  const out = new Map()
  for (const x of transactions) {
    if (!(x.amount < 0) || NOT_SPENDING.has(x.category) || (x.status && x.status !== 'Completed')) continue
    const i = months.indexOf(String(x.date).slice(0, 7))
    if (i < 0) continue
    if (!out.has(x.category)) out.set(x.category, new Array(n).fill(0))
    out.get(x.category)[i] += -c(x.amount)
  }
  return { months, byCat: out }
}

const roundUp50 = (cents) => Math.ceil(cents / 100 / 50) * 50

/**
 * → [{ key, kind, text, vars, apply: { label, vars }, change }] most useful first.
 * change describes what Apply does: { type: 'repeat', rule } | { type: 'raise', id, limit } | { type: 'budget', name, limit }
 */
export function suggestions({ transactions = [], budgets = [], recurring = [], dismissed = [] }, now = new Date()) {
  const skip = new Set(dismissed)
  const out = []

  // 1. repeat charges that aren't rules yet
  const ruled = new Set(recurring.map((r) => merchantKey(r.name)))
  for (const s of subscriptions(transactions, []).items) {
    // only bill-like charges: a supermarket you shop at every month isn't a subscription
    if (s.count < 3 || ruled.has(merchantKey(s.name)) || !s.tx || !BILL_LIKE.has(s.tx.category)) continue
    const key = `repeat:${merchantKey(s.name)}`
    if (skip.has(key)) continue
    const last = String(s.tx.date).slice(0, 10)
    let next = nextRun(last, 'monthly', Number(last.slice(8, 10)))
    const today = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
    let guard = 0
    while (next <= today && guard++ < 24) next = nextRun(next, 'monthly', Number(last.slice(8, 10)))
    out.push({
      key,
      kind: 'repeat',
      text: 'You’ve paid **{name}** ({amount}) {n} months running. Make it a repeating transaction, so it’s added by itself and counted in your forecast?',
      vars: { name: s.name, amount: s.amount, n: s.count },
      apply: 'Make it repeating',
      change: { type: 'repeat', rule: { name: s.name, amount: -s.amount, category: s.tx.category, every: 'monthly', start: next } },
    })
  }

  // 2. and 3. budgets that don't fit, and spending that has no budget
  const { byCat } = monthlyByCategory(transactions, now)
  for (const b of budgets) {
    const months = byCat.get(b.name)
    const limit = c(b.baseLimit ?? b.limit)
    if (!months || !limit || !months.every((v) => v > limit)) continue
    const key = `raise:${b.id}`
    if (skip.has(key)) continue
    const avg = Math.round(months.reduce((s, v) => s + v, 0) / months.length)
    const to = roundUp50(avg * 1.05)
    out.push({
      key,
      kind: 'raise',
      text: '**{name}** went over its {limit} limit 3 months in a row (about {avg} a month). Raise it to {to}, so it shows real overspending again?',
      vars: { name: b.name, limit: limit / 100, avg: avg / 100, to },
      apply: 'Raise to {to}',
      change: { type: 'raise', id: b.id, limit: to },
    })
  }
  const budgeted = new Set(budgets.map((b) => b.name.toLowerCase()))
  for (const [category, months] of byCat) {
    if (budgeted.has(category.toLowerCase()) || ['Other', 'Housing'].includes(category)) continue
    const avg = Math.round(months.reduce((s, v) => s + v, 0) / months.length)
    if (avg < 15000 || months.filter((v) => v > 0).length < 2) continue
    const key = `budget:${category}`
    if (skip.has(key)) continue
    const to = roundUp50(avg)
    out.push({
      key,
      kind: 'budget',
      text: 'You spend about {avg} a month on **{name}**, with no budget for it. Add a {to} budget to keep an eye on it?',
      vars: { name: category, avg: avg / 100, to },
      apply: 'Add a {to} budget',
      change: { type: 'budget', name: category, limit: to },
    })
  }

  const order = { raise: 0, budget: 1, repeat: 2 }
  return out.sort((a, b) => order[a.kind] - order[b.kind])
}
