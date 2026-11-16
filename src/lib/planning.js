/* ------------------------------------------------------------------
   Planning tools: sinking funds, a paycheque breakdown, the emergency
   fund meter and savings challenges. Pure functions, all in cents.
   ------------------------------------------------------------------ */
const c = (n) => Math.round((Number(n) || 0) * 100)
const d = (cents) => Math.round(cents) / 100
const DAY = 86400000
const two = (n) => String(n).padStart(2, '0')
const iso = (x) => `${x.getFullYear()}-${two(x.getMonth() + 1)}-${two(x.getDate())}`
const parse = (s) => {
  const [y, m, day] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day)
}

/* ---------------- sinking funds ----------------
   Saving a little each month for a cost that comes once a year
   (insurance, car registration). They're goals with a due date. */

/** Whole months from now until a due day (at least 1, so there's always a monthly amount). */
export function monthsUntil(due, now = new Date()) {
  const x = parse(due)
  const months = (x.getFullYear() - now.getFullYear()) * 12 + (x.getMonth() - now.getMonth()) - (x.getDate() < now.getDate() ? 1 : 0)
  return Math.max(1, months + 1)
}

/** What to put aside each month to have the full amount by the due day. */
export function sinkingMonthly(fund, now = new Date()) {
  const left = Math.max(0, c(fund.target) - c(fund.saved))
  if (!left) return 0
  return d(Math.ceil(left / monthsUntil(fund.dueDate, now)))
}

/** The same day next year (Feb 29 becomes Feb 28). */
export function nextYear(day) {
  const x = parse(day)
  const y = x.getFullYear() + 1
  const last = new Date(y, x.getMonth() + 1, 0).getDate()
  return iso(new Date(y, x.getMonth(), Math.min(x.getDate(), last)))
}

/* ---------------- paycheque ---------------- */
export const PAY_EVERY = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }
export const DEFAULT_PAYCHECK = {
  gross: 0,
  every: 'biweekly',
  federal: 12, // % of gross: a rough effective rate, the user sets their own
  state: 4,
  socialSecurity: 6.2,
  medicare: 1.45,
  retirement: 5,
  health: 0, // $ per paycheque
  other: 0, // $ per paycheque
}

/** Gross pay → each deduction and what's left (take-home), per paycheque and per year. */
export function paycheck(p = DEFAULT_PAYCHECK) {
  const gross = Math.max(0, c(p.gross))
  const pct = (rate) => Math.round((gross * Math.min(100, Math.max(0, Number(rate) || 0))) / 100)
  const lines = [
    { key: 'federal', name: 'Federal income tax', cents: pct(p.federal) },
    { key: 'state', name: 'State income tax', cents: pct(p.state) },
    { key: 'socialSecurity', name: 'Social Security', cents: pct(p.socialSecurity) },
    { key: 'medicare', name: 'Medicare', cents: pct(p.medicare) },
    { key: 'retirement', name: 'Retirement (401k)', cents: pct(p.retirement) },
    { key: 'health', name: 'Health insurance', cents: Math.max(0, c(p.health)) },
    { key: 'other', name: 'Other deductions', cents: Math.max(0, c(p.other)) },
  ]
  const taken = Math.min(
    gross,
    lines.reduce((s, l) => s + l.cents, 0),
  )
  const takeHome = gross - taken
  const per = PAY_EVERY[p.every] ?? 26
  return {
    gross: d(gross),
    lines: lines.filter((l) => l.cents > 0).map((l) => ({ key: l.key, name: l.name, amount: d(l.cents) })),
    deductions: d(taken),
    takeHome: d(takeHome),
    rate: gross ? Math.round((taken / gross) * 1000) / 10 : 0,
    yearly: { gross: d(gross * per), takeHome: d(takeHome * per) },
    monthly: d(Math.round((takeHome * per) / 12)),
  }
}

/* ---------------- emergency fund ---------------- */
/** Spending in each of the last `months` full months (completed money out, not moves or investments). */
export function monthlySpending(transactions = [], now = new Date(), months = 3) {
  const out = []
  for (let k = months; k >= 1; k--) {
    const from = new Date(now.getFullYear(), now.getMonth() - k, 1)
    const to = new Date(now.getFullYear(), now.getMonth() - k + 1, 1)
    let cents = 0
    for (const x of transactions) {
      if (x.status !== 'Completed' || !(x.amount < 0)) continue
      const day = parse(x.date)
      if (day >= from && day < to) cents += -c(x.amount)
    }
    out.push(d(cents))
  }
  return out
}

/**
 * How many months of spending the money you can reach quickly would cover.
 * liquid: cash and savings (not credit cards, not investments). Goal: 3 to 6 months.
 */
export function emergencyFund({ liquid = 0, transactions = [], now = new Date() }) {
  const months = monthlySpending(transactions, now, 3)
  const counted = months.filter((m) => m > 0)
  const avg = counted.length ? d(Math.round(counted.reduce((s, m) => s + c(m), 0) / counted.length)) : 0
  const covered = avg > 0 ? Math.round((Math.max(0, liquid) / avg) * 10) / 10 : null
  return {
    liquid: d(c(liquid)),
    monthly: avg,
    covered,
    level: covered == null ? null : covered < 1 ? 'low' : covered < 3 ? 'building' : covered < 6 ? 'good' : 'great',
    toThree: avg > 0 ? d(Math.max(0, c(avg) * 3 - c(liquid))) : null,
    toSix: avg > 0 ? d(Math.max(0, c(avg) * 6 - c(liquid))) : null,
  }
}

/* ---------------- savings challenges ---------------- */
/** Spending that a no-spend day allows: rent, bills, groceries and other must-haves. */
export const ESSENTIALS = new Set([
  'Housing',
  'Bills',
  'Utilities',
  'Phone & Internet',
  'Insurance',
  'Debt Payments',
  'Taxes',
  'Health',
  'Groceries',
  'Transfer',
  'Savings',
  'Investment',
  'Kids',
])

/** Days (YYYY-MM-DD) with spending on something that isn't a must-have. */
export function spendDays(transactions = []) {
  const days = new Set()
  for (const x of transactions) {
    if (x.status !== 'Completed' || !(x.amount < 0) || ESSENTIALS.has(x.category)) continue
    days.add(String(x.date).slice(0, 10))
  }
  return days
}

/** A no-spend challenge: each day from the start, whether it was kept, and the current streak. */
export function noSpend(ch, transactions = [], now = new Date()) {
  const spent = spendDays(transactions)
  const start = parse(ch.start)
  const length = ch.days || 7
  const today = iso(now)
  const days = []
  for (let i = 0; i < length; i++) {
    const day = iso(new Date(start.getTime() + i * DAY + 12 * 3600000))
    days.push({ day, state: day > today ? 'ahead' : spent.has(day) ? 'spent' : day === today ? 'today' : 'kept' })
  }
  // the streak: kept days in a row, back from today (today counts while nothing's been spent)
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].state === 'ahead') continue
    if (days[i].state === 'spent') break
    streak++
  }
  const kept = days.filter((x) => x.state === 'kept' || x.state === 'today').length
  const over = days.every((x) => x.state !== 'ahead' && x.state !== 'today')
  return { days, streak, kept, length, done: over, won: over && !days.some((x) => x.state === 'spent') }
}

/** The 52-week plan: week n puts aside n × the step ($1 by default: $1,378 in a year). */
export function weekPlan(ch, now = new Date()) {
  const step = c(ch.step || 1)
  const weekNow = Math.min(52, Math.max(1, Math.floor((now - parse(ch.start)) / (7 * DAY)) + 1))
  const saved = new Set(ch.saved ?? [])
  let total = 0
  for (const w of saved) total += step * w
  let streak = 0
  for (let w = weekNow; w >= 1; w--) {
    if (saved.has(w)) streak++
    else if (w === weekNow) continue
    else break
  }
  return {
    week: weekNow,
    due: d(step * weekNow),
    dueSaved: saved.has(weekNow),
    saved: d(total),
    target: d((step * 52 * 53) / 2),
    weeksDone: saved.size,
    streak,
    missed: Array.from({ length: weekNow - 1 }, (_, i) => i + 1).filter((w) => !saved.has(w)),
  }
}
