/* Grace knows where every feature is, however it's asked, and the button takes you there. */
import { describe, expect, it } from 'vitest'
import { respond } from '../src/lib/assistant'
import { computeStats, DEFAULT_BUDGETS } from '../src/lib/stats'

function account(extra = {}) {
  const calls = []
  const app = {
    user: { first: 'Rohit', name: 'Rohit Rathod' },
    balance: 500,
    transactions: [],
    goals: [],
    bills: [],
    contacts: [],
    pots: [],
    inPots: 0,
    unassigned: 500,
    activity: [],
    holdings: [],
    watchlist: { crypto: [], stocks: [] },
    recurring: [{ id: 'r', name: 'Rent', amount: -900, category: 'Housing', every: 'monthly', next: '2026-12-01', anchor: 1, active: true }],
    calls,
    now: new Date(2026, 10, 15, 12),
    ...extra,
  }
  for (const f of ['openModal', 'go', 'toggleBudgetLock', 'toggleBudgetRollover']) app[f] = (...args) => calls.push([f, ...args])
  app.stats = computeStats(app.transactions, DEFAULT_BUDGETS, app.now)
  app.budgets = app.stats.budgets
  return app
}

const ask = (q, extra) => {
  const app = account(extra)
  const r = respond(q, app)
  return { r, app }
}
const opens = (q) => {
  const { r, app } = ask(q)
  r.links?.[0]?.run()
  return { text: r.text, call: app.calls[0] }
}

describe('Grace knows where things are', () => {
  it.each([
    'where do I upload my bank statement',
    'how do I import my bank statement?',
    'can I upload a csv of my transactions',
    'import transactions from my bank',
    'where can i uplod my bank statment', // typos
  ])('statement import: %s', (q) => {
    const { text, call } = opens(q)
    expect(text).toMatch(/Import/)
    expect(call).toEqual(['openModal', 'import'])
  })

  it.each(['how do I set up a repeating payment', 'where do I add recurring transactions', 'how can i make my rent repeat every month'])(
    'repeating: %s',
    (q) => {
      const { text, call } = opens(q)
      expect(text).toMatch(/Repeating/)
      expect(call).toEqual(['openModal', 'recurring'])
    },
  )

  it.each(['where can I see my subscriptions', 'how do I cancel subscriptions'])('subscriptions: %s', (q) => {
    const { call } = opens(q)
    expect(call).toEqual(['go', 'dashboard', { tab: 'subscriptions' }])
  })

  it.each(['how do I add my debit card', 'where can i add a credit card', 'add a card', 'how to remove a card'])('cards: %s', (q) => {
    const { text, call } = opens(q)
    expect(text).toMatch(/last 4 digits/)
    expect(call).toEqual(['go', 'wallet'])
  })

  it.each(['where are the terms and conditions', 'show me the card terms', 'terms of service'])('terms: %s', (q) => {
    expect(opens(q).call).toEqual(['openModal', 'terms'])
  })

  it('explains locked budgets and rollover instead of acting on them', () => {
    const lock = ask('how do I lock a budget?')
    expect(lock.r.text).toMatch(/locked budget/)
    expect(lock.r.confirm).toBeUndefined()
    expect(ask('what is rollover').r.text).toMatch(/rollover/)
    expect(ask('how does carry over work?').r.confirm).toBeUndefined()
    // the command still works
    expect(ask('lock my food budget').r.confirm?.label).toBe('Lock budget')
  })

  it.each([
    ['how do I settle up with my group', /Settle up/],
    ['how do I create a group', /New group/],
    ['how can I split a bill', /Split a bill/],
    ['how do I add friends', /invite link/],
    ['where do I chat with my friends', /bottom-left/],
    ['where are my friend requests', /bell/],
  ])('friends: %s', (q, re) => {
    const { text, call } = opens(q)
    expect(text).toMatch(re)
    expect(call).toEqual(['go', 'friends'])
  })

  it.each(['how do I install the app', 'can I add it to my home screen', 'does it work offline'])('install: %s', (q) => {
    expect(ask(q).r.text).toMatch(/install/i)
  })

  it.each(['how do I scan a receipt', 'can you read a photo of my receipt'])('receipts: %s', (q) => {
    expect(ask(q).r.text).toMatch(/receipt button/)
  })

  it('a "how" question about repeats explains, it doesn’t list your rules', () => {
    expect(ask('how do I add recurring payments').r.text).toMatch(/Press \*\*Repeating\*\*/)
    expect(ask('my recurring payments').r.text).toMatch(/You have 1 repeating/)
  })
})
