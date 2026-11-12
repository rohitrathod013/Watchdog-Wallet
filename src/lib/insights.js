/* ------------------------------------------------------------------
   The reasoning behind Grace's smarter answers, worked out from the
   account's own data: finding transactions, month-on-month changes,
   an end-of-month forecast, unusual charges, subscriptions, "can I
   afford it?" checks and goal plans. Pure functions, no UI.
   ------------------------------------------------------------------ */
import { billDue, periodRange } from './stats'
import { money } from './format'
import { t } from './i18n'
import { dayLabel, fromCents, makeTrace, periodOf, sumCents, sumSteps, toCents } from './trace'

const DAY = 86400000
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const SHORT = MONTHS.map((m) => m.slice(0, 3))

export const parseDate = (iso) => {
  const [d, tm = '00:00'] = iso.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, mi] = tm.split(':').map(Number)
  return new Date(y, m - 1, day, h || 0, mi || 0)
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const settled = (list) => list.filter((x) => x.status === 'Completed')
const round2 = (n) => Math.round(n * 100) / 100
const spanText = (period) => (period ? t('from {from} to {to}', { from: dayLabel(period.from), to: dayLabel(period.to) }) : '')

/** "Today" for Grace: the demo's sample data ends on Oct 28 2026, so the demo pretends it's that day. */
export const nowFor = (app) => app.now ?? new Date()

/* ---------------- time ranges in plain words ---------------- */
/** "last week", "this month", "yesterday", "in march", "past 30 days" → { from, to, label } */
export function parseRange(s, now) {
  const today = startOfDay(now)
  const dow = (today.getDay() + 6) % 7
  const mk = (from, to, label) => ({ from, to, label })
  if (/\btoday\b/.test(s)) return mk(today, new Date(today.getTime() + DAY), 'today')
  if (/\byesterday\b/.test(s)) return mk(new Date(today.getTime() - DAY), today, 'yesterday')
  if (/\bthis week\b/.test(s)) return mk(new Date(today.getTime() - dow * DAY), new Date(today.getTime() + DAY), 'this week')
  if (/\blast week\b/.test(s)) {
    const start = new Date(today.getTime() - (dow + 7) * DAY)
    return mk(start, new Date(start.getTime() + 7 * DAY), 'last week')
  }
  const past = s.match(/\b(?:past|last)\s+(\d{1,3})\s+days?\b/)
  if (past) return mk(new Date(today.getTime() - (Number(past[1]) - 1) * DAY), new Date(today.getTime() + DAY), `past ${past[1]} days`)
  if (/\bthis month\b/.test(s)) return mk(new Date(now.getFullYear(), now.getMonth(), 1), new Date(today.getTime() + DAY), 'this month')
  if (/\blast month\b/.test(s))
    return mk(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1), 'last month')
  if (/\bthis year\b/.test(s)) return mk(new Date(now.getFullYear(), 0, 1), new Date(today.getTime() + DAY), 'this year')
  const named = s.match(new RegExp(`\\b(?:in|during|for)?\\s*(${MONTHS.join('|')}|${SHORT.join('|')})\\b`))
  if (named) {
    const i = SHORT.indexOf(named[1].slice(0, 3))
    // a month later than now means last year's
    const year = i > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
    return mk(new Date(year, i, 1), new Date(year, i + 1, 1), MONTHS[i][0].toUpperCase() + MONTHS[i].slice(1))
  }
  return null
}

/** "by June", "in March", "next month", "in 3 months" → the date that's meant (end of that month). */
export function parseTarget(s, now) {
  const months = s.match(/\bin\s+(\d{1,2})\s+months?\b/)
  if (months) return new Date(now.getFullYear(), now.getMonth() + Number(months[1]) + 1, 0)
  const weeks = s.match(/\bin\s+(\d{1,2})\s+weeks?\b/)
  if (weeks) return new Date(now.getTime() + Number(weeks[1]) * 7 * DAY)
  if (/\bnext month\b/.test(s)) return new Date(now.getFullYear(), now.getMonth() + 2, 0)
  if (/\b(this|end of( the)?) month\b/.test(s)) return new Date(now.getFullYear(), now.getMonth() + 1, 0)
  if (/\bnext year\b/.test(s)) return new Date(now.getFullYear() + 1, 11, 31)
  const named = s.match(new RegExp(`\\b(?:by|in|before|for|until)\\s+(${MONTHS.join('|')}|${SHORT.join('|')})\\b`))
  if (named) {
    const i = SHORT.indexOf(named[1].slice(0, 3))
    const year = i < now.getMonth() || (i === now.getMonth() && now.getDate() > 20) ? now.getFullYear() + 1 : now.getFullYear()
    return new Date(year, i + 1, 0)
  }
  return null
}

/* ---------------- finding transactions ---------------- */
/**
 * filter: { range?, category?, words?, min?, max?, dir?: 'out' | 'in' }
 * → { rows, total } with rows newest first
 */
export function findTransactions(transactions, filter) {
  const rows = transactions.filter((x) => {
    if (x.status === 'Failed') return false
    if (filter.dir === 'out' && x.amount >= 0) return false
    if (filter.dir === 'in' && x.amount <= 0) return false
    const d = parseDate(x.date)
    if (filter.range && (d < filter.range.from || d >= filter.range.to)) return false
    if (filter.category && x.category !== filter.category) return false
    if (filter.words?.length) {
      const hay = `${x.name} ${x.category} ${x.note ?? ''}`.toLowerCase()
      if (!filter.words.some((w) => hay.includes(w))) return false
    }
    const a = Math.abs(x.amount)
    if (filter.min != null && a < filter.min) return false
    if (filter.max != null && a > filter.max) return false
    return true
  })
  rows.sort((a, b) => b.date.localeCompare(a.date))
  return { rows, total: fromCents(sumCents(rows)) }
}

/* ---------------- month on month ---------------- */
/** Spending by category this month vs last month, biggest change first. */
export function compareMonths(transactions, now) {
  const thisFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  // compare like with like: last month up to the same day of the month
  const cutoff = new Date(lastFrom.getFullYear(), lastFrom.getMonth(), now.getDate() + 1)
  const sum = (from, to) => {
    const by = new Map()
    for (const x of settled(transactions)) {
      if (x.amount >= 0 || x.category === 'Transfer') continue
      const d = parseDate(x.date)
      if (d < from || d >= to) continue
      const e = by.get(x.category) ?? { total: 0, count: 0, biggest: null, rows: [] }
      e.total += -toCents(x.amount)
      e.count += 1
      e.rows.push(x)
      if (!e.biggest || -x.amount > -e.biggest.amount) e.biggest = x
      by.set(x.category, e)
    }
    return by
  }
  const cur = sum(thisFrom, new Date(now.getTime() + DAY))
  const prev = sum(lastFrom, cutoff < thisFrom ? cutoff : thisFrom)
  const cats = new Set([...cur.keys(), ...prev.keys()])
  const rows = [...cats]
    .map((c) => {
      const a = cur.get(c) ?? { total: 0, count: 0 }
      const b = prev.get(c) ?? { total: 0, count: 0 }
      return {
        category: c,
        now: fromCents(a.total),
        before: fromCents(b.total),
        change: fromCents(a.total - b.total),
        count: a.count,
        biggest: a.biggest ?? null,
      }
    })
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change))
  const nowRows = [...cur.values()].flatMap((e) => e.rows).sort((a, b) => b.date.localeCompare(a.date))
  const beforeRows = [...prev.values()].flatMap((e) => e.rows).sort((a, b) => b.date.localeCompare(a.date))
  const total = { now: fromCents(-sumCents(nowRows)), before: fromCents(-sumCents(beforeRows)) }
  const change = fromCents(toCents(total.now) - toCents(total.before))
  const thisPeriod = periodOf({ from: thisFrom, to: new Date(startOfDay(now).getTime() + DAY) })
  const lastPeriod = periodOf({ from: lastFrom, to: cutoff < thisFrom ? cutoff : thisFrom })
  const traces = [
    makeTrace(
      t('Spending this month so far'),
      t('Sum of completed spending (not transfers) {span}.', { span: spanText(thisPeriod) }),
      nowRows,
      [
        ...sumSteps(nowRows, total.now),
        ...rows
          .filter((r) => r.change)
          .map((r) =>
            t('{name}: {now} vs {before} ({change})', {
              name: t(r.category),
              now: money(r.now),
              before: money(r.before),
              change: `${r.change > 0 ? '+' : '−'}${money(Math.abs(r.change))}`,
            }),
          ),
        t('Change = {now} − {before} = {change}', { now: money(total.now), before: money(total.before), change: money(change) }),
      ],
      thisPeriod,
      { sign: -1 },
    ),
    makeTrace(
      t('Spending last month, to the same day'),
      t('Sum of completed spending (not transfers) {span}.', { span: spanText(lastPeriod) }),
      beforeRows,
      sumSteps(beforeRows, total.before),
      lastPeriod,
      { sign: -1 },
    ),
  ]
  return { rows, total, change, traces }
}

/* ---------------- end of month forecast ---------------- */
export function forecast(app, now) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const daysLeft = Math.max(0, Math.round((startOfDay(end) - startOfDay(now)) / DAY))
  const bills = app.bills
    .filter((b) => !b.paid)
    .map((b) => ({ ...b, ...billDue(b, now) }))
    .filter((b) => b.days >= 0 && b.days <= daysLeft)
  const billCents = sumCents(bills)
  const billTotal = fromCents(billCents)
  // everyday spending, without bills and transfers, over the last 30 days
  const from = new Date(startOfDay(now).getTime() - 29 * DAY)
  const spent = settled(app.transactions).filter(
    (x) => x.amount < 0 && !['Bills', 'Transfer', 'Housing'].includes(x.category) && parseDate(x.date) >= from,
  )
  const spentCents = -sumCents(spent)
  const daily = fromCents(Math.round(spentCents / 30))
  const everydayCents = Math.round((spentCents * daysLeft) / 30)
  const everyday = fromCents(everydayCents)
  const endBalance = fromCents(toCents(app.balance) - billCents - everydayCents)

  const billRows = bills.map((b) => ({ id: b.id, date: b.dueDate ?? '', name: `${b.name} (${t('due {date}', { date: b.due })})`, amount: -b.amount }))
  const last30 = periodOf({ from, to: new Date(startOfDay(now).getTime() + DAY) })
  const traces = [
    makeTrace(
      t('End-of-month forecast'),
      t('Balance now, minus bills still due, minus average daily spending × days left.'),
      [],
      [
        t('Balance now: {amount}', { amount: money(app.balance) }),
        t('Bills still due: {amount}', { amount: money(billTotal) }),
        t('Average daily spending: {daily} × {n} days left = {total}', { daily: money(daily), n: daysLeft, total: money(everyday) }),
        t('{balance} − {bills} − {spending} = {result}', {
          balance: money(app.balance),
          bills: money(billTotal),
          spending: money(everyday),
          result: money(endBalance),
        }),
      ],
      periodOf({ from: startOfDay(now), to: new Date(end.getTime() + DAY) }),
      { value: endBalance },
    ),
    makeTrace(
      t('Bills still due this month'),
      t('Unpaid bills that fall due before the month ends.'),
      billRows,
      sumSteps(billRows, billTotal),
      null,
      { sign: -1, empty: t('No unpaid bills are due before the month ends, so this is {amount}.', { amount: money(0) }) },
    ),
    makeTrace(
      t('Everyday spending, last 30 days'),
      t('Completed spending {span}, not bills, rent or transfers. The daily average is this ÷ 30.', { span: spanText(last30) }),
      spent,
      [...sumSteps(spent, fromCents(spentCents)), t('{total} ÷ 30 = {daily} a day', { total: money(fromCents(spentCents)), daily: money(daily) })],
      last30,
      { sign: -1 },
    ),
  ]
  return { end, daysLeft, bills, billTotal, daily, everyday, endBalance, traces }
}

/* ---------------- unusual charges ---------------- */
export function anomalies(transactions) {
  const out = settled(transactions).filter((x) => x.amount < 0)
  const found = []
  // the same charge twice within 3 days
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i]
      const b = out[j]
      if (a.name === b.name && a.amount === b.amount && Math.abs(parseDate(a.date) - parseDate(b.date)) <= 3 * DAY) {
        found.push({ type: 'duplicate', tx: a, other: b })
      }
    }
  }
  // one-off big spends: over 3x the typical charge and at least $100
  const amounts = out.map((x) => -x.amount).sort((a, b) => a - b)
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0
  for (const x of out) {
    if (-x.amount >= Math.max(100, median * 3) && !['Housing', 'Bills'].includes(x.category) && !found.some((f) => f.tx === x)) {
      found.push({ type: 'big', tx: x, typical: round2(median) })
    }
  }
  // subscriptions that went up in price
  for (const s of subscriptions(transactions, []).items) {
    if (s.previous != null && s.amount > s.previous + 0.009) found.push({ type: 'hike', name: s.name, from: s.previous, to: s.amount })
  }
  return found
}

/* ---------------- subscriptions ---------------- */
const SUB_KINDS = ['stream', 'music', 'gym']

/** Repeat charges (same name in 2+ months) plus subscription bills, with monthly and yearly totals. */
export function subscriptions(transactions, bills) {
  const byName = new Map()
  for (const x of settled(transactions)) {
    if (x.amount >= 0 || x.category === 'Transfer') continue
    const list = byName.get(x.name) ?? []
    list.push(x)
    byName.set(x.name, list)
  }
  const items = []
  for (const [name, list] of byName) {
    const months = new Set(list.map((x) => x.date.slice(0, 7)))
    const kindSub = list.some((x) => SUB_KINDS.includes(x.kind))
    const amounts = list.map((x) => -x.amount)
    const steady = Math.max(...amounts) <= Math.min(...amounts) * 1.25
    const everyday = list.some((x) => ['Food & Dining', 'Transport', 'Shopping', 'Travel'].includes(x.category))
    if (!kindSub && (months.size < 2 || !steady || everyday)) continue
    list.sort((a, b) => a.date.localeCompare(b.date))
    const last = list[list.length - 1]
    const prev = list.length > 1 ? list[list.length - 2] : null
    items.push({ name, amount: -last.amount, previous: prev ? -prev.amount : null, last: last.date, kind: last.kind, count: list.length, tx: last })
  }
  for (const b of bills) {
    if (!SUB_KINDS.includes(b.kind) || items.some((i) => i.name === b.name)) continue
    items.push({ name: b.name, amount: b.amount, previous: null, last: null, kind: b.kind, count: 0 })
  }
  items.sort((a, b) => b.amount - a.amount)
  const rows = items.map((i) => i.tx ?? { id: null, date: '', name: `${i.name} (${t('bill')})`, amount: -i.amount })
  const monthlyCents = -sumCents(rows)
  const monthly = fromCents(monthlyCents)
  const yearly = fromCents(monthlyCents * 12)
  const traces = [
    makeTrace(
      t('Subscriptions and repeat charges'),
      t('The latest charge of each subscription or repeat payment, added up. A year is that × 12.'),
      rows,
      [...sumSteps(rows, monthly), t('{monthly} × 12 = {yearly} a year', { monthly: money(monthly), yearly: money(yearly) })],
      null,
      { sign: -1 },
    ),
  ]
  return { items, monthly, yearly, traces }
}

/* ---------------- averages ---------------- */
/** Average monthly income, spending and what's left over, from the last 3 full months (or what there is). */
export function monthlyAverages(transactions, now) {
  const months = []
  for (let k = 1; k <= 3; k++) {
    const from = new Date(now.getFullYear(), now.getMonth() - k, 1)
    const to = new Date(now.getFullYear(), now.getMonth() - k + 1, 1)
    let inc = 0
    let out = 0
    let any = false
    for (const x of settled(transactions)) {
      const d = parseDate(x.date)
      if (d < from || d >= to) continue
      any = true
      if (x.amount > 0) inc += toCents(x.amount)
      else out += -toCents(x.amount)
    }
    if (any) months.push({ inc, out })
  }
  if (!months.length) {
    // nothing older than this month yet: use this month so far, scaled to a full month
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const frac = Math.max(1, now.getDate()) / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    let inc = 0
    let out = 0
    for (const x of settled(transactions)) {
      if (parseDate(x.date) < from) continue
      if (x.amount > 0) inc += toCents(x.amount)
      else out += -toCents(x.amount)
    }
    const spend = Math.round(out / frac)
    return { income: fromCents(inc), spending: fromCents(spend), surplus: fromCents(inc - spend), basis: 'this month' }
  }
  const income = Math.round(months.reduce((s, m) => s + m.inc, 0) / months.length)
  const spending = Math.round(months.reduce((s, m) => s + m.out, 0) / months.length)
  return { income: fromCents(income), spending: fromCents(spending), surplus: fromCents(income - spending), basis: `${months.length} months` }
}

const monthsBetween = (now, until) => Math.max(0, (until.getFullYear() - now.getFullYear()) * 12 + until.getMonth() - now.getMonth())

/* ---------------- can I afford it? ---------------- */
export function afford(app, cost, until, now) {
  const when = until ?? now
  const months = monthsBetween(now, when)
  const avg = monthlyAverages(app.transactions, now)
  const fc = forecast(app, now)
  const free = app.pots?.length ? Math.max(0, app.unassigned) : app.balance
  const goalMonthly = fromCents(
    sumCents(
      app.goals.filter((g) => g.saved < g.target),
      (g) => g.monthly || 0,
    ),
  )
  // money you can count on by then: what's free now, minus this month's bills, plus what you usually keep each month
  const keepCents = Math.max(0, toCents(avg.surplus) - toCents(goalMonthly))
  const availableCents = toCents(free) - toCents(fc.billTotal) + keepCents * months
  const available = fromCents(availableCents)
  const after = fromCents(availableCents - toCents(cost))
  const ok = after >= 0
  const shortBy = ok ? 0 : -after
  const perMonth = months ? fromCents(Math.round(toCents(shortBy) / months)) : shortBy
  const traces = [
    makeTrace(
      t('Can you afford it?'),
      t('Money free now, minus bills still due, plus what you usually keep each month × months until then, minus the cost.'),
      [],
      [
        t('Free now: {amount}', { amount: money(free) }),
        t('Bills still due this month: {amount}', { amount: money(fc.billTotal) }),
        t('Usually kept each month: {surplus} (income {income} − spending {spending}, average of {basis})', {
          surplus: money(avg.surplus),
          income: money(avg.income),
          spending: money(avg.spending),
          basis: t(avg.basis),
        }),
        ...(goalMonthly ? [t('Minus goal contributions: {amount} a month', { amount: money(goalMonthly) })] : []),
        t('Months until then: {n}', { n: months }),
        t('Available = {free} − {bills} + {keep} × {n} = {available}', {
          free: money(free),
          bills: money(fc.billTotal),
          keep: money(fromCents(keepCents)),
          n: months,
          available: money(available),
        }),
        t('{available} − {cost} = {after}', { available: money(available), cost: money(cost), after: money(after) }),
      ],
      null,
      { value: after },
    ),
    fc.traces[1],
  ]
  return { ok, cost, when, months, available, after, shortBy, perMonth, avg, goalMonthly, billTotal: fc.billTotal, free, traces }
}

/* ---------------- plan a goal ---------------- */
const TRIMMABLE = ['Shopping', 'Entertainment', 'Food & Dining', 'Travel', 'Transport']

export function planGoal(app, target, until, now) {
  const when = until ?? new Date(now.getFullYear(), now.getMonth() + 7, 0)
  const days = Math.max(7, Math.round((startOfDay(when) - startOfDay(now)) / DAY))
  const weeks = Math.max(1, Math.round(days / 7))
  const months = Math.max(1, Math.round(days / 30.4))
  const weekly = fromCents(Math.round(toCents(target) / weeks))
  const monthly = fromCents(Math.round(toCents(target) / months))
  const avg = monthlyAverages(app.transactions, now)
  const spare = Math.max(0, avg.surplus)
  const gap = fromCents(Math.max(0, toCents(monthly) - toCents(spare)))
  // where the extra could come from: the biggest flexible budget this month
  const flexible = app.budgets.filter((b) => TRIMMABLE.includes(b.name) && b.spent > 0).sort((a, b) => b.spent - a.spent)
  const trim = gap && flexible.length ? { budget: flexible[0], cut: round2(Math.min(gap, flexible[0].spent)) } : null
  const traces = [
    makeTrace(
      t('Savings plan'),
      t('The target split evenly over the weeks (and months) until the date, compared with what you usually keep each month.'),
      [],
      [
        t('{target} ÷ {n} weeks = {amount} a week', { target: money(target), n: weeks, amount: money(weekly) }),
        t('{target} ÷ {n} months = {amount} a month', { target: money(target), n: months, amount: money(monthly) }),
        t('Usually kept each month: {surplus} (income {income} − spending {spending}, average of {basis})', {
          surplus: money(spare),
          income: money(avg.income),
          spending: money(avg.spending),
          basis: t(avg.basis),
        }),
        ...(gap ? [t('Short each month: {monthly} − {spare} = {gap}', { monthly: money(monthly), spare: money(spare), gap: money(gap) })] : []),
      ],
      null,
      { value: monthly },
    ),
  ]
  return { target, when, weeks, months, weekly, monthly, spare, gap, trim, avg, traces }
}

/* ---------------- things worth mentioning unprompted ---------------- */
/** A short list of heads-ups for when the chat opens: bills you can't cover, budgets near the limit, odd charges, a low forecast. */
export function alerts(app, now) {
  const out = []
  const free = app.pots?.length ? app.unassigned : app.balance
  const soon = app.bills
    .filter((b) => !b.paid)
    .map((b) => ({ ...b, ...billDue(b, now) }))
    .filter((b) => b.days >= -3 && b.days <= 7)
    .sort((a, b) => a.days - b.days)
  let left = free
  for (const b of soon) {
    left -= b.amount
    if (b.days < 0) out.push({ kind: 'overdue', bill: b })
    else if (left < 0) out.push({ kind: 'short', bill: b, short: round2(-left) })
    else out.push({ kind: 'due', bill: b })
  }
  for (const b of app.budgets) {
    const p = b.limit ? b.spent / b.limit : 0
    if (p > 1) out.push({ kind: 'over', budget: b, by: round2(b.spent - b.limit) })
    else if (p >= 0.9) out.push({ kind: 'near', budget: b, pct: Math.round(p * 100) })
  }
  for (const a of anomalies(app.transactions).filter((x) => x.type !== 'big')) out.push({ kind: 'odd', anomaly: a })
  const fc = forecast(app, now)
  if (fc.endBalance < 0) out.push({ kind: 'forecast', forecast: fc })
  return out.slice(0, 5)
}

/* ---------------- the dashboard's totals, with their workings ---------------- */
const PERIOD_WORDS = { week: 'this week', month: 'this month', quarter: 'this quarter', year: 'this year' }

/** Income, spending and net for a dashboard period, worked out from completed transactions. */
export function periodTotals(app, key, now = nowFor(app)) {
  const range = periodRange(key, now)
  const period = periodOf(range)
  const rows = settled(app.transactions)
    .filter((x) => {
      const d = parseDate(x.date)
      return d >= range.from && d < range.to
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  const inRows = rows.filter((x) => x.amount > 0)
  const outRows = rows.filter((x) => x.amount < 0)
  const when = t(PERIOD_WORDS[key] ?? 'this month')
  const span = spanText(period)
  const income = makeTrace(
    t('Income, {period}', { period: when }),
    t('Sum of all completed money coming in {span}.', { span }),
    inRows,
    sumSteps(inRows, fromCents(sumCents(inRows))),
    period,
  )
  const expenses = makeTrace(
    t('Spending, {period}', { period: when }),
    t('Sum of all completed money going out {span}, transfers included.', { span }),
    outRows,
    sumSteps(outRows, fromCents(-sumCents(outRows))),
    period,
    { sign: -1 },
  )
  const net = makeTrace(
    t('Net, {period}', { period: when }),
    t('Money in minus money out {span}.', { span }),
    rows,
    [t('{income} − {spending} = {net}', { income: money(income.value), spending: money(expenses.value), net: money(fromCents(sumCents(rows))) })],
    period,
  )
  return { income: income.value, expenses: expenses.value, net: net.value, traces: { income, expenses, net } }
}

/** What's been spent in one category this calendar month (what its budget counts). */
export function categorySpend(app, category, now = nowFor(app)) {
  const range = periodRange('month', now)
  const period = periodOf(range)
  const rows = settled(app.transactions)
    .filter((x) => {
      const d = parseDate(x.date)
      return x.amount < 0 && x.category === category && d >= range.from && d < range.to
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  const trace = makeTrace(
    t('{name} spending, this month', { name: t(category) }),
    t('Sum of completed spending where category = {name} {span}.', { name: t(category), span: spanText(period) }),
    rows,
    sumSteps(rows, fromCents(-sumCents(rows))),
    period,
    { sign: -1 },
  )
  return { value: trace.value, trace }
}

/** The balance, set beside the sum of every completed transaction (they differ by any starting amount). */
export function balanceTrace(app) {
  const rows = settled(app.transactions).sort((a, b) => b.date.localeCompare(a.date))
  const total = fromCents(sumCents(rows))
  const gap = fromCents(toCents(app.balance) - toCents(total))
  return makeTrace(
    t('Balance'),
    t('Your balance, compared with the sum of all your completed transactions.'),
    rows,
    [
      ...sumSteps(rows, total),
      gap
        ? t('Your balance is {balance}, so {gap} of it came from outside these transactions (a starting amount or an adjustment).', {
            balance: money(app.balance),
            gap: money(gap),
          })
        : t('That matches your balance of {balance} exactly.', { balance: money(app.balance) }),
    ],
    null,
    { value: app.balance },
  )
}
