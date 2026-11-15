/* What's coming up, the subscriptions list, the forecast with repeating rules, and Grace's planning answers. */
import { describe, expect, it } from 'vitest'
import { makeRule } from '../src/lib/recurring'
import { nextDays, runsBetween, subscriptionList, upcoming } from '../src/lib/upcoming'
import { forecastMonth } from '../src/lib/ml/forecast'
import { planIntent } from '../src/lib/planIntents'
import { respond } from '../src/lib/assistant'

const rule = (o) => makeRule({ id: o.id ?? o.name, category: 'Bills', every: 'monthly', ...o })
const tx = (date, name, amount, category = 'Groceries', extra = {}) => ({ id: `${date}${name}${amount}`, name, date: `${date}T12:00`, amount, category, status: 'Completed', ...extra })

describe('what’s coming up', () => {
  const rent = rule({ name: 'Rent', amount: -900, start: '2026-12-01', category: 'Housing' })
  const gym = rule({ name: 'Gym', amount: -10, start: '2026-11-16', every: 'weekly', category: 'Fitness' })
  it('lists each run in the range, after `from` and up to `to`', () => {
    expect(runsBetween(gym, '2026-11-14', '2026-11-30')).toEqual(['2026-11-16', '2026-11-23', '2026-11-30'])
    expect(runsBetween(gym, '2026-11-16', '2026-11-22')).toEqual([])
    expect(runsBetween({ ...gym, active: false }, '2026-11-14', '2026-11-30')).toEqual([])
  })
  it('mixes rules and unpaid bills, soonest first, without doubling a bill that a rule covers', () => {
    const bills = [
      { name: 'Electricity', amount: 80, dueDate: '2026-11-20' },
      { name: 'Rent', amount: 900, dueDate: '2026-12-01' },
      { name: 'Paid one', amount: 5, dueDate: '2026-11-18', paid: true },
    ]
    const list = upcoming({ rules: [rent, gym], bills }, '2026-11-14', '2026-12-01')
    expect(list.map((x) => [x.day, x.name, x.source])).toEqual([
      ['2026-11-16', 'Gym', 'repeat'],
      ['2026-11-20', 'Electricity', 'bill'],
      ['2026-11-23', 'Gym', 'repeat'],
      ['2026-11-30', 'Gym', 'repeat'],
      ['2026-12-01', 'Rent', 'repeat'],
    ])
  })
  it('the next 7 days start today', () => {
    const app = { recurring: [rule({ name: 'Netflix', amount: -15.99, start: '2026-11-14' })], bills: [] }
    expect(nextDays(app, 7, new Date(2026, 10, 14)).map((x) => x.day)).toEqual(['2026-11-14'])
    expect(nextDays(app, 7, new Date(2026, 10, 15))).toEqual([])
  })
})

describe('subscriptions list', () => {
  const now = new Date(2026, 10, 14)
  const history = [tx('2026-09-03', 'Spotify', -9.99, 'Subscriptions', { kind: 'music' }), tx('2026-10-03', 'Spotify', -11.99, 'Subscriptions', { kind: 'music' })]
  it('includes rules and spotted repeat charges once each, with yearly cost and next date', () => {
    const rules = [rule({ name: 'Gym', amount: -40, start: '2026-11-20', category: 'Fitness' }), rule({ name: 'Salary', amount: 3000, start: '2026-11-28' })]
    const s = subscriptionList({ transactions: history, bills: [], rules, now })
    expect(s.items.map((i) => [i.name, i.source, i.next])).toEqual([
      ['Gym', 'rule', '2026-11-20'],
      // last charged Oct 3, so the next is Nov 3, already past: rolled on to Dec 3
      ['Spotify', 'spotted', '2026-12-03'],
    ])
    expect(s.items[1].rise).toEqual({ from: 9.99, to: 11.99 })
    expect(s.monthly).toBe(51.99)
    expect(s.yearly).toBe(623.88)
  })
  it('a rule replaces the spotted version, and paused ones don’t count in the totals', () => {
    const rules = [{ ...rule({ name: 'Spotify', amount: -11.99, start: '2026-12-03', category: 'Subscriptions' }), active: false }]
    const s = subscriptionList({ transactions: history, bills: [], rules, now })
    expect(s.items).toHaveLength(1)
    expect(s.items[0]).toMatchObject({ source: 'rule', active: false, next: null })
    expect(s.monthly).toBe(0)
  })
  it('weekly and yearly rules are turned into a monthly cost', () => {
    const rules = [rule({ name: 'Coffee club', amount: -12, every: 'weekly', start: '2026-11-16' }), rule({ name: 'Insurance', amount: -600, every: 'yearly', start: '2027-01-01' })]
    const s = subscriptionList({ transactions: [], rules, now })
    expect(s.items.map((i) => i.monthly)).toEqual([52, 50])
  })
})

describe('forecast with repeating rules', () => {
  const now = new Date(2026, 10, 14, 12)
  // 120 days of steady $20 everyday spending
  const history = []
  for (let k = 1; k <= 120; k++) {
    const d = new Date(2026, 10, 14 - k)
    history.push(tx(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, 'Corner shop', -20))
  }
  it('counts a rule’s runs this month from day one', () => {
    const base = forecastMonth({ transactions: history, balance: 5000, now, sims: 200 })
    const withRent = forecastMonth({ transactions: history, balance: 5000, now, sims: 200, rules: [rule({ name: 'Rent', amount: -900, start: '2026-11-25' })] })
    expect(Math.round(base.p50 - withRent.p50)).toBe(900)
    expect(withRent.scheduled.map((s) => s.source)).toEqual(['rule'])
  })
  it('counts weekly runs, ignores paused rules and runs after the month ends', () => {
    const weekly = rule({ name: 'Cleaner', amount: -50, every: 'weekly', start: '2026-11-17' })
    const f = forecastMonth({ transactions: history, balance: 5000, now, sims: 50, rules: [weekly, { ...rule({ name: 'Paused', amount: -500, start: '2026-11-20' }), active: false }, rule({ name: 'Later', amount: -500, start: '2026-12-02' })] })
    expect(f.scheduled.map((s) => s.name)).toEqual(['Cleaner', 'Cleaner'])
  })
  it('a bill on the same day as a matching rule is counted once', () => {
    const f = forecastMonth({ transactions: history, balance: 5000, now, sims: 50, rules: [rule({ name: 'Rent', amount: -900, start: '2026-11-25' })], bills: [{ name: 'Rent', amount: 900, dueDate: '2026-11-25' }] })
    expect(f.scheduled).toHaveLength(1)
  })
})

describe('Grace: locked budgets, rollover and what’s coming', () => {
  const budgets = [
    { id: 'g', name: 'Groceries', limit: 400, spent: 150, locked: true },
    { id: 'f', name: 'Food & Dining', limit: 300, spent: 100, rollover: true, baseLimit: 200, carry: 100 },
  ]
  const app = (o = {}) => ({ budgets, balance: 300, recurring: [], bills: [], transactions: [], now: new Date(2026, 10, 14), stats: {}, ...o })
  it('a dinner that would dip into the grocery money is a no', () => {
    const r = planIntent('can i spend $100 on dinner?', app())
    expect(r.text).toMatch(/Not by card/)
    expect(r.text).toMatch(/Groceries/)
    expect(r.chips[0].q).toMatch(/Unlock my Groceries budget/)
  })
  it('a smaller dinner fits in free money; groceries use their own budget', () => {
    expect(planIntent('can i spend $40 on dinner', app()).text).toMatch(/Yes, from free money/)
    expect(planIntent('can i afford $120 of groceries', app()).text).toMatch(/locked Groceries budget/)
  })
  it('without locks, or for a later date, the usual answer handles it', () => {
    expect(planIntent('can i spend $100 on dinner', app({ budgets: budgets.map((b) => ({ ...b, locked: false })) }))).toBeNull()
    expect(planIntent('can i afford $100 by march', app())).toBeNull()
  })
  it('says how much is free and what’s locked', () => {
    expect(planIntent('how much is free to spend?', app()).text).toMatch(/\$50\.00.*free to spend/)
  })
  it('locks, unlocks and turns rollover on with a confirm step', () => {
    const calls = []
    const a = app({ toggleBudgetLock: (id) => calls.push(['lock', id]), toggleBudgetRollover: (id) => calls.push(['roll', id]) })
    const lock = planIntent('lock my food budget', a)
    expect(lock.confirm.label).toBe('Lock budget')
    lock.confirm.run()
    expect(planIntent('unlock groceries', a).confirm.label).toBe('Unlock budget')
    expect(planIntent('lock my groceries budget', a).text).toMatch(/already locked/)
    planIntent('turn on rollover for groceries', a).confirm.run()
    expect(planIntent('turn on rollover for food', a).text).toMatch(/already on/)
    expect(calls).toEqual([['lock', 'f'], ['roll', 'g']])
  })
  it('says what carried over', () => {
    expect(planIntent('what carried over?', app()).text).toMatch(/\$200\.00 limit \+ \$100\.00 carried over/)
  })
  it('lists what’s coming out this week, or says there’s nothing', () => {
    const rules = [rule({ name: 'Netflix', amount: -15.99, start: '2026-11-16' }), rule({ name: 'Salary', amount: 3000, start: '2026-11-28' })]
    expect(planIntent('what’s coming out this week?'.replace('’', "'"), app({ recurring: rules })).text).toMatch(/Netflix/)
    expect(planIntent("what's coming out this week", app({ recurring: rules })).text).not.toMatch(/Salary/)
    expect(planIntent("what's coming up this month", app({ recurring: rules })).text).toMatch(/Salary/)
    expect(planIntent("what's coming out this week", app()).text).toMatch(/Nothing scheduled/)
  })
  it('is reached through the chat, ahead of the general afford answer', () => {
    const r = respond('Can I spend $100 on dinner?', { ...app(), goals: [], pots: [], contacts: [], activity: [], holdings: [], watchlist: { crypto: [], stocks: [] } })
    expect(r.text).toMatch(/Not by card/)
  })
})
