/* ------------------------------------------------------------------
   Where money sits, and what each transaction is.

   Accounts: the balance is split by where the money actually is
   (checking, savings, cash, a credit card). Every transaction can
   belong to one account; anything without one is in "Main account".
   Main = the whole balance minus every other account, so the totals
   always agree with the balance at the top of the app.
   A move between two accounts is a pair of transactions with status
   'Moved': they change both accounts but never count as income or
   spending.

   Also here: reconciling an account against a bank statement, credit
   card cycles, tags and saved searches, money to claim back, the
   year-end tax summary, deleting by date and pausing budgets.
   All money math is in cents.
   ------------------------------------------------------------------ */
const c = (n) => Math.round((Number(n) || 0) * 100)
const d = (cents) => Math.round(cents) / 100

export const MAIN = 'main'
export const ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'credit']
export const ACCOUNT_LABEL = { checking: 'Checking', savings: 'Savings', cash: 'Cash', credit: 'Credit card' }
export const ACCOUNT_ICON = { checking: 'wallet', savings: 'safe', cash: 'sack', credit: 'card', main: 'wallet' }

/** Statuses that never moved money (so they don't change an account). */
const NOT_MOVED = new Set(['Pending', 'Failed'])
const moved = (x) => !NOT_MOVED.has(x.status)

const dayOf = (iso) => String(iso ?? '').slice(0, 10)

/** An account the user typed in, cleaned up; null if it isn't usable. */
export function makeAccount({ id, name, type = 'checking', opening = 0, limit = 0, closeDay = 0, dueDay = 0, cardId = null, remindDays = 3 }) {
  const label = String(name ?? '').trim().slice(0, 40)
  if (!label || !id) return null
  const kind = ACCOUNT_TYPES.includes(type) ? type : 'checking'
  const start = d(c(opening))
  const acc = { id, name: label, type: kind, opening: kind === 'credit' ? -Math.abs(start) : start }
  if (kind === 'credit') {
    const day = (n) => Math.min(31, Math.max(0, Math.round(Number(n) || 0)))
    acc.limit = Math.max(0, d(c(limit)))
    acc.closeDay = day(closeDay)
    acc.dueDay = day(dueDay)
    acc.cardId = cardId || null
    acc.remindDays = Math.min(14, Math.max(0, Math.round(Number(remindDays) || 0)))
  }
  return acc
}

/** Balance of each account ({ main, [id]: amount }); main is whatever of the balance isn't elsewhere. */
export function accountBalances(accounts = [], transactions = [], balance = 0) {
  const known = new Set(accounts.map((a) => a.id))
  const sums = new Map(accounts.map((a) => [a.id, c(a.opening)]))
  for (const x of transactions) {
    if (!x.account || !known.has(x.account) || !moved(x)) continue
    sums.set(x.account, sums.get(x.account) + c(x.amount))
  }
  const out = {}
  let elsewhere = 0
  for (const [id, cents] of sums) {
    out[id] = d(cents)
    elsewhere += cents
  }
  out[MAIN] = d(c(balance) - elsewhere)
  return out
}

/** The pair of transactions for moving money between two accounts (from and to are account ids or 'main'). */
export function transferPair({ from, to, amount, date, note = '', names = {} }, makeId) {
  const cents = c(amount)
  if (!(cents > 0) || from === to) return []
  const label = (id) => names[id] ?? id
  const base = { category: 'Transfer', kind: 'transfer', method: 'Between accounts', status: 'Moved', date, note }
  const pair = makeId()
  return [
    { ...base, id: makeId(), pair, name: `Moved to ${label(to)}`, amount: -cents / 100, ...(from === MAIN ? {} : { account: from }) },
    { ...base, id: makeId(), pair, name: `Moved from ${label(from)}`, amount: cents / 100, ...(to === MAIN ? {} : { account: to }) },
  ]
}

/** The account a new expense goes to: the credit account linked to the card, the cash account for cash, else what was picked. */
export function accountFor({ accounts = [], cardId = null, cash = false, picked = '' }) {
  if (picked) return picked === MAIN ? null : picked
  if (cardId) {
    const acc = accounts.find((a) => a.type === 'credit' && a.cardId === cardId)
    if (acc) return acc.id
  }
  if (cash) return accounts.find((a) => a.type === 'cash')?.id ?? null
  return null
}

/* ---------------- reconciling against a statement ---------------- */
/** Transactions in an account (main: those with no known account). */
export function inAccount(accounts = [], transactions = [], id = MAIN) {
  const known = new Set(accounts.map((a) => a.id))
  return transactions.filter((x) => moved(x) && (id === MAIN ? !x.account || !known.has(x.account) : x.account === id))
}

/**
 * What the account would show on a statement that has only the ticked (cleared) transactions,
 * and how far it is from the balance printed on the statement.
 */
export function reconcile({ accounts = [], transactions = [], balance = 0, id = MAIN, statement }) {
  const now = accountBalances(accounts, transactions, balance)[id] ?? 0
  const rows = inAccount(accounts, transactions, id)
  const open = rows.filter((x) => !x.cleared)
  const clearedC = c(now) - open.reduce((s, x) => s + c(x.amount), 0)
  const want = statement === '' || statement == null ? null : c(statement)
  return {
    balance: now,
    cleared: d(clearedC),
    unticked: open.length,
    difference: want == null ? null : d(want - clearedC),
    matches: want != null && want === clearedC,
  }
}

/* ---------------- credit cards ---------------- */
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate()
const onDay = (y, m, day) => new Date(y, m, Math.min(day, daysIn(y, m)))
const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())

/** A credit card's numbers: what's owed, how much of the limit is used, and the next close and due dates. */
export function cardCycle(acc, owedBalance, now = new Date()) {
  const owed = Math.max(0, -(Number(owedBalance) || 0))
  const util = acc.limit > 0 ? Math.round((owed / acc.limit) * 1000) / 10 : null
  const today = startOf(now)
  const next = (day) => {
    if (!day) return null
    const here = onDay(today.getFullYear(), today.getMonth(), day)
    return here >= today ? here : onDay(today.getFullYear(), today.getMonth() + 1, day)
  }
  const close = next(acc.closeDay)
  const due = next(acc.dueDay)
  const daysTo = (x) => (x ? Math.round((x - today) / 86400000) : null)
  return {
    owed: d(c(owed)),
    available: acc.limit > 0 ? d(Math.max(0, c(acc.limit) - c(owed))) : null,
    util,
    // under 30% is what lenders like to see
    level: util == null ? null : util < 30 ? 'good' : util < 60 ? 'fair' : 'high',
    close,
    due,
    closeIn: daysTo(close),
    dueIn: daysTo(due),
  }
}

/** Cards that need a "payment due soon" nudge today: [{ acc, key }] (key: one nudge per card per due date). */
export function cardsDueSoon(accounts = [], balances = {}, done = [], now = new Date()) {
  const out = []
  for (const acc of accounts) {
    if (acc.type !== 'credit' || !acc.dueDay) continue
    const cyc = cardCycle(acc, balances[acc.id], now)
    if (!(cyc.owed > 0) || cyc.dueIn == null || cyc.dueIn > (acc.remindDays ?? 3)) continue
    const key = `${acc.id}|${cyc.due.getFullYear()}-${cyc.due.getMonth() + 1}-${cyc.due.getDate()}`
    if (!done.includes(key)) out.push({ acc, cyc, key })
  }
  return out
}

/* ---------------- tags and searches ---------------- */
export const DEDUCTIBLE = 'tax-deductible'

/** A tag as typed, cleaned up ("Work Trip " → "work-trip"); '' if nothing's left. */
export const cleanTag = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

/** Every tag in use, most used first. */
export function allTags(transactions = []) {
  const n = new Map()
  for (const x of transactions) for (const tag of x.tags ?? []) n.set(tag, (n.get(tag) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag)
}

/**
 * Does a transaction match a search? Words match the name, category, method, note and tags;
 * "#food" needs that tag; "over:50" / "under:20" compare the amount (either way).
 */
export function matches(x, query = '', extraText = '') {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = `${x.name} ${x.category} ${x.method ?? ''} ${x.note ?? ''} ${(x.tags ?? []).join(' ')} ${extraText}`.toLowerCase()
  const amt = Math.abs(Number(x.amount) || 0)
  return words.every((w) => {
    if (w.startsWith('#')) return (x.tags ?? []).includes(cleanTag(w))
    const m = w.match(/^(over|under|>|<):?(\d+(?:\.\d+)?)$/)
    if (m) return m[1] === 'over' || m[1] === '>' ? amt > Number(m[2]) : amt < Number(m[2])
    return hay.includes(w)
  })
}

/** A saved search, cleaned up; null if it has no name or nothing to search for. */
export function makeSearch({ id, name, q = '', filter = 'all', tag = '' }) {
  const label = String(name ?? '').trim().slice(0, 30)
  if (!label || (!String(q).trim() && !tag && filter === 'all')) return null
  return { id, name: label, q: String(q).trim().slice(0, 80), filter, tag: cleanTag(tag) }
}

/* ---------------- money to claim back ---------------- */
/** Open and paid-back claims, with totals. */
export function claims(transactions = []) {
  const list = transactions.filter((x) => x.claim)
  const open = list.filter((x) => x.claim.status !== 'paid')
  const paid = list.filter((x) => x.claim.status === 'paid')
  const total = (rows) => d(rows.reduce((s, x) => s + Math.abs(c(x.claim.amount ?? x.amount)), 0))
  return { open, paid, openTotal: total(open), paidTotal: total(paid) }
}

/* ---------------- year-end tax summary ---------------- */
/** One year's income, tax already paid and tax-deductible spending by category. */
export function taxSummary(transactions = [], year = new Date().getFullYear()) {
  const rows = transactions.filter((x) => x.status === 'Completed' && dayOf(x.date).startsWith(`${year}-`))
  const income = new Map()
  const deductible = new Map()
  let taxPaid = 0
  const items = []
  for (const x of rows) {
    if (x.amount > 0) income.set(x.category, (income.get(x.category) ?? 0) + c(x.amount))
    else {
      if (x.category === 'Taxes') taxPaid += -c(x.amount)
      if ((x.tags ?? []).includes(DEDUCTIBLE)) {
        deductible.set(x.category, (deductible.get(x.category) ?? 0) - c(x.amount))
        items.push(x)
      }
    }
  }
  const list = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([category, cents]) => ({ category, amount: d(cents) }))
  const sum = (m) => d([...m.values()].reduce((s, v) => s + v, 0))
  return {
    year,
    income: list(income),
    incomeTotal: sum(income),
    deductible: list(deductible),
    deductibleTotal: sum(deductible),
    taxPaid: d(taxPaid),
    items: items.sort((a, b) => String(a.date).localeCompare(String(b.date))),
  }
}

/** Years that have any transactions, newest first (this year always included). */
export function yearsOf(transactions = [], now = new Date()) {
  const ys = new Set([now.getFullYear()])
  for (const x of transactions) {
    const y = Number(dayOf(x.date).slice(0, 4))
    if (y > 1900) ys.add(y)
  }
  return [...ys].sort((a, b) => b - a)
}

/* ---------------- delete by date ---------------- */
/** Split the transactions into the ones between two days (both included) and the rest. */
export function inRange(transactions = [], from, to) {
  const lo = from || '0000-00-00'
  const hi = to || '9999-12-31'
  const hit = []
  const keep = []
  for (const x of transactions) {
    const day = dayOf(x.date)
    ;(day >= lo && day <= hi ? hit : keep).push(x)
  }
  return { hit, keep }
}

/* ---------------- pausing budgets ---------------- */
/** A pause (a trip or holiday), cleaned up; null if the dates don't make sense. */
export function makePause({ from, to, note = '', ids = [] }) {
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''))
  if (!ok(from) || !ok(to) || to < from) return null
  return { from, to, note: String(note).trim().slice(0, 40), ids: Array.isArray(ids) ? ids : [] }
}

/** Is a budget paused on this day? (no ids: every budget) */
export const pausedOn = (pause, budgetId, day) =>
  Boolean(pause && day >= pause.from && day <= pause.to && (!pause.ids?.length || pause.ids.includes(budgetId)))
