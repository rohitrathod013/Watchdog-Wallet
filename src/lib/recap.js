/* ------------------------------------------------------------------
   Grace's weekly recap: last week (Monday to Sunday) in a few lines.
   What went out and came in, the change from the week before, where
   most of it went, the biggest payment, anything unusual, budgets near
   their limit, and what's due this week.
   ------------------------------------------------------------------ */
const DAY = 86400000
const c = (n) => Math.round((Number(n) || 0) * 100)
const parse = (iso) => {
  const [dd, tm = '00:00'] = String(iso).split('T')
  const [y, m, day] = dd.split('-').map(Number)
  const [h, mi] = tm.split(':').map(Number)
  return new Date(y, m - 1, day, h || 0, mi || 0)
}
const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
/** Monday 00:00 of the week `now` is in. */
export const weekStart = (now = new Date()) => {
  const t = startOfDay(now)
  return new Date(t.getTime() - ((t.getDay() + 6) % 7) * DAY)
}
/** "2026-W46": the ISO week of a date, so a recap is sent once per week. */
export function weekKey(date = new Date()) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t - yearStart) / DAY + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// money that moved between your own places, or into investments, isn't spending
const counted = (x) => x.status !== 'Pending' && !['Investment', 'Transfer to pot'].includes(x.category)

function totals(list, from, to) {
  let out = 0
  let inn = 0
  const byCat = new Map()
  let biggest = null
  for (const x of list) {
    if (!counted(x)) continue
    const at = parse(x.date)
    if (at < from || at >= to) continue
    if (x.amount < 0) {
      out += -c(x.amount)
      byCat.set(x.category, (byCat.get(x.category) ?? 0) - c(x.amount))
      if (!biggest || x.amount < biggest.amount) biggest = x
    } else inn += c(x.amount)
  }
  return { out, inn, byCat, biggest }
}

/**
 * The recap of the full week before `now`. Optional extras from the app: flags (unusual payments),
 * budgets (with spent and limit) and upcoming (what's due this week).
 * → { key, from, to, spent, income, change, top: [{ category, amount }], biggest, flags, nearLimit, upcoming, empty }
 */
export function weeklyRecap({ transactions = [], budgets = [], flags = [], upcoming = [] }, now = new Date()) {
  const thisWeek = weekStart(now)
  const from = new Date(thisWeek.getTime() - 7 * DAY)
  const before = new Date(from.getTime() - 7 * DAY)
  const last = totals(transactions, from, thisWeek)
  const prev = totals(transactions, before, from)
  const top = [...last.byCat]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, cents]) => ({ category, amount: cents / 100 }))
  return {
    key: weekKey(from),
    from,
    to: new Date(thisWeek.getTime() - DAY),
    spent: last.out / 100,
    income: last.inn / 100,
    change: prev.out ? Math.round(((last.out - prev.out) / prev.out) * 1000) / 10 : null,
    top,
    biggest: last.biggest,
    flags: flags.filter((f) => {
      const at = parse(f.tx?.date ?? '')
      return at >= from && at < thisWeek
    }),
    nearLimit: budgets.filter((b) => b.limit > 0 && b.spent / b.limit >= 0.9),
    upcoming,
    empty: !last.out && !last.inn,
  }
}
