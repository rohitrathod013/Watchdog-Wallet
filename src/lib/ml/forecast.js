/* ------------------------------------------------------------------
   End-of-month balance as a range, not one number.

   Known: unpaid bills due before the month ends, plus repeat payments
   and income spotted in the history (same name in 2 of the last 3
   months, steady amount, within 6 days of the same day of the month)
   that haven't happened yet this month, on the day they usually land.
   Unknown: everyday spending. Modelled by bootstrap: each remaining
   day draws one real past day's spending from this account, weekdays
   from weekdays and weekends from weekends. Two-stage: each run first
   resamples the pool of past days, so it also carries the uncertainty
   in the typical level, not just day-to-day noise. 1,000 runs, seeded.

   Out: the 10th, 50th and 90th percentile of the end balance (so the
   p10 to p90 band holds about 80% of runs), the chance the balance
   dips below zero before the month ends, and the most likely day.
   With under 60 days of history the band is widened by half and
   labelled a rough estimate: a short history under-states the spread.
   ------------------------------------------------------------------ */
import { rng } from './random.js'
import { median, quantile } from './robust.js'
import { merchantKey } from './anomaly.js'
import { makeTrace } from '../trace.js'
import { money } from '../format.js'
import { t } from '../i18n.js'

const DAY = 86400000
const SIMS = 1000
const ROUGH_DAYS = 60
const WIDEN = 1.5
// fixed costs and money moves: not "everyday" spending
const FIXED = new Set([
  'Housing',
  'Bills',
  'Utilities',
  'Phone & Internet',
  'Subscriptions',
  'Insurance',
  'Transfer',
  'Investment',
  'Debt Payments',
  'Taxes',
  'Savings',
])

const parse = (iso) => {
  const [d, tm = '00:00'] = String(iso).split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, mi] = tm.split(':').map(Number)
  return new Date(y, m - 1, day, h || 0, mi || 0)
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const two = (n) => String(n).padStart(2, '0')
const dayIso = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
const counted = (x) => x.status === 'Completed' && x.category !== 'Investment'

/** Repeat payments and income from the history: in 2+ of the last 3 full months, with a steady amount. */
export function recurring(transactions, now) {
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const groups = new Map()
  for (const x of transactions) {
    if (!counted(x)) continue
    const d = parse(x.date)
    if (d < from || d >= startOfDay(new Date(now.getTime() + DAY))) continue
    const k = `${merchantKey(x.name)}|${x.amount > 0 ? 'in' : 'out'}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push({ x, d })
  }
  const out = []
  for (const list of groups.values()) {
    const before = list.filter((e) => e.d < thisMonth)
    const months = new Set(before.map((e) => `${e.d.getFullYear()}-${e.d.getMonth()}`))
    if (months.size < 2 || before.length > months.size + 1) continue
    const amounts = before.map((e) => Math.abs(e.x.amount))
    if (Math.max(...amounts) > Math.min(...amounts) * 1.35) continue
    // and on about the same day each month (a pharmacy twice on random days isn't a bill)
    const dom = before.map((e) => e.d.getDate())
    if (Math.max(...dom) - Math.min(...dom) > 6) continue
    const last = before[before.length - 1].x
    const seenThisMonth = list.some((e) => e.d >= thisMonth)
    out.push({
      name: last.name,
      amount: before.sort((a, b) => a.d - b.d)[before.length - 1].x.amount,
      day: Math.round(median(before.map((e) => e.d.getDate()))),
      category: last.category,
      seenThisMonth,
    })
  }
  return out
}

const pct = (p) => `${Math.round(p * 100)}%`

/**
 * opts: { transactions, balance, bills = [], now = new Date(), sims = 1000, seed = 42 }
 */
export function forecastMonth({ transactions = [], balance = 0, bills = [], now = new Date(), sims = SIMS, seed = 42 }) {
  const today = startOfDay(now)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const days = []
  for (let d = new Date(today.getTime() + DAY); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(d)

  const past = transactions.filter((x) => counted(x) && parse(x.date) < new Date(today.getTime() + DAY))
  const first = past.length ? startOfDay(new Date(Math.min(...past.map((x) => parse(x.date).getTime())))) : today
  const historyDays = Math.max(0, Math.round((today - first) / DAY))

  // ---- known: bills and repeat items still to come this month
  const repeats = recurring(past, now)
  const repeatKeys = new Set(repeats.map((r) => merchantKey(r.name)))
  const scheduled = []
  for (const b of bills) {
    if (b.paid || !b.dueDate) continue
    const due = startOfDay(parse(b.dueDate))
    if (due > today && due <= end) scheduled.push({ name: b.name, amount: -b.amount, date: due, source: 'bill' })
  }
  for (const r of repeats) {
    if (r.seenThisMonth || r.day <= today.getDate() || r.day > end.getDate()) continue
    if (scheduled.some((s) => merchantKey(s.name) === merchantKey(r.name))) continue
    scheduled.push({ name: r.name, amount: r.amount, date: new Date(now.getFullYear(), now.getMonth(), r.day), source: 'repeat' })
  }
  const onDay = new Map()
  for (const s of scheduled) onDay.set(dayIso(s.date), (onDay.get(dayIso(s.date)) ?? 0) + s.amount)

  // ---- unknown: everyday spending, as real past days (with the zero days), weekdays and weekends apart
  const window = new Date(Math.max(first.getTime(), today.getTime() - 180 * DAY))
  const daily = new Map()
  for (const x of past) {
    if (x.amount >= 0 || FIXED.has(x.category) || repeatKeys.has(merchantKey(x.name))) continue
    const d = startOfDay(parse(x.date))
    if (d < window || d >= today) continue
    daily.set(dayIso(d), (daily.get(dayIso(d)) ?? 0) - x.amount)
  }
  const weekday = []
  const weekend = []
  for (let d = new Date(window); d < today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const v = daily.get(dayIso(d)) ?? 0
    ;(d.getDay() === 0 || d.getDay() === 6 ? weekend : weekday).push(v)
  }

  // ---- simulate
  const rand = rng(seed)
  const ends = []
  const spends = []
  const dips = []
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const spentSoFar = past.filter((x) => x.amount < 0 && parse(x.date) >= monthStart).reduce((s, x) => s - x.amount, 0)
  // the rest of today counts too, as a share of a day
  const restOfToday = Math.max(0, 1 - (now.getHours() + now.getMinutes() / 60) / 24)
  const todayPool = today.getDay() === 0 || today.getDay() === 6 ? (weekend.length ? weekend : weekday) : weekday.length ? weekday : weekend
  // two-stage bootstrap: each run first resamples the pools themselves, so the run also carries
  // the uncertainty in how much this person typically spends, not only the day-to-day noise
  const resample = (pool) => pool.map(() => pool[Math.floor(rand() * pool.length)])
  for (let k = 0; k < sims; k++) {
    const wd = resample(weekday)
    const we = resample(weekend)
    const todays = todayPool === weekend ? we : wd
    let bal = balance
    let spent = 0
    let dip = null
    if (todays.length && restOfToday) {
      const part = todays[Math.floor(rand() * todays.length)] * restOfToday
      bal -= part
      spent += part
      if (bal < 0) dip = today.getDate()
    }
    for (const d of days) {
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      const pool = (isWeekend ? we : wd).length ? (isWeekend ? we : wd) : isWeekend ? wd : we
      const draw = pool.length ? pool[Math.floor(rand() * pool.length)] : 0
      const known = onDay.get(dayIso(d)) ?? 0
      bal += known - draw
      spent += draw + (known < 0 ? -known : 0)
      if (bal < 0 && dip == null) dip = d.getDate()
    }
    ends.push(bal)
    spends.push(spentSoFar + spent)
    if (dip != null) dips.push(dip)
  }

  const band = (list) => {
    const mid = quantile(list, 0.5)
    let lo = quantile(list, 0.1)
    let hi = quantile(list, 0.9)
    if (historyDays < ROUGH_DAYS) {
      lo = mid - (mid - lo) * WIDEN
      hi = mid + (hi - mid) * WIDEN
    }
    const r = (v) => Math.round(v * 100) / 100
    return { p10: r(lo), p50: r(mid), p90: r(hi) }
  }
  const { p10, p50, p90 } = band(ends)
  const spend = { soFar: Math.round(spentSoFar * 100) / 100, ...band(spends) }
  const pBelowZero = dips.length / sims
  const counts = new Map()
  for (const d of dips) counts.set(d, (counts.get(d) ?? 0) + 1)
  const dipDay = dips.length ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : null
  const rough = historyDays < ROUGH_DAYS
  const avg = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0)

  const trace = makeTrace(
    t('End-of-month balance range'),
    t(
      'Balance now, plus income and minus bills and repeat payments still due this month, minus each remaining day’s spending drawn at random from your own past days (weekdays and weekends apart). Repeated {n} times; the range is the middle 80% of results.',
      { n: sims.toLocaleString() },
    ),
    scheduled.map((s) => ({ id: null, date: dayIso(s.date), name: s.name, amount: s.amount })),
    [
      t('Balance now: {amount}', { amount: money(balance) }),
      t('Still due this month: {n} known items', { n: scheduled.length }),
      t('Everyday spending pools: {wd} weekdays (average {wdAvg}) and {we} weekend days (average {weAvg})', {
        wd: weekday.length,
        wdAvg: money(avg(weekday)),
        we: weekend.length,
        weAvg: money(avg(weekend)),
      }),
      t('{n} days left, {sims} simulated months', { n: days.length, sims: sims.toLocaleString() }),
      t('10th, 50th and 90th percentile: {p10}, {p50}, {p90}', { p10: money(p10), p50: money(p50), p90: money(p90) }),
      t('Runs that dip below zero: {pct}', { pct: pct(pBelowZero) }),
      ...(rough ? [t('Only {n} days of history, so the band is widened by half', { n: historyDays })] : []),
    ],
    { from: dayIso(today), to: dayIso(end) },
    { value: p50 },
  )

  return { p10, p50, p90, pBelowZero, dipDay, daysLeft: days.length, end, rough, historyDays, scheduled, spend, sims, trace }
}

/** The balance on a date, from the opening balance and the completed transactions before it (for backtests). */
export function balanceAt(transactions, opening, date) {
  return Math.round((opening + transactions.filter((x) => counted(x) && parse(x.date) < date).reduce((s, x) => s + x.amount, 0)) * 100) / 100
}
