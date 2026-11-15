/* Net worth, the debt planner, income split and the weekly recap. */
import { describe, expect, it } from 'vitest'
import { compareMethods, makeItem, monthChange, netWorthNow, payoffPlan, withSnapshot } from '../src/lib/wealth'
import { planSplit, totalPercent } from '../src/lib/incomeSplit'
import { weekKey, weeklyRecap, weekStart } from '../src/lib/recap'

describe('net worth', () => {
  it('adds cash, goals, investments and your own assets, minus debts', () => {
    const items = [makeItem({ id: 'car', name: 'Car', kind: 'asset', amount: 8000 }), makeItem({ id: 'cc', name: 'Visa', kind: 'debt', amount: 1200.5, apr: 24, minPayment: 40 })]
    const n = netWorthNow({ balance: 1500.25, goals: [{ saved: 300 }], holdings: [{ cost: 2000 }], items })
    expect(n.owned).toBe(11800.25)
    expect(n.owed).toBe(1200.5)
    expect(n.value).toBe(10599.75)
  })
  it('rejects unusable items and keeps an APR only on debts', () => {
    expect(makeItem({ id: 'x', name: '', amount: 5 })).toBeNull()
    expect(makeItem({ id: 'x', name: 'Loan', kind: 'debt', amount: 0 })).toBeNull()
    expect(makeItem({ id: 'x', name: 'House', kind: 'asset', amount: 1, apr: 5 }).apr).toBeUndefined()
  })
  it('keeps one snapshot per month and says the change since last month', () => {
    const oct = new Date(2026, 9, 20)
    const nov = new Date(2026, 10, 15)
    let h = withSnapshot([], 1000, oct)
    h = withSnapshot(h, 1100, nov)
    h = withSnapshot(h, 1250, nov)
    expect(h).toEqual([
      { month: '2026-10', value: 1000 },
      { month: '2026-11', value: 1250 },
    ])
    expect(monthChange(h, nov)).toEqual({ from: 1000, to: 1250, change: 250 })
    expect(withSnapshot(h, 1250, nov)).toBe(h)
  })
})

describe('debt planner', () => {
  const debts = [
    { id: 'card', name: 'Credit card', kind: 'debt', amount: 3000, apr: 22, minPayment: 90 },
    { id: 'car', name: 'Car loan', kind: 'debt', amount: 6000, apr: 6, minPayment: 180 },
    { id: 'store', name: 'Store card', kind: 'debt', amount: 500, apr: 18, minPayment: 25 },
  ]
  it('avalanche pays the highest rate first; snowball the smallest balance first', () => {
    const { avalanche, snowball } = compareMethods(debts, 200)
    expect(avalanche.order[0].name).toBe('Credit card')
    expect(snowball.order[0].name).toBe('Store card')
    expect(avalanche.ok && snowball.ok).toBe(true)
  })
  it('avalanche never costs more interest, and extra money finishes sooner', () => {
    const { avalanche, snowball, saves } = compareMethods(debts, 200)
    expect(avalanche.interest).toBeLessThanOrEqual(snowball.interest)
    expect(saves).toBeGreaterThanOrEqual(0)
    expect(payoffPlan(debts, 500).months).toBeLessThan(payoffPlan(debts, 0).months)
  })
  it('a 0% debt is paid off in exactly balance ÷ payment months', () => {
    expect(payoffPlan([{ id: 'a', name: 'Friend', kind: 'debt', amount: 1000, apr: 0, minPayment: 100 }], 0)).toMatchObject({ ok: true, months: 10, interest: 0 })
  })
  it('says when the payments never cover the interest', () => {
    expect(payoffPlan([{ id: 'a', name: 'Card', kind: 'debt', amount: 10000, apr: 30, minPayment: 50 }], 0)).toMatchObject({ ok: false, stuck: true })
  })
  it('nothing to plan with no debts', () => {
    expect(payoffPlan([], 100)).toMatchObject({ ok: true, months: 0 })
  })
})

describe('income split', () => {
  const pots = [{ id: 'p1', name: 'Rent', amount: 0 }, { id: 'p2', name: 'Fun', amount: 0 }]
  const goals = [{ id: 'g1', name: 'Trip', target: 1000, saved: 950 }]
  const split = {
    on: true,
    categories: ['Salary'],
    parts: [
      { id: 'a', kind: 'pot', target: 'p1', percent: 30 },
      { id: 'b', kind: 'pot', target: 'p2', percent: 10 },
      { id: 'c', kind: 'goal', target: 'g1', percent: 20 },
    ],
  }
  it('splits salary by percentage, and a goal takes only what it still needs', () => {
    expect(planSplit(3000, 'Salary', split, pots, goals)).toEqual([
      { kind: 'pot', target: 'p1', name: 'Rent', amount: 900 },
      { kind: 'pot', target: 'p2', name: 'Fun', amount: 300 },
      { kind: 'goal', target: 'g1', name: 'Trip', amount: 50 },
    ])
  })
  it('does nothing when off, for other income, over 100%, or for pots that are gone', () => {
    expect(planSplit(3000, 'Salary', { ...split, on: false }, pots, goals)).toEqual([])
    expect(planSplit(3000, 'Freelance', split, pots, goals)).toEqual([])
    expect(planSplit(3000, 'Salary', { ...split, parts: [...split.parts, { id: 'd', kind: 'pot', target: 'p1', percent: 50 }] }, pots, goals)).toEqual([])
    expect(planSplit(1000, 'Salary', split, [], goals)).toEqual([{ kind: 'goal', target: 'g1', name: 'Trip', amount: 50 }])
    expect(totalPercent(split.parts)).toBe(60)
  })
  it('never splits more than the income, rounding down to the cent', () => {
    const parts = [1, 2, 3].map((i) => ({ id: String(i), kind: 'pot', target: 'p1', percent: 33.3 }))
    const out = planSplit(10.01, 'Salary', { on: true, categories: ['Salary'], parts }, pots, [])
    expect(out.reduce((s, x) => s + Math.round(x.amount * 100), 0)).toBeLessThanOrEqual(1001)
  })
})

describe('weekly recap', () => {
  const tx = (date, amount, category = 'Groceries', name = 'Shop') => ({ id: date + amount, name, date: `${date}T12:00`, amount, category, status: 'Completed' })
  const now = new Date(2026, 10, 16, 9) // Monday 16 Nov 2026
  it('covers last Monday to Sunday, compared with the week before', () => {
    expect(weekStart(now)).toEqual(new Date(2026, 10, 16))
    const r = weeklyRecap(
      {
        transactions: [
          tx('2026-11-09', -100),
          tx('2026-11-12', -250, 'Travel', 'Flight'),
          tx('2026-11-13', 2000, 'Salary', 'Pay'),
          tx('2026-11-15', -50, 'Groceries'),
          tx('2026-11-04', -200),
          tx('2026-11-16', -999),
          tx('2026-11-10', -500, 'Investment'),
        ],
        budgets: [{ name: 'Groceries', spent: 380, limit: 400 }, { name: 'Fun', spent: 10, limit: 100 }],
      },
      now,
    )
    expect(r.spent).toBe(400)
    expect(r.income).toBe(2000)
    expect(r.change).toBe(100)
    expect(r.top).toEqual([
      { category: 'Travel', amount: 250 },
      { category: 'Groceries', amount: 150 },
    ])
    expect(r.biggest.name).toBe('Flight')
    expect(r.nearLimit.map((b) => b.name)).toEqual(['Groceries'])
    expect(r.key).toBe('2026-W46')
  })
  it('knows the ISO week', () => {
    expect(weekKey(new Date(2026, 0, 1))).toBe('2026-W01')
    expect(weekKey(new Date(2026, 11, 31))).toBe('2026-W53')
  })
  it('an empty week says so', () => {
    expect(weeklyRecap({ transactions: [] }, now).empty).toBe(true)
  })
})
