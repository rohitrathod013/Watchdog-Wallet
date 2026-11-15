/* ------------------------------------------------------------------
   Settle up: a group's open debts as the fewest payments.
   Everyone's net position (what they're owed minus what they owe) stays
   exactly the same; only who pays whom changes. Greedy: the person owed
   most is paid by the person who owes most, until everyone is square.
   This matches simplify_group_debts in supabase/schema.sql, which does
   the real change on the server; this one is for the preview.
   All in integer cents.
   ------------------------------------------------------------------ */
export const MAX_PAYMENT = 10000 // the most one request can be (the money_requests check)

const cents = (n) => Math.round(Number(n) * 100)

/** Open requests ({ requester, payer, amount }) → Map of person → net cents (positive: they're owed). */
export function netBalances(requests = []) {
  const net = new Map()
  for (const r of requests) {
    const c = cents(r.amount)
    if (!(c > 0) || r.requester === r.payer) continue
    net.set(r.requester, (net.get(r.requester) ?? 0) + c)
    net.set(r.payer, (net.get(r.payer) ?? 0) - c)
  }
  return net
}

/** Net balances → the fewest payments [{ from, to, amount }] that square everyone, biggest first. */
export function simplify(net) {
  const owed = [...net].filter(([, c]) => c > 0).map(([id, c]) => ({ id, c }))
  const owes = [...net].filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c }))
  const out = []
  let guard = 0
  while (owed.length && owes.length && guard++ < 10000) {
    // ties go by id, so the server and the preview agree
    owed.sort((a, b) => b.c - a.c || (a.id < b.id ? -1 : 1))
    owes.sort((a, b) => b.c - a.c || (a.id < b.id ? -1 : 1))
    const to = owed[0]
    const from = owes[0]
    const c = Math.min(to.c, from.c)
    out.push({ from: from.id, to: to.id, amount: c / 100 })
    to.c -= c
    from.c -= c
    if (!to.c) owed.shift()
    if (!from.c) owes.shift()
  }
  return out
}

/** Split any payment over the per-request cap into several. */
export function capped(payments, max = MAX_PAYMENT) {
  const out = []
  for (const p of payments) {
    let left = cents(p.amount)
    while (left > 0) {
      const c = Math.min(left, cents(max))
      out.push({ ...p, amount: c / 100 })
      left -= c
    }
  }
  return out
}

/** "You pay Bob", "Carol pays you", "Bob pays Carol". t is the translator, me the signed-in user, first(id) a first name. */
export function paysText(t, from, to, me, first) {
  if (from === me) return t('You pay {to}', { to: first(to) })
  if (to === me) return t('{from} pays you', { from: first(from) })
  return t('{from} pays {to}', { from: first(from), to: first(to) })
}

/** "You're owed $50", "Bob owes $20". */
export function netText(t, id, cents, me, first, money) {
  const amount = money(Math.abs(cents) / 100)
  if (id === me) return cents > 0 ? t('You’re owed {amount}', { amount }) : t('You owe {amount}', { amount })
  return cents > 0 ? t('{name} is owed {amount}', { name: first(id), amount }) : t('{name} owes {amount}', { name: first(id), amount })
}

/** The whole preview: today's payments, the simpler plan, and whether it actually saves any. */
export function settlePlan(requests = []) {
  const net = netBalances(requests)
  const after = capped(simplify(net))
  const before = requests.filter((r) => cents(r.amount) > 0 && r.requester !== r.payer).length
  return { net, before, after, saves: before - after.length, square: after.length === 0 }
}
