/* Grace's LLM fallback: only for questions her rules don't know, with a short, number-safe account summary. */
import { describe, expect, it } from 'vitest'
import { financeBrief } from '../src/lib/llm'
import { respond } from '../src/lib/assistant'
import { computeStats } from '../src/lib/stats'

const app = {
  user: { first: 'R', name: 'R' },
  theme: 'light',
  themeMode: 'light',
  balance: 4210.5,
  currency: 'USD',
  contacts: [],
  goals: [{ id: 'g1', name: 'Emergency Fund', saved: 7200, target: 10000, due: 'Jun 2027' }],
  bills: [
    { id: 'b1', name: 'Rent', amount: 1850, due: 'Nov 1', paid: true },
    { id: 'b2', name: 'Electricity', amount: 96.4, due: 'Nov 4', paid: false },
  ],
  pots: [{ id: 'p1', name: 'Rent', amount: 1850 }],
  budgets: [],
  transactions: [{ id: 't1', name: 'Card 4111222233334444 Cafe', amount: -12.5, category: 'Dining', date: '2026-11-10' }],
  stats: computeStats([], []),
  period: 'month',
  activity: [],
}

describe('financeBrief', () => {
  const b = financeBrief(app)
  it('sums up the account in plain lines', () => {
    expect(b).toContain('Balance: $4,210.5')
    expect(b).toContain('Emergency Fund $7,200 of $10,000 by Jun 2027')
    expect(b).toContain('Unpaid bills: Electricity $96.4 due Nov 4')
    expect(b).not.toContain('Rent $1,850 due')
  })
  it('never passes long numbers on', () => {
    expect(b).not.toMatch(/\d{5,}/)
    expect(b).toContain('Card •••• Cafe')
  })
  it('is empty without an app', () => expect(financeBrief(null)).toBe(''))
})

describe('the fallback flag', () => {
  it('is set only when no rule matched', () => {
    expect(respond('what is the meaning of a roth ira in simple words for my cousin', app, {}).fallback).toBe(true)
    expect(respond('what’s my balance?', app, {}).fallback).toBeUndefined()
    expect(respond('switch to dark mode', app, {}).fallback).toBeUndefined()
  })
})
