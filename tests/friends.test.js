/* Friends: splitting a bill fairly, and working out who owes whom. */
import { describe, expect, it } from 'vitest'
import { shapeSocial, splitEqually } from '../src/lib/social'

describe('splitEqually', () => {
  it('splits a bill between me and two friends', () => {
    expect(splitEqually(90, ['b', 'c'], true)).toEqual({
      shares: [
        { friend: 'b', amount: 30 },
        { friend: 'c', amount: 30 },
      ],
      mine: 30,
    })
  })
  it('gives leftover cents to me, so friends never pay more than an even share', () => {
    const { shares, mine } = splitEqually(100, ['b', 'c'], true)
    expect(shares.map((s) => s.amount)).toEqual([33.33, 33.33])
    expect(mine).toBe(33.34)
    expect(Math.round((shares.reduce((s, x) => s + x.amount, 0) + mine) * 100)).toBe(10000)
  })
  it('splits only between friends when I leave myself out', () => {
    const { shares, mine } = splitEqually(10, ['b', 'c', 'd'], false)
    expect(mine).toBe(0)
    expect(shares.map((s) => s.amount)).toEqual([3.34, 3.33, 3.33])
  })
  it('asks nobody for nothing', () => {
    expect(splitEqually(0, ['b'], true).shares).toEqual([])
    expect(splitEqually(50, [], false).shares).toEqual([])
  })
})

describe('shapeSocial', () => {
  const me = 'me'
  const data = {
    profiles: [
      { id: me, name: 'Me', email: 'me@x.com', invite_code: 'abc' },
      { id: 'bob', name: 'Bob Brown', email: 'bob@x.com' },
      { id: 'cara', name: '', email: 'cara@x.com' },
    ],
    connections: [
      { id: 'c1', requester: me, addressee: 'bob', status: 'accepted', created_at: '2026-11-01T10:00:00Z' },
      { id: 'c2', requester: 'cara', addressee: me, status: 'pending', created_at: '2026-11-02T10:00:00Z' },
    ],
    messages: [
      { id: 'm1', sender: 'bob', recipient: me, kind: 'text', body: 'hi', created_at: '2026-11-03T10:00:00Z', read_at: null },
      { id: 'm2', sender: me, recipient: 'bob', kind: 'text', body: 'hey', created_at: '2026-11-03T11:00:00Z', read_at: null },
    ],
    requests: [
      { id: 'r1', requester: me, payer: 'bob', amount: '30.00', status: 'pending' },
      { id: 'r2', requester: 'bob', payer: me, amount: '12.50', status: 'pending' },
      { id: 'r3', requester: me, payer: 'bob', amount: '99.00', status: 'paid' },
    ],
    splits: [],
    transfers: [],
  }
  const s = shapeSocial(me, data)

  it('lists friends and requests the right way round', () => {
    const bob = s.friends.find((f) => f.id === 'bob')
    const cara = s.friends.find((f) => f.id === 'cara')
    expect(bob.status).toBe('friend')
    expect(cara.status).toBe('incoming')
    expect(cara.name).toBe('cara')
  })
  it('counts only open requests in what is owed', () => {
    const bob = s.friends.find((f) => f.id === 'bob')
    expect(bob.owesMe).toBe(30)
    expect(bob.iOwe).toBe(12.5)
    expect(s.toPay.map((r) => r.id)).toEqual(['r2'])
    expect(s.waiting.map((r) => r.id)).toEqual(['r1'])
  })
  it('counts unread messages to me and friend requests for the badge', () => {
    expect(s.friends.find((f) => f.id === 'bob').unread).toBe(1)
    expect(s.unread).toBe(2)
  })
  it('keeps the latest message for the list preview', () => {
    expect(s.friends.find((f) => f.id === 'bob').last.id).toBe('m2')
  })
})
