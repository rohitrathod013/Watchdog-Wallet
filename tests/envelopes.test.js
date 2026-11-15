/* Locked budgets: money set aside for one category can't pay for another. */
import { describe, expect, it } from 'vitest'
import { checkPayment, isCardMethod, setAside } from '../src/lib/envelopes'

const budgets = [
  { id: 'g', name: 'Groceries', limit: 400, spent: 150, locked: true },
  { id: 'f', name: 'Food & Dining', limit: 300, spent: 100 },
  { id: 'h', name: 'Health', limit: 200, spent: 250, locked: true }, // over its limit: nothing left to lock
]

describe('set aside', () => {
  it('locks only the unspent part of locked budgets', () => {
    const a = setAside(budgets, 1000)
    expect(a.total).toBe(250)
    expect(a.free).toBe(750)
    expect(a.rows.map((r) => r.name)).toEqual(['Groceries', 'Health'])
    expect(a.rows[1].left).toBe(0)
  })
  it('never locks more than the balance', () => {
    const a = setAside(budgets, 100)
    expect(a.total).toBe(100)
    expect(a.free).toBe(0)
  })
  it('does nothing when no budget is locked', () => {
    const a = setAside([{ id: 'x', name: 'Groceries', limit: 400, spent: 0 }], 500)
    expect(a.any).toBe(false)
    expect(a.free).toBe(500)
  })
  it('works in cents', () => {
    const a = setAside([{ id: 'g', name: 'Groceries', limit: 100.1, spent: 0.2, locked: true }], 100.3)
    expect(a.total).toBe(99.9)
    expect(a.free).toBe(0.4)
  })
})

describe('card payments', () => {
  it('a grocery payment uses the grocery budget first', () => {
    const c = checkPayment({ budgets, balance: 1000, amount: 120, category: 'Groceries' })
    expect(c.ok).toBe(true)
    expect(c.fromBudget).toBe(120)
    expect(c.fromFree).toBe(0)
  })
  it('a grocery payment bigger than the budget tops up from free money', () => {
    const c = checkPayment({ budgets, balance: 1000, amount: 300, category: 'Groceries' })
    expect(c.ok).toBe(true)
    expect(c.fromBudget).toBe(250)
    expect(c.fromFree).toBe(50)
  })
  it('a restaurant payment cannot touch the grocery money', () => {
    const c = checkPayment({ budgets, balance: 300, amount: 100, category: 'Food & Dining' })
    expect(c.ok).toBe(false)
    expect(c.free).toBe(50)
    expect(c.short).toBe(50)
    expect(c.blockedBy.map((r) => r.name)).toEqual(['Groceries'])
  })
  it('a restaurant payment within free money goes through', () => {
    expect(checkPayment({ budgets, balance: 1000, amount: 750, category: 'Food & Dining' }).ok).toBe(true)
    expect(checkPayment({ budgets, balance: 1000, amount: 750.01, category: 'Food & Dining' }).ok).toBe(false)
  })
  it('matches the category regardless of case or spaces', () => {
    expect(checkPayment({ budgets, balance: 250, amount: 200, category: ' groceries ' }).ok).toBe(true)
  })
  it('transfers can only use free money, even to buy groceries', () => {
    const c = checkPayment({ budgets, balance: 300, amount: 100, category: 'Groceries', card: false })
    expect(c.ok).toBe(false)
    expect(c.fromBudget).toBe(0)
  })
  it('anything goes when nothing is locked', () => {
    const open = budgets.map((b) => ({ ...b, locked: false }))
    const c = checkPayment({ budgets: open, balance: 300, amount: 300, category: 'Food & Dining' })
    expect(c.ok).toBe(true)
    expect(c.locked).toBe(false)
  })
})

describe('which payments are card payments', () => {
  it('counts the user’s cards, not cash, Grace’s records or Stripe top-ups', () => {
    expect(isCardMethod('Card ending 4821')).toBe(true)
    expect(isCardMethod('Cash')).toBe(false)
    expect(isCardMethod('Added by Grace')).toBe(false)
    expect(isCardMethod('Card via Stripe')).toBe(false)
    expect(isCardMethod(undefined)).toBe(false)
  })
})
