/* Sinking funds, paycheque, emergency fund, challenges, investing lots, quick logging, the calendar and custom splits. */
import { describe, expect, it } from 'vitest'
import { emergencyFund, monthsUntil, nextYear, noSpend, paycheck, sinkingMonthly, weekPlan } from '../src/lib/planning'
import { addLot, allocation, investIncome, lotsOf, sellFifo, vsSp500 } from '../src/lib/lots'
import { parseQuick } from '../src/lib/quickLog'
import { buildIcs, icsText } from '../src/lib/ics'
import { dueSplits, splitCustom } from '../src/lib/social'

const tx = (amount, date, category = 'Shopping', status = 'Completed') => ({ amount, date: `${date}T12:00`, category, status })

describe('sinking funds', () => {
  it('spreads what is left over the months until it is due', () => {
    const now = new Date(2026, 10, 15)
    expect(monthsUntil('2027-04-15', now)).toBe(6)
    expect(sinkingMonthly({ target: 1200, saved: 0, dueDate: '2027-04-15' }, now)).toBe(200)
    expect(sinkingMonthly({ target: 1200, saved: 1200, dueDate: '2027-04-15' }, now)).toBe(0)
    // due this month: all of it now
    expect(sinkingMonthly({ target: 100, saved: 0, dueDate: '2026-11-30' }, now)).toBe(100)
    expect(nextYear('2028-02-29')).toBe('2029-02-28')
  })
})

describe('paycheque', () => {
  it('takes each deduction off the gross pay', () => {
    const p = paycheck({ gross: 3000, every: 'biweekly', federal: 10, state: 5, socialSecurity: 6.2, medicare: 1.45, retirement: 5, health: 120, other: 0 })
    expect(p.deductions).toBe(300 + 150 + 186 + 43.5 + 150 + 120)
    expect(p.takeHome).toBe(3000 - 949.5)
    expect(p.yearly.gross).toBe(78000)
    expect(p.lines.find((l) => l.key === 'other')).toBeUndefined()
    expect(paycheck({ gross: 100, federal: 90, health: 50 }).takeHome).toBe(0)
  })
})

describe('emergency fund', () => {
  it('says how many months of spending the cash covers', () => {
    const now = new Date(2026, 10, 15)
    const list = [tx(-1000, '2026-08-10'), tx(-2000, '2026-09-10'), tx(-3000, '2026-10-10'), tx(-999, '2026-11-02'), tx(-50, '2026-10-01', 'Other', 'Pending')]
    const e = emergencyFund({ liquid: 5000, transactions: list, now })
    expect(e.monthly).toBe(2000)
    expect(e.covered).toBe(2.5)
    expect(e.level).toBe('building')
    expect(e.toThree).toBe(1000)
    expect(emergencyFund({ liquid: 100, transactions: [], now }).covered).toBeNull()
  })
})

describe('savings challenges', () => {
  it('a no-spend week counts kept days and breaks the streak on spending', () => {
    const now = new Date(2026, 10, 15, 18)
    const list = [tx(-20, '2026-11-11', 'Food & Dining'), tx(-900, '2026-11-12', 'Housing')]
    const r = noSpend({ start: '2026-11-10', days: 7 }, list, now)
    expect(r.days.map((x) => x.state)).toEqual(['kept', 'spent', 'kept', 'kept', 'kept', 'today', 'ahead'])
    expect(r.streak).toBe(4)
    expect(r.done).toBe(false)
  })
  it('the 52-week plan grows by the step each week', () => {
    const plan = weekPlan({ start: '2026-11-01', step: 1, saved: [1, 2] }, new Date(2026, 10, 16))
    expect(plan.week).toBe(3)
    expect(plan.due).toBe(3)
    expect(plan.saved).toBe(3)
    expect(plan.target).toBe(1378)
    expect(plan.streak).toBe(2)
    expect(plan.missed).toEqual([])
  })
})

describe('investing lots', () => {
  const h = { id: 'h', kind: 'stocks', asset: 'AAPL', name: 'Apple', symbol: 'AAPL', qty: 10, cost: 1000, at: '2025-01-01T10:00' }
  it('old holdings become one lot, and buys add lots', () => {
    expect(lotsOf(h)).toHaveLength(1)
    const more = addLot(h, { id: 'l2', qty: 5, cost: 750, at: '2026-06-01T10:00', spy: 500 })
    expect(more.qty).toBe(15)
    expect(more.cost).toBe(1750)
  })
  it('sells the oldest lot first and keeps the gain', () => {
    const two = addLot(h, { id: 'l2', qty: 5, cost: 750, at: '2026-06-01T10:00' })
    const { holding, realised } = sellFifo(two, 12, 200, '2026-11-01T10:00')
    expect(realised.cost).toBe(1000 + 300)
    expect(realised.proceeds).toBe(2400)
    expect(realised.gain).toBe(1100)
    expect(realised.longTerm).toBe(true)
    expect(holding.qty).toBeCloseTo(3, 9)
    expect(holding.cost).toBe(450)
    expect(sellFifo(two, 15, 1).holding).toBeNull()
  })
  it('totals gains and dividends for a year', () => {
    const r = investIncome(
      {
        realised: [
          { gain: 100, longTerm: true, at: '2026-02-01' },
          { gain: -30, longTerm: false, at: '2026-03-01' },
          { gain: 5, at: '2025-03-01' },
        ],
        dividends: [{ amount: 12.5, at: '2026-04-01' }],
      },
      2026,
    )
    expect(r.gains).toBe(70)
    expect(r.longTerm).toBe(100)
    expect(r.shortTerm).toBe(-30)
    expect(r.dividendTotal).toBe(12.5)
  })
  it('works out allocation and the S&P 500 comparison', () => {
    const btc = { id: 'b', kind: 'crypto', asset: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', qty: 0.1, cost: 5000, lots: [{ qty: 0.1, cost: 5000, spy: 500 }] }
    const prices = { 'stocks:AAPL': 150, 'crypto:bitcoin': 60000 }
    const a = allocation([h, btc], prices)
    expect(a.total).toBe(7500)
    expect(a.rows[0].symbol).toBe('BTC')
    expect(a.rows[0].pct).toBe(80)
    const cmp = vsSp500([btc], prices, 550)
    expect(cmp.mine).toBe(6000)
    expect(cmp.spy).toBe(5500)
    expect(cmp.minePct).toBe(20)
    expect(cmp.spyPct).toBe(10)
    expect(vsSp500([h], prices, 550)).toBeNull()
  })
})

describe('quick logging', () => {
  it('reads an amount and what it was for', () => {
    expect(parseQuick('log $12 coffee')).toEqual({ type: 'expense', amount: 12, name: 'Coffee' })
    expect(parseQuick('spent 4.50 on bus fare')).toEqual({ type: 'expense', amount: 4.5, name: 'Bus fare' })
    expect(parseQuick('got paid 2,000 dollars salary')).toEqual({ type: 'income', amount: 2000, name: 'Salary' })
    expect(parseQuick('coffee')).toBeNull()
  })
})

describe('calendar', () => {
  it('turns repeating payments and bills into events', () => {
    const { text, count } = buildIcs({
      rules: [
        { id: 'r1', name: 'Netflix', amount: -15.49, every: 'monthly', next: '2026-12-01', active: true, category: 'Subscriptions' },
        { id: 'r2', name: 'Salary', amount: 3000, every: 'monthly', next: '2026-12-01', active: true },
      ],
      bills: [
        { id: 'b1', name: 'Rent, flat 2', amount: 1200, dueDate: '2026-12-03', paid: false },
        { id: 'b2', name: 'Old', amount: 1, dueDate: '2026-10-03', paid: true },
      ],
      now: new Date(Date.UTC(2026, 10, 15)),
    })
    expect(count).toBe(2)
    expect(text).toContain('RRULE:FREQ=MONTHLY')
    expect(text).toContain('SUMMARY:Rent\\, flat 2 $1200.00')
    expect(text).toContain('DTSTART;VALUE=DATE:20261203')
    expect(text).toContain('DTEND;VALUE=DATE:20261204')
    expect(text.split('\r\n').every((l) => l.length <= 75)).toBe(true)
    expect(icsText('a;b\nc')).toBe('a\\;b\\nc')
  })
})

describe('custom and monthly splits', () => {
  it('splits by amount or percent, with the rest as my share', () => {
    expect(splitCustom(100, ['a', 'b'], { a: 30, b: 20 }, 'amount')).toEqual({
      shares: [
        { friend: 'a', amount: 30 },
        { friend: 'b', amount: 20 },
      ],
      mine: 50,
      over: false,
    })
    const pct = splitCustom(100.01, ['a', 'b'], { a: 33.33, b: 33.33 }, 'percent')
    expect(pct.shares.map((s) => s.amount)).toEqual([33.33, 33.33])
    expect(pct.mine).toBe(33.35)
    expect(splitCustom(10, ['a'], { a: 11 }, 'amount').over).toBe(true)
  })
  it('sends a monthly split once its day comes, then moves to next month', () => {
    const rules = [
      { id: 'r', active: true, day: 31, next: '2027-01-31' },
      { id: 'q', active: true, day: 5, next: '2027-03-05' },
    ]
    const { due, rules: next } = dueSplits(rules, '2027-01-31')
    expect(due.map((r) => r.id)).toEqual(['r'])
    expect(next[0].next).toBe('2027-02-28')
    expect(next[1]).toBe(rules[1])
    // months away: one split, then the next from today
    const late = dueSplits([{ id: 'r', active: true, day: 1, next: '2026-06-01' }], '2026-11-15')
    expect(late.due).toHaveLength(1)
    expect(late.rules[0].next).toBe('2026-12-01')
  })
})

describe('server helpers', async () => {
  const { deviceName, inboxAddress } = await import('../src/lib/server')
  const { takeQuickLog } = await import('../src/lib/quickLog')
  it('names a device from its browser', () => {
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome on Windows')
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS')
    expect(deviceName('')).toBe('A browser')
  })
  it('puts the private token after a plus in the receipts address', () => {
    expect(inboxAddress('abc123@inbound.postmarkapp.com', 'f00d')).toBe('abc123+f00d@inbound.postmarkapp.com')
    expect(inboxAddress('', 'f00d')).toBe('')
  })
  it('reads ?log= once and clears it from the address bar', () => {
    let replaced = ''
    const got = takeQuickLog({ search: '?log=log%20%2412%20coffee&x=1', pathname: '/app/', hash: '#/budget' }, { replaceState: (_, __, url) => (replaced = url) })
    expect(got).toEqual({ type: 'expense', amount: 12, name: 'Coffee' })
    expect(replaced).toBe('/app/?x=1#/budget')
    expect(takeQuickLog({ search: '', pathname: '/', hash: '' }, { replaceState: () => {} })).toBeNull()
  })
})
