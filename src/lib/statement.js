/* ------------------------------------------------------------------
   A monthly statement, as a print-ready page ("Save as PDF" in the
   browser's print window turns it into a PDF on any device).
   Opening and closing balance, money in and out, spending by category,
   how each budget did, and every transaction in the month.
   The balances are worked back from today's balance and the
   transactions since, so they match what the app shows. In cents.
   ------------------------------------------------------------------ */
const c = (n) => Math.round((Number(n) || 0) * 100)
const two = (n) => String(n).padStart(2, '0')
const counted = (x) => !x.status || x.status === 'Completed'

/** The months that have transactions, newest first ('YYYY-MM'), at most 24. */
export function statementMonths(transactions = []) {
  return [...new Set(transactions.filter(counted).map((x) => String(x.date).slice(0, 7)))].sort().reverse().slice(0, 24)
}

/** The numbers for one month ('YYYY-MM'). */
export function statementFor({ transactions = [], balance = 0, budgets = [] }, month) {
  const [y, m] = month.split('-').map(Number)
  const start = `${month}-01`
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${two(m + 1)}-01`
  const all = transactions.filter(counted)
  const inMonth = all.filter((x) => String(x.date).slice(0, 10) >= start && String(x.date).slice(0, 10) < next).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  // today's balance minus everything since the month ended = the closing balance
  const after = all.filter((x) => String(x.date).slice(0, 10) >= next).reduce((s, x) => s + c(x.amount), 0)
  const closing = c(balance) - after
  const net = inMonth.reduce((s, x) => s + c(x.amount), 0)
  const opening = closing - net
  const income = inMonth.filter((x) => x.amount > 0).reduce((s, x) => s + c(x.amount), 0)
  const spent = inMonth.filter((x) => x.amount < 0).reduce((s, x) => s - c(x.amount), 0)
  const byCat = new Map()
  for (const x of inMonth) if (x.amount < 0) byCat.set(x.category, (byCat.get(x.category) ?? 0) - c(x.amount))
  const categories = [...byCat].sort((a, b) => b[1] - a[1]).map(([name, cents]) => ({ name, amount: cents / 100, share: spent ? Math.round((cents / spent) * 100) : 0 }))
  const budgetRows = budgets.map((b) => ({ name: b.name, limit: Number(b.baseLimit ?? b.limit) || 0, spent: (byCat.get(b.name) ?? 0) / 100 }))
  return {
    month,
    opening: opening / 100,
    closing: closing / 100,
    income: income / 100,
    spent: spent / 100,
    net: net / 100,
    categories,
    budgets: budgetRows,
    rows: inMonth.map((x) => ({ date: String(x.date).slice(0, 10), name: x.name, category: x.category, method: x.method ?? '', amount: x.amount })),
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

/** The statement as a full HTML page. t: the translator; money: the formatter; who: the account holder's name. */
export function statementHtml(st, { t, money, who = '', brand = 'Watchdog Wallet', monthName }) {
  const amt = (v) => `<td class="num ${v < 0 ? 'out' : 'in'}">${v < 0 ? '−' : '+'}${esc(money(Math.abs(v)))}</td>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(`${brand} ${t('statement')} ${st.month}`)}</title>
<style>
*{box-sizing:border-box}body{font:13px/1.5 Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#151515;margin:32px;max-width:860px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:26px 0 8px}.muted{color:#6b6b6b}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #ef6c2f;padding-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.box{border:1px solid #e3e3e3;border-radius:10px;padding:10px 12px}
.box small{display:block;color:#6b6b6b}.box b{font-size:16px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee}
th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b6b6b}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.out{color:#b42318}.in{color:#067647}.over{color:#b42318;font-weight:600}.foot{margin-top:28px;font-size:11px;color:#6b6b6b}
@media print{body{margin:14mm}.noprint{display:none}}
</style></head><body>
<div class="head"><div><h1>${esc(brand)}</h1><div class="muted">${esc(t('Monthly statement'))} · ${esc(monthName)}</div></div><div class="muted">${esc(who)}</div></div>
<div class="grid">
<div class="box"><small>${esc(t('Opening balance'))}</small><b>${esc(money(st.opening))}</b></div>
<div class="box"><small>${esc(t('Money in'))}</small><b class="in">+${esc(money(st.income))}</b></div>
<div class="box"><small>${esc(t('Money out'))}</small><b class="out">−${esc(money(st.spent))}</b></div>
<div class="box"><small>${esc(t('Closing balance'))}</small><b>${esc(money(st.closing))}</b></div>
</div>
${st.categories.length ? `<h2>${esc(t('Spending by category'))}</h2><table><tr><th>${esc(t('Category'))}</th><th class="num">${esc(t('Amount'))}</th><th class="num">%</th></tr>${st.categories.map((x) => `<tr><td>${esc(t(x.name))}</td><td class="num">${esc(money(x.amount))}</td><td class="num">${x.share}%</td></tr>`).join('')}</table>` : ''}
${st.budgets.length ? `<h2>${esc(t('Budgets'))}</h2><table><tr><th>${esc(t('Budget'))}</th><th class="num">${esc(t('Spent'))}</th><th class="num">${esc(t('Limit'))}</th></tr>${st.budgets.map((b) => `<tr><td>${esc(t(b.name))}</td><td class="num ${b.spent > b.limit ? 'over' : ''}">${esc(money(b.spent))}</td><td class="num">${esc(money(b.limit))}</td></tr>`).join('')}</table>` : ''}
<h2>${esc(t('Transactions'))} (${st.rows.length})</h2>
${st.rows.length ? `<table><tr><th>${esc(t('Date'))}</th><th>${esc(t('Transaction'))}</th><th>${esc(t('Category'))}</th><th class="num">${esc(t('Amount'))}</th></tr>${st.rows.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.name)}</td><td>${esc(t(r.category))}</td>${amt(r.amount)}</tr>`).join('')}</table>` : `<p class="muted">${esc(t('No transactions this month.'))}</p>`}
<p class="foot">${esc(t('Made by {brand} from the transactions in your account. It is a summary for your own records, not a bank statement.', { brand }))}</p>
<p class="noprint"><button onclick="window.print()">${esc(t('Save as PDF or print'))}</button></p>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`
}
