/* ------------------------------------------------------------------
   Reading a bank statement saved as CSV. Banks all lay these out a bit
   differently, so this finds the date, description and amount columns
   by their headings (or by what's in them), and copes with the usual
   date and number styles. Everything happens in the browser.
   ------------------------------------------------------------------ */
export const MAX_ROWS = 5000

/** Split CSV text into rows of cells: quoted cells, doubled quotes, and , ; or tab between cells. */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '')
  const head = src.split(/\r?\n/).slice(0, 10).join('\n')
  const count = (ch) => head.split(ch).length - 1
  const sep = count('\t') > count(',') && count('\t') > count(';') ? '\t' : count(';') > count(',') ? ';' : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()))
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()))
  return rows
}

/** "1,234.56", "1.234,56", "(12.50)", "$12.50-", "12.50 DR" → a number, or null. */
export function parseAmount(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (/\bDR\b/i.test(s)) negative = true
  s = s.replace(/\b(CR|DR)\b/gi, '').replace(/[^\d.,+-]/g, '')
  if (/-/.test(s)) negative = true
  s = s.replace(/[+-]/g, '')
  if (!/\d/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    // the comma is the decimal mark only with 1 or 2 digits after it ("1.234,56"); otherwise it groups thousands
    const after = s.length - lastComma - 1
    s = after <= 2 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else s = s.replace(/,/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round((negative ? -n : n) * 100) / 100
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const two = (n) => String(n).padStart(2, '0')
const fullYear = (y) => (y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y)
const day = (y, m, d) => {
  const yy = fullYear(y)
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && yy >= 1970 && yy <= 2100)) return null
  if (d > new Date(Date.UTC(yy, m, 0)).getUTCDate()) return null
  return `${yy}-${two(m)}-${two(d)}`
}

/** A date in any common style → 'YYYY-MM-DD', or null. order: 'mdy' or 'dmy' for 03/04/2026. */
export function parseDate(raw, order = 'mdy') {
  const s = String(raw ?? '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return day(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/)
  if (m) return order === 'dmy' ? day(+m[3], +m[2], +m[1]) : day(+m[3], +m[1], +m[2])
  // "14 Nov 2026", "14-Nov-26"
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*\.?,?[\s-]+(\d{2}|\d{4})\b/)
  if (m && MONTH_NAMES.includes(m[2].toLowerCase())) return day(+m[3], MONTH_NAMES.indexOf(m[2].toLowerCase()) + 1, +m[1])
  // "Nov 14, 2026"
  m = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{2}|\d{4})\b/)
  if (m && MONTH_NAMES.includes(m[1].toLowerCase())) return day(+m[3], MONTH_NAMES.indexOf(m[1].toLowerCase()) + 1, +m[2])
  return null
}

/** 03/04/2026: day first or month first? Decided by the dates that can only be read one way. */
export function dateOrder(values) {
  let dmy = 0
  let mdy = 0
  for (const v of values) {
    const m = String(v ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/)
    if (!m) continue
    if (+m[1] > 12) dmy++
    else if (+m[2] > 12) mdy++
  }
  return dmy > mdy ? 'dmy' : 'mdy'
}

const HEAD = {
  date: /^(transaction |posting |posted |value |booking |trans\.? )?date$|^date\b|^posted$/i,
  name: /desc|narrat|detail|payee|merchant|memo|particular|reference|^name$|^transaction$/i,
  amount: /^amount|amount$|^value$|^sum$/i,
  debit: /debit|withdraw|paid out|money out|^out$|payment(s)? out|spent/i,
  credit: /credit|deposit|paid in|money in|^in$|payment(s)? in|received/i,
  type: /^(type|transaction type|dr\/cr|cr\/dr)$/i,
}

/** Which column is which: from the heading row if there is one, else from what the columns hold. */
export function findColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i]
    const at = (re, skip = []) => r.findIndex((c, k) => !skip.includes(k) && re.test(c))
    const date = at(HEAD.date)
    if (date < 0) continue
    const debit = at(HEAD.debit, [date])
    const credit = at(HEAD.credit, [date])
    const amount = at(HEAD.amount, [date])
    if (amount < 0 && debit < 0 && credit < 0) continue
    const taken = [date, amount, debit, credit].filter((k) => k >= 0)
    let name = at(HEAD.name, taken)
    if (name < 0) name = r.findIndex((_, k) => !taken.includes(k))
    return { header: i, date, name, amount, debit, credit, type: at(HEAD.type, taken) }
  }
  // no headings: the column of dates, the last column of numbers, and the wordiest column
  const sample = rows.slice(0, 30)
  const width = Math.max(0, ...sample.map((r) => r.length))
  const share = (k, ok) => sample.filter((r) => ok(r[k])).length / (sample.length || 1)
  const cols = [...Array(width).keys()]
  const date = cols.find((k) => share(k, (c) => parseDate(c) !== null) > 0.8) ?? -1
  const nums = cols.filter((k) => k !== date && share(k, (c) => parseAmount(c) !== null && /\d/.test(c ?? '') && !/[A-Za-z]{3}/.test(c ?? '')) > 0.8)
  const amount = nums.length ? nums[0] : -1
  const wordy = cols
    .filter((k) => k !== date && !nums.includes(k))
    .sort((a, b) => sample.reduce((s, r) => s + (r[b]?.length ?? 0), 0) - sample.reduce((s, r) => s + (r[a]?.length ?? 0), 0))
  return { header: -1, date, name: wordy[0] ?? -1, amount, debit: -1, credit: -1, type: -1 }
}

/**
 * A whole statement → { rows: [{ date, name, amount }], skipped, total, problem }.
 * amount is negative for money out. problem: 'empty' | 'columns' when nothing could be read.
 */
export function readStatement(text) {
  const table = parseCsv(text)
  if (!table.length) return { rows: [], skipped: 0, total: 0, problem: 'empty' }
  const col = findColumns(table)
  if (col.date < 0 || (col.amount < 0 && col.debit < 0 && col.credit < 0)) return { rows: [], skipped: 0, total: table.length, problem: 'columns' }
  const body = table.slice(col.header + 1)
  const order = dateOrder(body.map((r) => r[col.date]))
  const rows = []
  let skipped = 0
  for (const r of body) {
    const date = parseDate(r[col.date], order)
    let amount = null
    if (col.amount >= 0) {
      amount = parseAmount(r[col.amount])
      // a Type column saying "debit" turns an unsigned amount into money out
      if (amount !== null && amount > 0 && col.type >= 0 && /debit|\bdr\b|withdraw|payment|purchase/i.test(r[col.type] ?? '')) amount = -amount
    } else {
      const out = col.debit >= 0 ? parseAmount(r[col.debit]) : null
      const into = col.credit >= 0 ? parseAmount(r[col.credit]) : null
      if (out !== null || into !== null) amount = Math.round((Math.abs(into ?? 0) - Math.abs(out ?? 0)) * 100) / 100
    }
    const name = (col.name >= 0 ? (r[col.name] ?? '') : '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!date || amount === null || amount === 0) {
      skipped++
      continue
    }
    rows.push({ date, name: name || 'Transaction', amount })
    if (rows.length >= MAX_ROWS) break
  }
  return { rows, skipped, total: body.length, problem: rows.length ? null : 'columns' }
}

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Is this row already in the account? Same day, same amount, and the names match or one holds the other. */
export function isDuplicate(row, transactions = []) {
  const cents = Math.round(row.amount * 100)
  const a = norm(row.name)
  return transactions.some((x) => {
    if (String(x.date).slice(0, 10) !== row.date || Math.round(x.amount * 100) !== cents) return false
    const b = norm(x.name)
    return !a || !b || a === b || a.includes(b) || b.includes(a)
  })
}
