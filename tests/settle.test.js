/* Settle up: a group's debts as the fewest payments, with everyone's net unchanged. */
import { describe, expect, it } from 'vitest'
import { capped, netBalances, settlePlan, simplify } from '../src/lib/settle'
import { systemText } from '../src/lib/social'

const req = (payer, requester, amount) => ({ payer, requester, amount })
const nets = (payments) => {
  const n = new Map()
  for (const p of payments) {
    n.set(p.to, (n.get(p.to) ?? 0) + Math.round(p.amount * 100))
    n.set(p.from, (n.get(p.from) ?? 0) - Math.round(p.amount * 100))
  }
  return n
}
const same = (a, b) => {
  const keys = new Set([...a.keys(), ...b.keys()])
  return [...keys].every((k) => (a.get(k) ?? 0) === (b.get(k) ?? 0))
}

describe('settle up', () => {
  it('a chain A→B→C becomes one payment A→C', () => {
    const plan = settlePlan([req('a', 'b', 30), req('b', 'c', 30)])
    expect(plan.after).toEqual([{ from: 'a', to: 'c', amount: 30 }])
    expect(plan.before).toBe(2)
    expect(plan.saves).toBe(1)
  })
  it('debts both ways cancel out', () => {
    expect(settlePlan([req('a', 'b', 20), req('b', 'a', 20)]).square).toBe(true)
    expect(settlePlan([req('a', 'b', 20), req('b', 'a', 5)]).after).toEqual([{ from: 'a', to: 'b', amount: 15 }])
  })
  it('a dinner and a taxi between four people', () => {
    // Bob paid dinner $120 for four: Ana, Cy and Dee owe him $30 each.
    // Ana paid the taxi $40 for four: Bob, Cy and Dee owe her $10 each.
    const debts = [req('ana', 'bob', 30), req('cy', 'bob', 30), req('dee', 'bob', 30), req('bob', 'ana', 10), req('cy', 'ana', 10), req('dee', 'ana', 10)]
    const plan = settlePlan(debts)
    // net: Bob is owed 80, Ana is square (owed 30, owes 30), Cy and Dee owe 40 each
    expect(plan.before).toBe(6)
    expect(plan.after).toEqual([
      { from: 'cy', to: 'bob', amount: 40 },
      { from: 'dee', to: 'bob', amount: 40 },
    ])
    expect(same(nets(plan.after), plan.net)).toBe(true)
    // nobody pays and gets paid in the new plan
    const payers = new Set(plan.after.map((p) => p.from))
    expect(plan.after.some((p) => payers.has(p.to))).toBe(false)
  })
  it('keeps every net position exactly, in cents, for awkward amounts', () => {
    const debts = [req('a', 'b', 33.33), req('c', 'b', 33.33), req('b', 'd', 12.01), req('d', 'a', 7.5), req('c', 'a', 0.01)]
    const plan = settlePlan(debts)
    expect(same(nets(plan.after), netBalances(debts))).toBe(true)
    expect(plan.after.every((p) => Math.abs(p.amount * 100 - Math.round(p.amount * 100)) < 1e-6)).toBe(true)
  })
  it('never needs more than one payment fewer than the people involved', () => {
    const people = ['a', 'b', 'c', 'd', 'e', 'f']
    const debts = []
    for (let i = 0; i < 30; i++) debts.push(req(people[(i * 7) % 6], people[(i * 5 + 1) % 6], ((i * 37) % 90) + 1))
    const plan = settlePlan(debts.filter((d) => d.payer !== d.requester))
    expect(plan.after.length).toBeLessThanOrEqual(people.length - 1)
    expect(same(nets(plan.after), plan.net)).toBe(true)
  })
  it('splits a payment over the 10,000 cap', () => {
    expect(capped([{ from: 'a', to: 'b', amount: 25000 }]).map((p) => p.amount)).toEqual([10000, 10000, 5000])
  })
  it('ignores self-debts and zero amounts, and is square with nothing', () => {
    expect(settlePlan([req('a', 'a', 10), req('a', 'b', 0)]).square).toBe(true)
    expect(settlePlan([]).square).toBe(true)
  })
  it('breaks ties by id, the same way the server does', () => {
    expect(simplify(new Map([['b', 1000], ['a', 1000], ['c', -1000], ['d', -1000]]))).toEqual([
      { from: 'c', to: 'a', amount: 10 },
      { from: 'd', to: 'b', amount: 10 },
    ])
  })
  it('says what happened in the group', () => {
    const nameOf = (id) => ({ bob: 'Bob Brown' })[id] ?? 'Someone'
    expect(systemText({ sender: 'bob', body: 'simplified:6:3' }, 'me', nameOf)).toBe('Bob Brown settled up the group: 6 payments became 3')
    expect(systemText({ sender: 'me', body: 'simplified:2:0' }, 'me', nameOf)).toBe('You settled up the group: everyone’s square')
  })
})
