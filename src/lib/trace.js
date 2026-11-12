/* ------------------------------------------------------------------
   "Show your work": every number Grace states comes with a trace of
   how it was worked out, so it can be checked against the account's
   own transactions.

   A trace is
   {
     label:   "Food & Dining spending, this month",
     formula: one plain sentence,
     rows:    [{ id, date, description, amount }]  the exact transactions used
     steps:   ["12 transactions matched", "Total = $187.40"],
     period:  { from, to } as YYYY-MM-DD (to is the last day included) or null,
     currency: 'USD',
     value:   the number Grace states,
     sign:    1 or -1,
     sum:     true when value === sign × (sum of rows), checked to the cent
   }

   All arithmetic is in whole cents. Numbers only ever come from this
   code: the LLM (lib/llm.js) never produces a figure that gets a trace.
   ------------------------------------------------------------------ */
import { money } from './format'
import { getLocale, LOCALES, t } from './i18n'

/** Dollars to whole cents, and back. */
export const toCents = (n) => Math.round(Number(n || 0) * 100)
export const fromCents = (c) => Math.round(c) / 100 + 0

/** The total of some amounts, added in cents. */
export const sumCents = (list, pick = (x) => x.amount) => list.reduce((s, x) => s + toCents(pick(x)), 0)

/** A transaction as a trace row. */
export const rowOf = (x) => ({
  id: x.id ?? null,
  date: String(x.date ?? '').slice(0, 10),
  description: String(x.name ?? x.description ?? ''),
  amount: fromCents(toCents(x.amount)),
})

const two = (n) => String(n).padStart(2, '0')
const day = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`

/** A period from a [from, to) range of Dates: the last day included, as YYYY-MM-DD. */
export const periodOf = (range) => (range ? { from: day(range.from), to: day(new Date(range.to.getTime() - 1)) } : null)

/** "Nov 3" in the user's language. */
export const dayLabel = (iso) => new Date(`${iso}T12:00`).toLocaleDateString(LOCALES[getLocale()]?.tag ?? 'en', { month: 'short', day: 'numeric' })

/**
 * Build a trace. Unless opts.value is given, the value is the sum of the rows (× opts.sign),
 * so it can't disagree with them.
 * opts: { sign = 1, value, currency = 'USD', empty }; empty is the step shown when no rows matched.
 */
export function makeTrace(label, formula, rows = [], steps = [], period = null, opts = {}) {
  const list = rows.map(rowOf)
  const sign = opts.sign ?? 1
  const sum = opts.value === undefined
  const value = sum ? fromCents(sign * sumCents(list)) : opts.value
  const shown = sum && !list.length ? [opts.empty ?? t('No transactions matched, so the total is {amount}.', { amount: money(0) })] : steps
  return { label, formula, rows: list, steps: shown, period, currency: opts.currency ?? 'USD', value, sign, sum }
}

/** The standard steps for a sum: how many rows, and the total. */
export const sumSteps = (rows, total) => [
  rows.length === 1 ? t('1 transaction matched') : t('{n} transactions matched', { n: rows.length }),
  t('Total = {amount}', { amount: money(total) }),
]

/** Does a trace's value really equal its rows? (For tests and the panel's check mark.) */
export const traceAddsUp = (tr) => !tr.sum || toCents(tr.value) === tr.sign * sumCents(tr.rows)

/** The rows as CSV, for "Copy as CSV". */
export function traceCsv(tr) {
  const cell = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [['date', 'description', 'amount', 'currency'].join(',')]
  for (const r of tr.rows) lines.push([r.date, r.description, r.amount.toFixed(2), tr.currency].map(cell).join(','))
  if (tr.sum) lines.push(['', 'Total', tr.value.toFixed(2), tr.currency].map(cell).join(','))
  return lines.join('\n')
}

/** A smaller copy for Grace's activity log (it's saved with the account): at most 4 traces of 50 rows. */
export const slimTraces = (traces) =>
  traces?.length
    ? traces.slice(0, 4).map((tr) => ({ ...tr, rows: tr.rows.slice(0, 50), cut: tr.rows.length > 50 ? tr.rows.length : undefined }))
    : undefined
