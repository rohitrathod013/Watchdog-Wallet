/* Repeating transactions, reading a bank statement (CSV), and budget rollover. */
import { describe, expect, it } from 'vitest'
import { makeRule, MAX_CATCH_UP, monthlyTotal, nextRun, runAll, runsDue, validDay } from '../src/lib/recurring'
import { dateOrder, findColumns, isDuplicate, looksLikeStatement, parseAmount, parseCsv, parseDate, readStatement, readStatementText } from '../src/lib/importCsv'
import { carryOver, computeStats } from '../src/lib/stats'

describe('repeating transactions', () => {
  it('steps weekly, every 2 weeks, monthly and yearly', () => {
    expect(nextRun('2026-11-14', 'weekly')).toBe('2026-11-21')
    expect(nextRun('2026-12-25', 'biweekly')).toBe('2027-01-08')
    expect(nextRun('2026-12-05', 'monthly')).toBe('2027-01-05')
    expect(nextRun('2026-11-14', 'yearly')).toBe('2027-11-14')
  })
  it('a rule for the 31st uses the last day of short months, then goes back to the 31st', () => {
    expect(nextRun('2027-01-31', 'monthly', 31)).toBe('2027-02-28')
    expect(nextRun('2027-02-28', 'monthly', 31)).toBe('2027-03-31')
    expect(nextRun('2028-02-29', 'yearly', 29)).toBe('2029-02-28')
  })
  it('rejects rules that can’t run', () => {
    expect(makeRule({ id: 'a', name: 'Rent', amount: -900, category: 'Housing', start: '2026-12-01' })).toMatchObject({ next: '2026-12-01', anchor: 1, active: true })
    expect(makeRule({ id: 'a', name: '', amount: -900, start: '2026-12-01' })).toBeNull()
    expect(makeRule({ id: 'a', name: 'Rent', amount: 0, start: '2026-12-01' })).toBeNull()
    expect(makeRule({ id: 'a', name: 'Rent', amount: -9, start: '2026-02-30' })).toBeNull()
    expect(makeRule({ id: 'a', name: 'Rent', amount: -9, start: '2026-12-01', every: 'daily' })).toBeNull()
    expect(validDay('2028-02-29')).toBe(true)
  })
  it('adds nothing before the date, one on the date, and catches up on missed ones', () => {
    const rule = makeRule({ id: 'r', name: 'Rent', amount: -900, category: 'Housing', start: '2026-12-01' })
    expect(runsDue(rule, '2026-11-30').days).toEqual([])
    const once = runsDue(rule, '2026-12-01')
    expect(once.days).toEqual(['2026-12-01'])
    expect(once.rule.next).toBe('2027-01-01')
    expect(runsDue(once.rule, '2026-12-20').days).toEqual([])
    expect(runsDue(rule, '2027-02-15').days).toEqual(['2026-12-01', '2027-01-01', '2027-02-01'])
  })
  it('paused rules add nothing, and a long gap is capped', () => {
    const rule = makeRule({ id: 'w', name: 'Coffee club', amount: -5, category: 'Food & Dining', every: 'weekly', start: '2020-01-06' })
    expect(runsDue({ ...rule, active: false }, '2026-11-14').days).toEqual([])
    const r = runsDue(rule, '2026-11-14')
    expect(r.days).toHaveLength(MAX_CATCH_UP)
    expect(r.rule.next > '2026-11-14').toBe(true)
  })
  it('runs every rule, oldest first, and leaves the list alone when nothing is due', () => {
    const rules = [
      makeRule({ id: 's', name: 'Salary', amount: 3000, category: 'Salary', start: '2026-11-28' }),
      makeRule({ id: 'r', name: 'Rent', amount: -900, category: 'Housing', start: '2026-11-01' }),
    ]
    const quiet = runAll(rules, '2026-10-31')
    expect(quiet.changed).toBe(false)
    expect(quiet.rules).toBe(rules)
    const busy = runAll(rules, '2026-11-30')
    expect(busy.add.map((x) => [x.name, x.day])).toEqual([['Rent', '2026-11-01'], ['Salary', '2026-11-28']])
    expect(busy.rules.map((r) => r.next)).toEqual(['2026-12-28', '2026-12-01'])
  })
  it('totals a typical month', () => {
    const rules = [
      makeRule({ id: 's', name: 'Salary', amount: 3000, start: '2026-11-28' }),
      makeRule({ id: 'r', name: 'Rent', amount: -900, start: '2026-11-01' }),
      makeRule({ id: 'y', name: 'Insurance', amount: -1200, every: 'yearly', start: '2026-11-01' }),
      { ...makeRule({ id: 'p', name: 'Paused', amount: -50, start: '2026-11-01' }), active: false },
    ]
    expect(monthlyTotal(rules)).toEqual({ in: 3000, out: 1000 })
  })
})

describe('reading a statement', () => {
  it('parses quoted cells, doubled quotes and other separators', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']])
    expect(parseCsv('Date;Text;Amount\n01.02.2026;Rewe;-12,50')[1]).toEqual(['01.02.2026', 'Rewe', '-12,50'])
    expect(parseCsv('\uFEFFDate\tAmount\n2026-01-02\t5')[0]).toEqual(['Date', 'Amount'])
  })
  it('reads amounts in the usual styles', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56)
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('-12,5')).toBe(-12.5)
    expect(parseAmount('(45.00)')).toBe(-45)
    expect(parseAmount('45.00-')).toBe(-45)
    expect(parseAmount('30.00 DR')).toBe(-30)
    expect(parseAmount('30.00 CR')).toBe(30)
    expect(parseAmount('1,234')).toBe(1234)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('n/a')).toBeNull()
  })
  it('reads dates in the usual styles', () => {
    expect(parseDate('2026-11-14')).toBe('2026-11-14')
    expect(parseDate('2026/11/14 09:30')).toBe('2026-11-14')
    expect(parseDate('11/14/2026')).toBe('2026-11-14')
    expect(parseDate('14/11/2026', 'dmy')).toBe('2026-11-14')
    expect(parseDate('14.11.26', 'dmy')).toBe('2026-11-14')
    expect(parseDate('14 Nov 2026')).toBe('2026-11-14')
    expect(parseDate('November 14, 2026')).toBe('2026-11-14')
    expect(parseDate('31/02/2026', 'dmy')).toBeNull()
    expect(parseDate('hello')).toBeNull()
  })
  it('works out day-first or month-first from the dates that only read one way', () => {
    expect(dateOrder(['03/04/2026', '25/04/2026'])).toBe('dmy')
    expect(dateOrder(['03/04/2026', '04/25/2026'])).toBe('mdy')
    expect(dateOrder(['03/04/2026'])).toBe('mdy')
  })
  it('reads a statement with one signed amount column', () => {
    const r = readStatement('Date,Description,Amount\n11/02/2026,"WHOLE FOODS #123",-54.20\n11/03/2026,ACME PAYROLL,"3,000.00"\nbad,row,\n')
    expect(r.rows).toEqual([
      { date: '2026-11-02', name: 'WHOLE FOODS #123', amount: -54.2 },
      { date: '2026-11-03', name: 'ACME PAYROLL', amount: 3000 },
    ])
    expect(r.skipped).toBe(1)
  })
  it('reads separate money out and money in columns, under a few lines of bank preamble', () => {
    const text = 'Account: 1234\nExported 14 Nov 2026\n\nTransaction Date;Details;Paid out;Paid in;Balance\n13/11/2026;TESCO;12,40;;500,00\n14/11/2026;SALARY;;2.000,00;2.500,00\n'
    const r = readStatement(text)
    expect(r.rows).toEqual([
      { date: '2026-11-13', name: 'TESCO', amount: -12.4 },
      { date: '2026-11-14', name: 'SALARY', amount: 2000 },
    ])
  })
  it('uses a Type column to sign unsigned amounts', () => {
    const r = readStatement('Date,Type,Name,Amount\n2026-11-01,DEBIT,Netflix,15.99\n2026-11-02,CREDIT,Refund,20.00\n')
    expect(r.rows.map((x) => x.amount)).toEqual([-15.99, 20])
  })
  it('copes with no heading row', () => {
    const rows = parseCsv('2026-11-01,Coffee Corner,-4.50\n2026-11-02,Bus pass,-30.00\n2026-11-03,Paycheck,1500.00\n')
    expect(findColumns(rows)).toMatchObject({ header: -1, date: 0, name: 1, amount: 2 })
    expect(readStatement('2026-11-01,Coffee Corner,-4.50\n2026-11-02,Bus pass,-30.00\n').rows).toHaveLength(2)
  })
  it('says so when it can’t read the file', () => {
    expect(readStatement('').problem).toBe('empty')
    expect(readStatement('hello,world\nfoo,bar\n').problem).toBe('columns')
  })
  it('spots rows already in the account', () => {
    const have = [{ name: 'Whole Foods', amount: -54.2, date: '2026-11-02T10:15' }]
    expect(isDuplicate({ date: '2026-11-02', name: 'WHOLE FOODS #123', amount: -54.2 }, have)).toBe(true)
    expect(isDuplicate({ date: '2026-11-03', name: 'WHOLE FOODS #123', amount: -54.2 }, have)).toBe(false)
    expect(isDuplicate({ date: '2026-11-02', name: 'Shell', amount: -54.2 }, have)).toBe(false)
  })
})

describe('budget rollover', () => {
  const now = new Date(2026, 10, 14) // 14 Nov 2026
  const tx = (date, amount, category = 'Groceries') => ({ id: date + amount, name: 'x', date: `${date}T12:00`, amount, category, status: 'Completed' })
  const b = { id: 'g', name: 'Groceries', limit: 400, rollover: true, rollFrom: '2026-09' }
  it('carries what earlier months didn’t use', () => {
    // Sep: 300 spent (100 over), Oct: 250 spent (150 over) → 250 carried
    expect(carryOver(b, [tx('2026-09-10', -300), tx('2026-10-10', -250)], now)).toBe(250)
  })
  it('overspending eats into what was carried, never below zero', () => {
    expect(carryOver(b, [tx('2026-09-10', -300), tx('2026-10-10', -450)], now)).toBe(50)
    expect(carryOver(b, [tx('2026-09-10', -300), tx('2026-10-10', -900)], now)).toBe(0)
    // a bad month first doesn't put the budget in debt
    expect(carryOver(b, [tx('2026-09-10', -900), tx('2026-10-10', -300)], now)).toBe(100)
  })
  it('starts from the month it was turned on, ignores other categories and this month', () => {
    expect(carryOver({ ...b, rollFrom: '2026-11' }, [tx('2026-10-10', -100)], now)).toBe(0)
    expect(carryOver({ ...b, rollFrom: '2026-10' }, [tx('2026-10-10', -100), tx('2026-10-11', -50, 'Shopping'), tx('2026-11-02', -70)], now)).toBe(300)
    expect(carryOver({ ...b, rollover: false }, [], now)).toBe(0)
    expect(carryOver({ ...b, rollFrom: undefined }, [], now)).toBe(0)
  })
  it('looks back a year at most', () => {
    expect(carryOver({ ...b, rollFrom: '2020-01' }, [], now)).toBe(4800)
  })
  it('shows up in the stats as a bigger limit, with the user’s own limit kept', () => {
    const s = computeStats([tx('2026-09-10', -300), tx('2026-10-10', -250), tx('2026-11-03', -120)], [b, { id: 'f', name: 'Food & Dining', limit: 300 }], now)
    expect(s.budgets[0]).toMatchObject({ limit: 650, baseLimit: 400, carry: 250, spent: 120 })
    expect(s.budgets[1]).toMatchObject({ limit: 300, baseLimit: 300, carry: 0 })
    expect(s.budgetTotal).toBe(950)
  })
})

describe('statements from a PDF’s text', () => {
  const today = new Date(2026, 10, 15)
  it('uses the running balance to tell money in from money out', () => {
    const text = [
      'First Bank   Statement for November 2026',
      'Date  Description  Amount  Balance',
      'Opening balance  1,000.00',
      '02/11/2026  TESCO STORES  45.20  954.80',
      '03/11/2026  ACME PAYROLL  2,500.00  3,454.80',
      '05/11/2026  NETFLIX  15.99  3,438.81',
      'Closing balance  3,438.81',
    ].join('\n')
    const r = readStatementText(text, today)
    expect(r.rows).toEqual([
      { date: '2026-11-02', name: 'TESCO STORES', amount: -45.2 },
      { date: '2026-11-03', name: 'ACME PAYROLL', amount: 2500 },
      { date: '2026-11-05', name: 'NETFLIX', amount: -15.99 },
    ])
    expect(looksLikeStatement(text)).toBe(true)
  })
  it('reads signs written on the amount, and dates with no year', () => {
    const text = ['12 Nov  Coffee Corner  -4.50', '13 Nov  Refund from shop  12.00 CR', '14 Nov  Bus pass  (30.00)'].join('\n')
    expect(readStatementText(text, today).rows).toEqual([
      { date: '2026-11-12', name: 'Coffee Corner', amount: -4.5 },
      { date: '2026-11-13', name: 'Refund from shop', amount: 12 },
      { date: '2026-11-14', name: 'Bus pass', amount: -30 },
    ])
  })
  it('a receipt is not a statement', () => {
    expect(looksLikeStatement('CORNER CAFE\n14/11/2026 12:30\nLatte 4.50\nTOTAL 4.50')).toBe(false)
    expect(readStatementText('hello', today).problem).toBe('columns')
  })
})
