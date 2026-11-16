/* ------------------------------------------------------------------
   Quick logging from outside the app: a home screen shortcut, a phone
   assistant ("Hey Google, open Watchdog log 12 dollars coffee") or an
   iOS Shortcut can open the app with ?log=<what was said>. It's read
   here into an expense or income, then shown for one tap to confirm.
   ------------------------------------------------------------------ */
const NUM = /(?:[$€£₹]\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars?|bucks|usd|eur|euros?|pounds?|rs|rupees?)?/i
const INCOME = /\b(got paid|paid me|received|income|earned|salary|refund|got)\b/i
const FILLER =
  /\b(log|add|record|track|spent|spend|paid|pay|bought|for|on|at|an?|the|some|expense|dollars?|bucks|usd|eur|euros?|pounds?|rs|rupees?|today|please|my|got paid|received|income|earned)\b/gi

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * "log $12 coffee" → { type: 'expense', amount: 12, name: 'Coffee' }
 * "got paid 2,000 salary" → { type: 'income', amount: 2000, name: 'Salary' }
 * null when there's no amount.
 */
export function parseQuick(text) {
  const raw = String(text ?? '').trim().slice(0, 200)
  const m = raw.match(NUM)
  if (!m) return null
  const amount = Number(`${m[1].replace(/,/g, '')}.${m[2] ?? '0'}`)
  if (!(amount > 0) || amount > 1000000) return null
  const income = INCOME.test(raw)
  const rest = raw
    .replace(m[0], ' ')
    .replace(FILLER, ' ')
    .replace(/[^\p{L}\p{N}&'’ -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { type: income ? 'income' : 'expense', amount, name: title(rest.slice(0, 60)) || (income ? 'Income' : 'Expense') }
}

/** What the page was opened with (?log=… or a shared text), once; it's then cleared from the address bar. */
export function takeQuickLog(loc = window.location, hist = window.history) {
  const q = new URLSearchParams(loc.search)
  const text = q.get('log') ?? q.get('text') ?? q.get('title')
  if (text == null) return null
  for (const k of ['log', 'text', 'title', 'url']) q.delete(k)
  const search = q.toString()
  hist.replaceState(null, '', `${loc.pathname}${search ? `?${search}` : ''}${loc.hash || '#/dashboard'}`)
  return parseQuick(text) ?? { type: 'expense', amount: 0, name: title(String(text).trim().slice(0, 60)) }
}
