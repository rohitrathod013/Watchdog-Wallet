/* Accounts, reconciling, credit cards, tags, claims, the tax summary, deleting by date and pausing budgets. */
import { describe, expect, it } from 'vitest'
import {
  accountBalances,
  accountFor,
  allTags,
  cardCycle,
  cardsDueSoon,
  claims,
  cleanTag,
  DEDUCTIBLE,
  inRange,
  makeAccount,
  makePause,
  makeSearch,
  matches,
  MAIN,
  pausedOn,
  reconcile,
  taxSummary,
  transferPair,
} from '../src/lib/ledger'
import { computeStats } from '../src/lib/stats'

let n = 0
const id = () => `id${++n}`
const tx = (amount, extra = {}) => ({ id: id(), name: 'x', amount, category: 'Other', status: 'Completed', date: '2026-11-10T12:00', ...extra })

describe('accounts', () => {
  const savings = makeAccount({ id: 'sav', name: 'Savings', type: 'savings', opening: 1000 })
  const card = makeAccount({ id: 'cc', name: 'Visa', type: 'credit', opening: 200, limit: 2000, closeDay: 25, dueDay: 15, cardId: 'card1' })

  it('cleans up what was typed, and a credit card starts owing', () => {
    expect(makeAccount({ id: 'x', name: '  ' })).toBeNull()
    expect(card.opening).toBe(-200)
    expect(card.limit).toBe(2000)
    expect(makeAccount({ id: 'x', name: 'Odd', type: 'weird' }).type).toBe('checking')
  })

  it('main is the whole balance minus every other account', () => {
    const list = [tx(-50, { account: 'sav' }), tx(-30.25, { account: 'cc' }), tx(-10), tx(-5, { account: 'cc', status: 'Pending' })]
    const b = accountBalances([savings, card], list, 3000)
    expect(b.sav).toBe(950)
    expect(b.cc).toBe(-230.25)
    expect(b[MAIN]).toBe(3000 - 950 + 230.25)
    expect(b.sav + b.cc + b[MAIN]).toBeCloseTo(3000, 6)
  })

  it('a move is two transactions that cancel out and never count as spending', () => {
    const pair = transferPair({ from: MAIN, to: 'sav', amount: 100, date: '2026-11-10T12:00', names: { main: 'Main', sav: 'Savings' } }, id)
    expect(pair).toHaveLength(2)
    expect(pair[0].account).toBeUndefined()
    expect(pair[1].account).toBe('sav')
    expect(pair[0].amount + pair[1].amount).toBe(0)
    expect(pair.every((x) => x.status === 'Moved')).toBe(true)
    const b = accountBalances([savings], pair, 1000)
    expect(b.sav).toBe(1100)
    expect(b[MAIN]).toBe(-100)
    const stats = computeStats(pair, [], new Date(2026, 10, 12))
    expect(stats.periods.month.expenses).toBe(0)
    expect(transferPair({ from: 'sav', to: 'sav', amount: 5 }, id)).toEqual([])
  })

  it('picks the account a payment belongs to', () => {
    const cash = makeAccount({ id: 'cash', name: 'Wallet cash', type: 'cash' })
    const accounts = [savings, card, cash]
    expect(accountFor({ accounts, cardId: 'card1' })).toBe('cc')
    expect(accountFor({ accounts, cash: true })).toBe('cash')
    expect(accountFor({ accounts, picked: 'sav', cash: true })).toBe('sav')
    expect(accountFor({ accounts, picked: MAIN, cardId: 'card1' })).toBeNull()
    expect(accountFor({ accounts, cardId: 'other' })).toBeNull()
  })
})

describe('reconciling', () => {
  const acc = makeAccount({ id: 'chk', name: 'Checking', type: 'checking', opening: 500 })
  it('compares the ticked transactions with the statement', () => {
    const list = [tx(-100, { account: 'chk', cleared: true }), tx(-40, { account: 'chk' }), tx(250, { account: 'chk', cleared: true })]
    const r = reconcile({ accounts: [acc], transactions: list, balance: 610, id: 'chk', statement: '650' })
    expect(r.balance).toBe(610)
    expect(r.cleared).toBe(650)
    expect(r.unticked).toBe(1)
    expect(r.matches).toBe(true)
    const off = reconcile({ accounts: [acc], transactions: list, balance: 610, id: 'chk', statement: 640.5 })
    expect(off.difference).toBe(-9.5)
    expect(reconcile({ accounts: [acc], transactions: list, balance: 610, id: 'chk', statement: '' }).difference).toBeNull()
  })
})

describe('credit cards', () => {
  const acc = makeAccount({ id: 'cc', name: 'Visa', type: 'credit', limit: 1000, closeDay: 20, dueDay: 31, remindDays: 3 })
  it('works out utilisation and the next close and due dates', () => {
    const now = new Date(2026, 10, 15)
    const cyc = cardCycle(acc, -250, now)
    expect(cyc.owed).toBe(250)
    expect(cyc.util).toBe(25)
    expect(cyc.level).toBe('good')
    expect(cyc.available).toBe(750)
    expect(cyc.closeIn).toBe(5)
    // November has 30 days: "the 31st" is the 30th
    expect(cyc.due.getDate()).toBe(30)
    expect(cardCycle(acc, -700, now).level).toBe('high')
  })
  it('nudges a few days before the due date, once', () => {
    const now = new Date(2026, 10, 28)
    const due = cardsDueSoon([acc], { cc: -300 }, [], now)
    expect(due).toHaveLength(1)
    expect(cardsDueSoon([acc], { cc: -300 }, [due[0].key], now)).toHaveLength(0)
    expect(cardsDueSoon([acc], { cc: 0 }, [], now)).toHaveLength(0)
    expect(cardsDueSoon([acc], { cc: -300 }, [], new Date(2026, 10, 10))).toHaveLength(0)
  })
})

describe('tags and searches', () => {
  it('cleans tags and lists them by use', () => {
    expect(cleanTag('  #Work Trip! ')).toBe('work-trip')
    expect(cleanTag('###')).toBe('')
    expect(allTags([tx(-1, { tags: ['a', 'b'] }), tx(-1, { tags: ['b'] })])).toEqual(['b', 'a'])
  })
  it('matches words, #tags and amounts', () => {
    const x = tx(-62.5, { name: 'Uber to airport', category: 'Transport', note: 'client visit', tags: ['work'] })
    expect(matches(x, 'uber #work')).toBe(true)
    expect(matches(x, 'client over:50')).toBe(true)
    expect(matches(x, 'under:50')).toBe(false)
    expect(matches(x, '#home')).toBe(false)
    expect(matches(x, '')).toBe(true)
  })
  it('needs a name and something to search for', () => {
    expect(makeSearch({ id: 's', name: 'Work', tag: 'Work' })).toEqual({ id: 's', name: 'Work', q: '', filter: 'all', tag: 'work' })
    expect(makeSearch({ id: 's', name: '', q: 'x' })).toBeNull()
    expect(makeSearch({ id: 's', name: 'Empty' })).toBeNull()
  })
})

describe('claims and tax', () => {
  it('totals what is still to be paid back', () => {
    const list = [tx(-40, { claim: { from: 'Work', status: 'open' } }), tx(-25.5, { claim: { from: 'Sam', status: 'paid' } }), tx(-9)]
    const c = claims(list)
    expect(c.open).toHaveLength(1)
    expect(c.openTotal).toBe(40)
    expect(c.paidTotal).toBe(25.5)
  })
  it('sums one year of income, tax paid and deductible spending', () => {
    const list = [
      tx(5000, { category: 'Salary', date: '2026-03-01T09:00' }),
      tx(-1200, { category: 'Taxes', date: '2026-04-15T09:00' }),
      tx(-300, { category: 'Education', tags: [DEDUCTIBLE], date: '2026-05-02T09:00' }),
      tx(-80.4, { category: 'Gifts & Donations', tags: [DEDUCTIBLE], date: '2026-12-24T09:00' }),
      tx(-99, { category: 'Education', tags: [DEDUCTIBLE], date: '2025-12-31T09:00' }),
      tx(-50, { category: 'Education', tags: [DEDUCTIBLE], status: 'Pending', date: '2026-06-02T09:00' }),
    ]
    const s = taxSummary(list, 2026)
    expect(s.incomeTotal).toBe(5000)
    expect(s.taxPaid).toBe(1200)
    expect(s.deductibleTotal).toBe(380.4)
    expect(s.deductible[0]).toEqual({ category: 'Education', amount: 300 })
    expect(s.items).toHaveLength(2)
  })
})

describe('delete by date and pausing budgets', () => {
  it('splits the transactions by date, both ends included', () => {
    const list = [tx(-1, { date: '2025-01-01T00:00' }), tx(-1, { date: '2025-06-30T23:00' }), tx(-1, { date: '2025-07-01T00:00' })]
    const { hit, keep } = inRange(list, '2025-01-01', '2025-06-30')
    expect(hit).toHaveLength(2)
    expect(keep).toHaveLength(1)
  })
  it('a pause leaves the trip out of the budgets, not out of the spending', () => {
    const pause = makePause({ from: '2026-11-05', to: '2026-11-09', ids: [] })
    expect(makePause({ from: '2026-11-09', to: '2026-11-05' })).toBeNull()
    expect(pausedOn(pause, 'food', '2026-11-07')).toBe(true)
    expect(pausedOn({ ...pause, ids: ['fun'] }, 'food', '2026-11-07')).toBe(false)
    const list = [
      tx(-100, { category: 'Food & Dining', date: '2026-11-06T12:00' }),
      tx(-40, { category: 'Food & Dining', date: '2026-11-12T12:00' }),
    ]
    const budgets = [{ id: 'food', name: 'Food & Dining', limit: 300 }]
    const now = new Date(2026, 10, 14)
    expect(computeStats(list, budgets, now).budgets[0].spent).toBe(140)
    const paused = computeStats(list, budgets, now, { pause })
    expect(paused.budgets[0].spent).toBe(40)
    expect(paused.budgets[0].pausedSpent).toBe(100)
    expect(paused.periods.month.expenses).toBe(140)
  })
})
