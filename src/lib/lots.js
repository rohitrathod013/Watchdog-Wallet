/* ------------------------------------------------------------------
   Investing in detail: each buy is a lot (how many, what it cost, when),
   sells use the oldest lots first (FIFO), and what a sale made or lost
   is kept as a realised gain. Dividends are kept too. The S&P 500
   comparison asks: "if the same money had gone into an S&P 500 fund
   (SPY) on the same days, what would it be worth now?" For that, each
   lot remembers SPY's price on the day it was bought.
   ------------------------------------------------------------------ */
const c = (n) => Math.round((Number(n) || 0) * 100)
const d = (cents) => Math.round(cents) / 100
const EPS = 1e-9

/** A holding's lots; older holdings saved before lots existed become one lot. */
export const lotsOf = (h) => (h?.lots?.length ? h.lots : h ? [{ id: `${h.id}-0`, qty: h.qty, cost: h.cost, at: h.at ?? '' }] : [])

/** A buy added to a holding as a new lot (totals kept in step). */
export function addLot(h, lot) {
  const lots = [...lotsOf(h), lot]
  return { ...h, lots, qty: lots.reduce((s, l) => s + l.qty, 0), cost: d(lots.reduce((s, l) => s + c(l.cost), 0)) }
}

/**
 * Sell qty from a holding, oldest lots first. Returns the holding left (null if all of it went)
 * and the realised result: proceeds, the cost of what was sold, the gain, and how long it was held.
 */
export function sellFifo(h, qty, price, at = '') {
  let left = Math.min(qty, h.qty)
  const lots = lotsOf(h).map((l) => ({ ...l }))
  let costC = 0
  const used = []
  for (const l of lots) {
    if (left <= EPS) break
    const take = Math.min(l.qty, left)
    const part = Math.round((c(l.cost) * take) / l.qty)
    costC += part
    used.push({ at: l.at, qty: take })
    l.cost = d(c(l.cost) - part)
    l.qty -= take
    left -= take
  }
  const sold = Math.min(qty, h.qty)
  const rest = lots.filter((l) => l.qty > EPS * Math.max(1, h.qty))
  const proceedsC = c(sold * price)
  const holding = rest.length && sold < h.qty * 0.9999 ? { ...h, lots: rest, qty: rest.reduce((s, l) => s + l.qty, 0), cost: d(rest.reduce((s, l) => s + c(l.cost), 0)) } : null
  // held over a year (from the oldest lot used): long term
  const oldest = used.map((u) => u.at).filter(Boolean).sort()[0]
  const longTerm = Boolean(oldest && at && new Date(at) - new Date(oldest) > 365 * 86400000)
  return {
    holding,
    realised: { qty: sold, proceeds: d(proceedsC), cost: d(costC), gain: d(proceedsC - costC), longTerm },
  }
}

/** Realised gains and dividends for a year (or all time with no year). */
export function investIncome(log = { realised: [], dividends: [] }, year) {
  const inYear = (x) => !year || String(x.at).startsWith(String(year))
  const realised = (log.realised ?? []).filter(inYear)
  const dividends = (log.dividends ?? []).filter(inYear)
  const sum = (rows, f) => d(rows.reduce((s, x) => s + c(f(x)), 0))
  return {
    realised,
    dividends,
    gains: sum(realised, (x) => x.gain),
    shortTerm: sum(
      realised.filter((x) => !x.longTerm),
      (x) => x.gain,
    ),
    longTerm: sum(
      realised.filter((x) => x.longTerm),
      (x) => x.gain,
    ),
    dividendTotal: sum(dividends, (x) => x.amount),
  }
}

/** Value of each holding at today's price (or what was paid, with no price), with its share of the whole. */
export function allocation(holdings = [], prices = {}) {
  const rows = holdings.map((h) => {
    const p = prices[`${h.kind}:${h.asset}`]
    return { id: h.id, name: h.name, symbol: h.symbol, kind: h.kind, value: p ? h.qty * p : h.cost, live: Boolean(p) }
  })
  const total = rows.reduce((s, r) => s + r.value, 0)
  const byKind = {}
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + r.value
  return {
    total: d(c(total)),
    rows: rows.map((r) => ({ ...r, value: d(c(r.value)), pct: total ? Math.round((r.value / total) * 1000) / 10 : 0 })).sort((a, b) => b.value - a.value),
    byKind: Object.entries(byKind).map(([kind, v]) => ({ kind, value: d(c(v)), pct: total ? Math.round((v / total) * 1000) / 10 : 0 })),
  }
}

/**
 * Portfolio vs the S&P 500, over the lots that know SPY's price on the day they were bought.
 * Returns null when there's nothing to compare yet.
 */
export function vsSp500(holdings = [], prices = {}, spyNow) {
  if (!(spyNow > 0)) return null
  let costC = 0
  let mineC = 0
  let spyC = 0
  let lots = 0
  for (const h of holdings) {
    const p = prices[`${h.kind}:${h.asset}`]
    if (!p) continue
    for (const l of lotsOf(h)) {
      if (!(l.spy > 0)) continue
      lots++
      costC += c(l.cost)
      mineC += c(l.qty * p)
      spyC += c((l.cost / l.spy) * spyNow)
    }
  }
  if (!lots || !costC) return null
  const pct = (v) => Math.round(((v - costC) / costC) * 1000) / 10
  return { lots, cost: d(costC), mine: d(mineC), spy: d(spyC), minePct: pct(mineC), spyPct: pct(spyC), ahead: d(mineC - spyC) }
}
