/* ------------------------------------------------------------------
   Income split: when pay lands, set percentages go into pots and goals.
   A rule: { on, categories: ['Salary'], parts: [{ id, kind: 'pot'|'goal', target, percent }] }
   Percentages add up to 100 at most; the rest stays unassigned. A goal
   only takes what it still needs. All in cents.
   ------------------------------------------------------------------ */
export const DEFAULT_SPLIT = { on: false, categories: ['Salary'], parts: [] }
export const INCOME_KINDS = ['Salary', 'Freelance', 'Business', 'Other income']

const c = (n) => Math.round((Number(n) || 0) * 100)

/** The parts that still point at a pot or goal that exists, with sane percentages. */
export function cleanSplit(split = DEFAULT_SPLIT, pots = [], goals = []) {
  const parts = (split.parts ?? [])
    .map((p) => ({ ...p, percent: Math.max(0, Math.min(100, Math.round((Number(p.percent) || 0) * 10) / 10)) }))
    .filter((p) => p.percent > 0 && (p.kind === 'pot' ? pots.some((x) => x.id === p.target) : goals.some((x) => x.id === p.target)))
  return { on: Boolean(split.on), categories: (split.categories ?? []).filter((k) => INCOME_KINDS.includes(k)), parts }
}

export const totalPercent = (parts = []) => Math.round(parts.reduce((s, p) => s + (Number(p.percent) || 0), 0) * 10) / 10

/**
 * Where an income of `amount` in `category` goes. → [{ kind, target, name, amount }] (empty when the rule is off,
 * the category isn't covered, or the percentages are over 100).
 */
export function planSplit(amount, category, split, pots = [], goals = []) {
  const rule = cleanSplit(split, pots, goals)
  if (!rule.on || !(amount > 0) || !rule.categories.includes(category) || totalPercent(rule.parts) > 100) return []
  const out = []
  for (const p of rule.parts) {
    let cents = Math.floor((c(amount) * p.percent) / 100)
    if (p.kind === 'goal') {
      const g = goals.find((x) => x.id === p.target)
      cents = Math.min(cents, Math.max(0, c(g.target) - c(g.saved)))
      if (cents > 0) out.push({ kind: 'goal', target: g.id, name: g.name, amount: cents / 100 })
    } else {
      const pot = pots.find((x) => x.id === p.target)
      if (cents > 0) out.push({ kind: 'pot', target: pot.id, name: pot.name, amount: cents / 100 })
    }
  }
  return out
}
