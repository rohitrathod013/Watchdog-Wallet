/* ------------------------------------------------------------------
   Net worth and paying off debt.
   Net worth = cash (balance) + money in savings goals + investments (at
   what was paid for them) + assets you add − debts you add. A snapshot is
   kept per month so the trend can be drawn.
   The debt planner compares two ways of paying off several debts with the
   same monthly money: avalanche (highest interest rate first) and
   snowball (smallest balance first). All the math is in cents.
   ------------------------------------------------------------------ */
const c = (n) => Math.round((Number(n) || 0) * 100)
const d = (cents) => Math.round(cents) / 100
export const monthOf = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

/** A thing you own or owe, cleaned up; null if it isn't usable. Debts can carry an APR and a minimum payment. */
export function makeItem({ id, name, kind = 'asset', amount, apr = 0, minPayment = 0 }) {
  const label = String(name ?? '').trim().slice(0, 40)
  const value = Math.round((Number(amount) || 0) * 100) / 100
  if (!label || !(value > 0)) return null
  const item = { id, name: label, kind: kind === 'debt' ? 'debt' : 'asset', amount: value }
  if (item.kind === 'debt') {
    item.apr = Math.min(100, Math.max(0, Math.round((Number(apr) || 0) * 100) / 100))
    item.minPayment = Math.max(0, Math.round((Number(minPayment) || 0) * 100) / 100)
  }
  return item
}

/** Today's net worth, with what it's made of. */
export function netWorthNow({ balance = 0, goals = [], holdings = [], items = [] }) {
  const parts = [
    { key: 'cash', name: 'Cash', amount: d(c(balance)) },
    { key: 'goals', name: 'Savings goals', amount: d(goals.reduce((s, g) => s + c(g.saved), 0)) },
    { key: 'investments', name: 'Investments', amount: d(holdings.reduce((s, h) => s + c(h.cost), 0)) },
  ]
  const assets = items.filter((i) => i.kind === 'asset')
  const debts = items.filter((i) => i.kind === 'debt')
  const ownedC = parts.reduce((s, p) => s + c(p.amount), 0) + assets.reduce((s, i) => s + c(i.amount), 0)
  const owedC = debts.reduce((s, i) => s + c(i.amount), 0)
  return { parts, assets, debts, owned: d(ownedC), owed: d(owedC), value: d(ownedC - owedC) }
}

/** The history with this month's snapshot set to today's value (one point per month, the last 24 kept). */
export function withSnapshot(history = [], value, now = new Date()) {
  const month = monthOf(now)
  const rest = history.filter((h) => h.month !== month)
  const last = history.find((h) => h.month === month)
  if (last && last.value === value) return history
  return [...rest, { month, value }].sort((a, b) => a.month.localeCompare(b.month)).slice(-24)
}

/** Change since last month's snapshot (null with no earlier month). */
export function monthChange(history = [], now = new Date()) {
  const month = monthOf(now)
  const before = history.filter((h) => h.month < month).sort((a, b) => b.month.localeCompare(a.month))[0]
  const current = history.find((h) => h.month === month)
  if (!before || !current) return null
  return { from: before.value, to: current.value, change: d(c(current.value) - c(before.value)) }
}

/* ---------------- paying off debt ---------------- */
const MAX_MONTHS = 600

/**
 * Pay off every debt with each month's minimums plus `extra`, putting all spare money on one target:
 * 'avalanche' (highest APR first) or 'snowball' (smallest balance first). When a debt is cleared,
 * its minimum rolls on to the next. → { ok, months, interest, order: [{ id, name, month }], stuck }
 * stuck: the minimums don't even cover the interest, so it never pays off.
 */
export function payoffPlan(debts = [], extra = 0, method = 'avalanche') {
  const list = debts
    .filter((x) => x.kind === 'debt' && c(x.amount) > 0)
    .map((x) => ({ id: x.id, name: x.name, bal: c(x.amount), rate: (Number(x.apr) || 0) / 100 / 12, min: c(x.minPayment) }))
  if (!list.length) return { ok: true, months: 0, interest: 0, order: [], stuck: false }
  const budget = list.reduce((s, x) => s + x.min, 0) + Math.max(0, c(extra))
  const pick = (open) =>
    [...open].sort((a, b) => (method === 'snowball' ? a.bal - b.bal || b.rate - a.rate : b.rate - a.rate || a.bal - b.bal))[0]
  let interest = 0
  const order = []
  for (let month = 1; month <= MAX_MONTHS; month++) {
    const open = list.filter((x) => x.bal > 0)
    for (const x of open) {
      const i = Math.round(x.bal * x.rate)
      x.bal += i
      interest += i
    }
    let money = budget
    // minimums first (never more than what's owed)
    for (const x of open) {
      const pay = Math.min(x.min, x.bal, money)
      x.bal -= pay
      money -= pay
    }
    // everything left goes on the target, then the next one
    while (money > 0) {
      const still = list.filter((x) => x.bal > 0)
      if (!still.length) break
      const t = pick(still)
      const pay = Math.min(money, t.bal)
      t.bal -= pay
      money -= pay
    }
    for (const x of open) if (x.bal <= 0 && !order.some((o) => o.id === x.id)) order.push({ id: x.id, name: x.name, month })
    if (list.every((x) => x.bal <= 0)) return { ok: true, months: month, interest: d(interest), order, stuck: false }
    // a month where the balance only grew: the payments don't cover the interest
    if (month === 12 && list.reduce((s, x) => s + x.bal, 0) >= list.reduce((s, x) => s + c(debts.find((y) => y.id === x.id)?.amount), 0))
      return { ok: false, months: null, interest: null, order, stuck: true }
  }
  return { ok: false, months: null, interest: null, order, stuck: true }
}

/** Both ways side by side, and which saves more. */
export function compareMethods(debts = [], extra = 0) {
  const avalanche = payoffPlan(debts, extra, 'avalanche')
  const snowball = payoffPlan(debts, extra, 'snowball')
  const saves = avalanche.ok && snowball.ok ? d(c(snowball.interest) - c(avalanche.interest)) : null
  return { avalanche, snowball, saves }
}

/** "March 2029": the month a plan finishes, counted from now. */
export const debtFreeBy = (months, now = new Date()) => (months == null ? null : new Date(now.getFullYear(), now.getMonth() + months, 1))
