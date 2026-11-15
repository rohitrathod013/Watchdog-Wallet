/* ------------------------------------------------------------------
   Repeating transactions: rent, salary, subscriptions. A rule says what
   to add and how often; when its date arrives the app adds it by itself.
   Dates are plain 'YYYY-MM-DD' days (no clock, so no time zone surprises).
   ------------------------------------------------------------------ */
export const EVERY = ['weekly', 'biweekly', 'monthly', 'yearly']
export const EVERY_LABEL = { weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month', yearly: 'Every year' }
/** At most this many missed runs are added at once (after a long time away). */
export const MAX_CATCH_UP = 24

const two = (n) => String(n).padStart(2, '0')
const parts = (iso) => String(iso).slice(0, 10).split('-').map(Number)
const iso = (y, m, d) => `${y}-${two(m)}-${two(d)}`
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const addDays = (day, n) => {
  const [y, m, d] = parts(day)
  const x = new Date(Date.UTC(y, m - 1, d + n))
  return iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate())
}

/** Is this a real calendar day written as YYYY-MM-DD? */
export const validDay = (day) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day ?? ''))) return false
  const [y, m, d] = parts(day)
  return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m)
}

/**
 * The run after `day`. anchor is the day of the month the rule was set for (1 to 31):
 * a rule for the 31st runs on the last day of shorter months and goes back to the 31st after.
 */
export function nextRun(day, every, anchor) {
  const [y, m, d] = parts(day)
  if (every === 'weekly') return addDays(day, 7)
  if (every === 'biweekly') return addDays(day, 14)
  const want = anchor || d
  if (every === 'yearly') return iso(y + 1, m, Math.min(want, daysIn(y + 1, m)))
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return iso(ny, nm, Math.min(want, daysIn(ny, nm)))
}

/** A new rule, cleaned up. amount is signed: negative for money out. Returns null if it can't run. */
export function makeRule({ id, name, amount, category, every = 'monthly', start, method }) {
  const clean = String(name ?? '').trim().slice(0, 60)
  const value = Math.round((Number(amount) || 0) * 100) / 100
  if (!clean || !value || !EVERY.includes(every) || !validDay(start)) return null
  return { id, name: clean, amount: value, category, every, next: start, anchor: parts(start)[2], method: method || null, active: true }
}

/**
 * What a rule owes up to and including `today`: the days to add, and the rule moved on.
 * Paused rules owe nothing. After a long gap only the newest MAX_CATCH_UP runs are added.
 */
export function runsDue(rule, today) {
  if (!rule?.active || !validDay(rule.next) || !validDay(today)) return { days: [], rule }
  const days = []
  let next = rule.next
  let guard = 0
  while (next <= today && guard++ < 2000) {
    days.push(next)
    next = nextRun(next, rule.every, rule.anchor)
  }
  return { days: days.slice(-MAX_CATCH_UP), rule: days.length ? { ...rule, next, last: days[days.length - 1] } : rule }
}

/** Run every rule: the transactions to add (oldest first) and the rules as they should be saved. */
export function runAll(rules = [], today) {
  const add = []
  let changed = false
  const next = rules.map((r) => {
    const { days, rule } = runsDue(r, today)
    if (!days.length) return r
    changed = true
    for (const day of days) add.push({ rule: r.id, name: r.name, amount: r.amount, category: r.category, method: r.method, day })
    return rule
  })
  add.sort((a, b) => a.day.localeCompare(b.day))
  return { add, rules: changed ? next : rules, changed }
}

/** What all active rules add up to in a typical month (weekly ones count 52/12 times). */
export function monthlyTotal(rules = []) {
  const per = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, yearly: 1 / 12 }
  let income = 0
  let out = 0
  for (const r of rules) {
    if (!r.active) continue
    const v = r.amount * (per[r.every] ?? 0)
    if (v > 0) income += v
    else out -= v
  }
  return { in: Math.round(income * 100) / 100, out: Math.round(out * 100) / 100 }
}
