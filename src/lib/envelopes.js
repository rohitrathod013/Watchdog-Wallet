/* ------------------------------------------------------------------
   Locked budgets (envelopes). A locked budget sets this month's unspent
   part of its limit aside for that one category. Card payments in that
   category draw on it first; every other card payment and transfer can
   only use the money that isn't set aside ("free to spend").
   All the math is in integer cents.
   ------------------------------------------------------------------ */
const cents = (n) => Math.round((Number(n) || 0) * 100)
const dollars = (c) => c / 100
const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

/** Payment methods the lock applies to: the user's own cards. Cash and imports are records of money already gone. */
export const isCardMethod = (method) => /card/i.test(String(method ?? '')) && !/stripe/i.test(String(method ?? ''))

/** What's set aside right now: each locked budget's unspent limit, capped by what's actually in the balance. */
export function setAside(budgets = [], balance = 0) {
  let room = Math.max(0, cents(balance))
  const rows = []
  for (const b of budgets) {
    if (!b?.locked) continue
    const want = Math.max(0, cents(b.limit) - cents(b.spent))
    const left = Math.min(want, room)
    room -= left
    rows.push({ id: b.id, name: b.name, left: dollars(left), wanted: dollars(want) })
  }
  const total = rows.reduce((s, r) => s + cents(r.left), 0)
  return { rows, total: dollars(total), free: dollars(Math.max(0, cents(balance) - total)), any: rows.length > 0 }
}

/**
 * Can this payment go through? A card payment in a locked category uses that budget first, then free money.
 * Anything else (another category, or a transfer) can only use free money.
 * Returns { ok, fromBudget, fromFree, budget, free, short, blockedBy }.
 */
export function checkPayment({ budgets = [], balance = 0, amount = 0, category = '', card = true } = {}) {
  const aside = setAside(budgets, balance)
  const want = Math.max(0, cents(amount))
  const free = cents(aside.free)
  const own = card ? aside.rows.find((r) => same(r.name, category)) : null
  const fromBudget = own ? Math.min(want, cents(own.left)) : 0
  const fromFree = want - fromBudget
  const ok = fromFree <= free
  return {
    ok,
    locked: aside.any,
    fromBudget: dollars(fromBudget),
    fromFree: dollars(fromFree),
    budget: own ?? null,
    free: dollars(free),
    short: dollars(Math.max(0, fromFree - free)),
    // the locked budgets keeping this payment from going through (other categories' money)
    blockedBy: ok ? [] : aside.rows.filter((r) => r.left > 0 && !same(r.name, category)),
  }
}
