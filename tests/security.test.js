/* Exports that are safe to open: no formulas, no broken quoting. */
import { describe, expect, it } from 'vitest'
import { csvCell } from '../src/lib/format'
import { makeTrace, traceCsv } from '../src/lib/trace'
import { cleanEvent } from '../src/lib/monitor'
import { statementFor, statementHtml, statementMonths } from '../src/lib/statement'

describe('CSV cells', () => {
  it('never lets a cell run as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe(`"'=HYPERLINK(""http://evil"",""click"")"`)
    expect(csvCell('+1 555 0100')).toBe("'+1 555 0100")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('-cmd')).toBe("'-cmd")
  })
  it('keeps numbers, including negative ones, as numbers', () => {
    expect(csvCell('-45.20')).toBe('-45.20')
    expect(csvCell(12)).toBe('12')
  })
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Rosa’s, Grocery')).toBe('"Rosa’s, Grocery"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })
  it('traces export safely too', () => {
    const tr = makeTrace('x', 'y', [{ id: '1', date: '2026-11-01T12:00', name: '=1+1', amount: -5, category: 'Other' }])
    expect(traceCsv(tr)).toContain("'=1+1")
  })
})

describe('error reports', () => {
  it('carry no personal details', () => {
    const e = cleanEvent({
      user: { email: 'a@b.c' },
      request: { data: { amount: 500 }, cookies: 'x', headers: { a: 1 }, url: 'https://site/' },
      message: 'Payment of 1,250.00 to card 4242 4242 failed',
      exception: { values: [{ value: 'Bad amount 9999.99' }] },
      breadcrumbs: [{ category: 'console', message: 'typed 123456' }, { category: 'ui.click', message: 'button' }, { category: 'fetch', message: 'GET /rest/v1/user_state' }],
    })
    expect(e.user).toBeUndefined()
    expect(e.request).toEqual({ url: 'https://site/' })
    expect(e.message).not.toMatch(/\d{3}/)
    expect(e.exception.values[0].value).not.toMatch(/9999/)
    expect(e.breadcrumbs.map((b) => b.category)).toEqual(['ui.click'])
  })
})

describe('monthly statement', () => {
  const tx = (date, name, amount, category = 'Groceries') => ({ id: date + name, name, date: `${date}T12:00`, amount, category, status: 'Completed' })
  const transactions = [tx('2026-10-01', 'Pay', 3000, 'Salary'), tx('2026-10-05', 'Kroger', -120.5), tx('2026-10-20', 'Cinema', -30, 'Entertainment'), tx('2026-11-02', 'Kroger', -50)]
  it('works the balances back from today and adds up the month', () => {
    const st = statementFor({ transactions, balance: 1000, budgets: [{ name: 'Groceries', limit: 100 }] }, '2026-10')
    expect(st.closing).toBe(1050)
    expect(st.opening).toBe(-1799.5)
    expect(st.income).toBe(3000)
    expect(st.spent).toBe(150.5)
    expect(st.categories[0]).toEqual({ name: 'Groceries', amount: 120.5, share: 80 })
    expect(st.budgets[0]).toEqual({ name: 'Groceries', limit: 100, spent: 120.5 })
    expect(st.rows.map((r) => r.name)).toEqual(['Pay', 'Kroger', 'Cinema'])
    expect(statementMonths(transactions)).toEqual(['2026-11', '2026-10'])
  })
  it('escapes names in the page', () => {
    const st = statementFor({ transactions: [tx('2026-10-05', '<b>bold</b> & "quoted"', -5)], balance: 0 }, '2026-10')
    const tr = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k]) : s)
    const html = statementHtml(st, { t: tr, money: (n) => `$${n.toFixed(2)}`, monthName: 'October 2026' })
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;')
  })
})
