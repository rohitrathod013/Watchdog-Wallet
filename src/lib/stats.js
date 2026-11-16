/* ------------------------------------------------------------------
   Everything the charts and summary cards show, worked out from an
   account's own transactions. The demo uses fixed sample figures with
   the same shape (see demoStats below), so components don't care which.
   ------------------------------------------------------------------ */
import { isoDay, MONTHS } from './format'
import * as seed from '../data/seed'

const DAY = 86400000

/** Every spending category, with its icon: what budgets and new expenses can use. */
export const SPENDING_CATEGORIES = [
  { name: 'Housing', icon: 'home' },
  { name: 'Food & Dining', icon: 'coffee' },
  { name: 'Groceries', icon: 'cart' },
  { name: 'Shopping', icon: 'bag' },
  { name: 'Transport', icon: 'car' },
  { name: 'Entertainment', icon: 'play' },
  { name: 'Health', icon: 'heart' },
  { name: 'Bills', icon: 'receipt' },
  { name: 'Utilities', icon: 'bolt' },
  { name: 'Phone & Internet', icon: 'wifi' },
  { name: 'Subscriptions', icon: 'replay' },
  { name: 'Insurance', icon: 'shield' },
  { name: 'Travel', icon: 'plane' },
  { name: 'Education', icon: 'note' },
  { name: 'Personal Care', icon: 'sparkle' },
  { name: 'Fitness', icon: 'trophy' },
  { name: 'Kids', icon: 'smile' },
  { name: 'Pets', icon: 'heart' },
  { name: 'Gifts & Donations', icon: 'gift' },
  { name: 'Debt Payments', icon: 'card' },
  { name: 'Savings', icon: 'safe' },
  { name: 'Taxes', icon: 'percent' },
  { name: 'Other', icon: 'category' },
]
/** Categories a user can pick when adding a transaction. */
export const EXPENSE_CATEGORIES = SPENDING_CATEGORIES.map((c) => c.name)

/** The expense categories plus any custom ones the user made budgets for, with Other last. */
export const expenseCategories = (budgets = []) => {
  const extra = budgets.map((b) => b.name).filter((n) => n && !EXPENSE_CATEGORIES.includes(n))
  return [...EXPENSE_CATEGORIES.slice(0, -1), ...extra, 'Other']
}
/** A category's icon (custom ones get a generic tag). */
export const iconOfCategory = (name) => SPENDING_CATEGORIES.find((c) => c.name === name)?.icon ?? 'category'
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Business', 'Dividends', 'Other income']

/** Budget categories a fresh account starts with (limits are editable). */
export const DEFAULT_BUDGETS = [
  { id: 'housing', name: 'Housing', icon: 'home', limit: 1500 },
  { id: 'food', name: 'Food & Dining', icon: 'coffee', limit: 600 },
  { id: 'shopping', name: 'Shopping', icon: 'bag', limit: 400 },
  { id: 'transport', name: 'Transport', icon: 'car', limit: 300 },
  { id: 'fun', name: 'Entertainment', icon: 'play', limit: 200 },
  { id: 'health', name: 'Health', icon: 'heart', limit: 200 },
]

/** Which merchant tile a category gets in lists. */
export const KIND_FOR = {
  Housing: 'home',
  'Food & Dining': 'food',
  Shopping: 'shopping',
  Transport: 'ride',
  Entertainment: 'stream',
  Health: 'gym',
  Bills: 'wifi',
  Groceries: 'food',
  Utilities: 'fuel',
  'Phone & Internet': 'wifi',
  Subscriptions: 'stream',
  Fitness: 'gym',
  Travel: 'travel',
  Other: 'transfer',
  Salary: 'salary',
  Freelance: 'freelance',
  Business: 'business',
  'Other income': 'request',
  Dividends: 'business',
  Investment: 'business',
}

const parse = (iso) => {
  const [d, tm = '00:00'] = iso.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, mi] = tm.split(':').map(Number)
  return new Date(y, m - 1, day, h || 0, mi || 0)
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const pctChange = (now, before) => (before ? ((now - before) / Math.abs(before)) * 100 : 0)
const round1 = (n) => Math.round(n * 10) / 10

/** Money that actually moved: completed transactions only. */
const settled = (list) => list.filter((x) => x.status === 'Completed')

function sums(list, from, to) {
  let income = 0
  let expenses = 0
  for (const x of list) {
    const d = parse(x.date)
    if (d < from || d >= to) continue
    if (x.amount > 0) income += x.amount
    else expenses += -x.amount
  }
  return { income, expenses, net: income - expenses }
}

/* calendar windows: [start of this unit, start of next) and the one before */
/** The dashboard's window for a period key ('week' | 'month' | 'quarter' | 'year'): { from, to }, to not included. */
export const periodRange = (key, now = new Date()) => {
  const [from, to] = windows(now)[key] ?? windows(now).month
  return { from, to }
}

function windows(now) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const dow = (now.getDay() + 6) % 7
  const weekStart = startOfDay(new Date(now.getTime() - dow * DAY))
  const q = Math.floor(m / 3) * 3
  return {
    week: [weekStart, new Date(weekStart.getTime() + 7 * DAY), new Date(weekStart.getTime() - 7 * DAY)],
    month: [new Date(y, m, 1), new Date(y, m + 1, 1), new Date(y, m - 1, 1)],
    quarter: [new Date(y, q, 1), new Date(y, q + 3, 1), new Date(y, q - 3, 1)],
    year: [new Date(y, 0, 1), new Date(y + 1, 0, 1), new Date(y - 1, 0, 1)],
  }
}

const LABELS = {
  week: ['This Week', 'vs Last Week'],
  month: ['This Month', 'vs Last Month'],
  quarter: ['This Quarter', 'vs Last Quarter'],
  year: ['This Year', 'vs Last Year'],
}

/** 'YYYY-MM' for a date: the month a budget's rollover starts counting from. */
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * Rollover: what a budget didn't use in the full months since rollover was turned on (rollFrom),
 * carried into this month. Overspending a month eats into what was carried, never below zero.
 * Looks back 12 months at most, and uses today's limit for every month.
 */
export function carryOver(b, transactions = [], now = new Date()) {
  if (!b?.rollover || !/^\d{4}-\d{2}$/.test(b.rollFrom ?? '')) return 0
  const [fy, fm] = b.rollFrom.split('-').map(Number)
  const y = now.getFullYear()
  const m = now.getMonth()
  const months = Math.min(12, (y - fy) * 12 + (m - (fm - 1)))
  if (months <= 0) return 0
  const from = new Date(y, m - months, 1)
  const to = new Date(y, m, 1)
  const spent = new Array(months).fill(0)
  for (const x of transactions) {
    if (x.amount >= 0 || x.category !== b.name || (x.status && x.status !== 'Completed')) continue
    const d = parse(x.date)
    if (d < from || d >= to) continue
    spent[(d.getFullYear() - from.getFullYear()) * 12 + d.getMonth() - from.getMonth()] += Math.round(-x.amount * 100)
  }
  const limit = Math.round((Number(b.limit) || 0) * 100)
  let carry = 0
  for (const s of spent) carry = Math.max(0, carry + limit - s)
  return carry / 100
}

export function computeStats(transactions, budgets = [], now = new Date(), { pause = null } = {}) {
  const tx = settled(transactions)
  const win = windows(now)
  const y = now.getFullYear()
  const m = now.getMonth()

  /* ---- KPI periods ---- */
  const periods = {}
  for (const [key, [from, to, prevFrom]] of Object.entries(win)) {
    const cur = sums(tx, from, to)
    const prev = sums(tx, prevFrom, from)
    const savings = Math.max(0, cur.net)
    const whole = cur.income + cur.expenses + savings
    const share = (v) => (whole ? Math.round((v / whole) * 100) : 0)
    periods[key] = {
      label: LABELS[key][0],
      vs: LABELS[key][1],
      income: cur.income,
      incomeDelta: round1(pctChange(cur.income, prev.income)),
      expenses: cur.expenses,
      expensesDelta: round1(pctChange(cur.expenses, prev.expenses)),
      net: cur.net,
      netDelta: round1(pctChange(cur.net, prev.net)),
      split: [share(cur.income), share(cur.expenses), share(savings)],
      savings,
      rateDelta: round1((cur.income ? (cur.net / cur.income) * 100 : 0) - (prev.income ? (prev.net / prev.income) * 100 : 0)),
    }
  }

  /* ---- monthly income for this year and last (in $k, like the demo) ---- */
  const monthly = (year, sign) =>
    MONTHS.map((_, i) => {
      const s = sums(tx, new Date(year, i, 1), new Date(year, i + 1, 1))
      return (sign > 0 ? s.income : s.expenses) / 1000
    })
  const thisYear = monthly(y, 1)
  const lastYear = monthly(y - 1, 1)
  const ytd = (vals) => vals.slice(0, m + 1).reduce((a, b) => a + b, 0)
  const earnings = {
    [y]: {
      total: thisYear.reduce((a, b) => a + b, 0) * 1000,
      delta: round1(pctChange(ytd(thisYear), ytd(lastYear))),
      vs: 'vs Last Year',
      values: thisYear,
    },
    [y - 1]: { total: lastYear.reduce((a, b) => a + b, 0) * 1000, delta: 0, vs: 'vs Last Year', values: lastYear },
  }

  /* ---- last 12 months cash flow ---- */
  const cashflow = { labels: [], income: [], expenses: [] }
  for (let k = 11; k >= 0; k--) {
    const from = new Date(y, m - k, 1)
    const s = sums(tx, from, new Date(y, m - k + 1, 1))
    cashflow.labels.push(MONTHS[from.getMonth()])
    cashflow.income.push(s.income / 1000)
    cashflow.expenses.push(s.expenses / 1000)
  }

  /* ---- income sources, year to date, with an 8-month trend ---- */
  const yearStart = new Date(y, 0, 1)
  const sourceOf = (x) => (['Salary', 'Freelance', 'Business'].includes(x.category) ? x.category : 'Other income')
  const incomeSources = ['Salary', 'Freelance', 'Business', 'Other income']
    .map((name) => {
      const mine = tx.filter((x) => x.amount > 0 && sourceOf(x) === name)
      const value = mine.filter((x) => parse(x.date) >= yearStart).reduce((s, x) => s + x.amount, 0)
      const trend = Array.from({ length: 8 }, (_, k) => {
        const from = new Date(y, m - 7 + k, 1)
        const to = new Date(y, m - 6 + k, 1)
        return mine.filter((x) => parse(x.date) >= from && parse(x.date) < to).reduce((s, x) => s + x.amount, 0) / 1000
      })
      return { id: name.toLowerCase().replace(/\s+/g, '-'), name, value, trend }
    })
    .filter((s, i) => i < 3 || s.value > 0)

  /* ---- spending by category this month ---- */
  const [monthFrom, monthTo] = win.month
  const thisMonthOut = tx.filter((x) => x.amount < 0 && parse(x.date) >= monthFrom && parse(x.date) < monthTo)
  const byCat = new Map()
  for (const x of thisMonthOut) byCat.set(x.category, (byCat.get(x.category) ?? 0) - x.amount)
  const iconFor = Object.fromEntries([...SPENDING_CATEGORIES, ...seed.BUDGETS, ...DEFAULT_BUDGETS, ...budgets].map((b) => [b.name, b.icon]))
  const categories = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ id: name, name, v, icon: iconFor[name] ?? 'receipt' }))

  /* ---- budgets: spent this month comes from the transactions ---- */
  // a budget with rollover also gets what it didn't use in earlier months (baseLimit is the limit the user set)
  // a pause (a trip, a holiday): what was spent on those days isn't counted against the budget
  const today = isoDay(now)
  const budgetsView = budgets.map((b) => {
    const carry = carryOver(b, tx, now)
    const hit = (day) => Boolean(pause && day >= pause.from && day <= pause.to && (!pause.ids?.length || pause.ids.includes(b.id)))
    const pausedSpent = pause
      ? Math.round(thisMonthOut.filter((x) => x.category === b.name && hit(x.date.slice(0, 10))).reduce((s, x) => s - x.amount, 0) * 100) / 100
      : 0
    return {
      ...b,
      spent: Math.round(((byCat.get(b.name) ?? 0) - pausedSpent) * 100) / 100,
      pausedSpent,
      paused: hit(today),
      baseLimit: b.limit,
      carry,
      limit: Math.round((b.limit + carry) * 100) / 100,
    }
  })

  /* ---- 52 weeks of daily spending ---- */
  const end = startOfDay(now)
  const dow = (end.getDay() + 6) % 7
  const heatStart = new Date(end.getTime() - (dow + 51 * 7) * DAY)
  const perDay = new Map()
  for (const x of tx) if (x.amount < 0) perDay.set(x.date.slice(0, 10), (perDay.get(x.date.slice(0, 10)) ?? 0) - x.amount)
  const heat = []
  for (let w = 0; w < 52; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(heatStart.getFullYear(), heatStart.getMonth(), heatStart.getDate() + w * 7 + d)
      const key = isoDay(date)
      days.push({ date: key, amt: Math.round(perDay.get(key) ?? 0), future: date > end })
    }
    heat.push(days)
  }

  /* ---- average daily spend over 30 days, with an 8-week trend ---- */
  const last30 = sums(tx, new Date(end.getTime() - 29 * DAY), new Date(end.getTime() + DAY))
  const prev30 = sums(tx, new Date(end.getTime() - 59 * DAY), new Date(end.getTime() - 29 * DAY))
  const daily = {
    value: last30.expenses / 30,
    delta: round1(pctChange(last30.expenses, prev30.expenses)),
    trend: Array.from({ length: 8 }, (_, k) => {
      const to = new Date(end.getTime() + DAY - (7 - k) * 7 * DAY)
      return sums(tx, new Date(to.getTime() - 7 * DAY), to).expenses / 7
    }),
  }

  /* ---- balance change over the last 7 days ---- */
  const week = sums(tx, new Date(end.getTime() - 6 * DAY), new Date(end.getTime() + DAY))

  /* ---- transfer limits ---- */
  const outTransfers = (from) =>
    tx.filter((x) => x.category === 'Transfer' && x.amount < 0 && parse(x.date) >= from).reduce((s, x) => s - x.amount, 0)

  return {
    demo: false,
    periods,
    earnings,
    earningYears: [String(y), String(y - 1)],
    earningMonth: m,
    cashflow,
    incomeSources,
    categories,
    budgets: budgetsView,
    budgetTotal: budgetsView.reduce((s, b) => s + b.limit, 0),
    heat,
    daily,
    weekNet: week.net,
    reports: [],
    limits: { daily: outTransfers(end), monthly: outTransfers(monthFrom), international: 0 },
    monthLabel: MONTHS[m],
    year: y,
  }
}

/** The fixed sample figures the demo shows. */
export function demoStats(budgets) {
  return {
    demo: true,
    periods: Object.fromEntries(Object.entries(seed.PERIODS).map(([k, p]) => [k, { ...p, rateDelta: 3.4 }])),
    earnings: seed.EARNINGS,
    earningYears: ['2026', '2025'],
    earningMonth: 6,
    cashflow: seed.CASHFLOW,
    incomeSources: seed.INCOME_SOURCES,
    categories: seed.CATEGORIES,
    budgets,
    budgetTotal: 5500,
    heat: seed.HEAT,
    daily: { value: 161.29, delta: -4.2, trend: [188, 172, 181, 165, 176, 158, 169, 161] },
    weekNet: null,
    reports: seed.REPORTS,
    limits: { daily: 250, monthly: 3240, international: 642 },
    monthLabel: 'Oct',
    year: 2026,
  }
}

/* ---- the user's own cards: they add them; only a name and the last 4 digits are kept ---- */
export const CARD_NETWORKS = ['visa', 'mastercard', 'amex', 'rupay', 'other']
export const CARD_SKINS = ['onyx', 'ember', 'ocean']
/** The last 4 digits of a card (the demo's sample cards have a full made-up number). */
export const lastFour = (card) => card?.last4 ?? String(card?.number ?? '').slice(-4)

/** A card the user typed in, cleaned up; null if it isn't usable. Never keeps more than the last 4 digits. */
export function makeCard({ id, label, last4, network = 'other', kind = 'debit', exp = '', skin = 'onyx' }) {
  const digits = String(last4 ?? '').replace(/\D/g, '')
  const name = String(label ?? '').trim().slice(0, 30)
  if (!name || digits.length !== 4) return null
  const e = String(exp ?? '').trim()
  const m = e.match(/^(\d{1,2})\s*\/\s*(\d{2})$/)
  if (e && !(m && +m[1] >= 1 && +m[1] <= 12)) return null
  return {
    id,
    label: name,
    last4: digits,
    network: CARD_NETWORKS.includes(network) ? network : 'other',
    kind: kind === 'credit' ? 'credit' : 'debit',
    exp: m ? `${m[1].padStart(2, '0')}/${m[2]}` : '',
    skin: CARD_SKINS.includes(skin) ? skin : 'onyx',
  }
}

/** "Nov 4" and days left for a bill saved with a dueDate (YYYY-MM-DD). */
export function billDue(b, now = new Date()) {
  if (!b.dueDate) return { due: b.due, days: b.days }
  const d = parse(b.dueDate)
  return { due: `${MONTHS[d.getMonth()]} ${d.getDate()}`, days: Math.round((d - startOfDay(now)) / DAY) }
}
