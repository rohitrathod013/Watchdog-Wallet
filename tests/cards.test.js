/* The user's own cards: only a name and the last 4 digits are ever kept. */
import { describe, expect, it } from 'vitest'
import { lastFour, makeCard } from '../src/lib/stats'

describe('cards', () => {
  it('keeps a name, debit or credit, the network, the last 4 digits and an optional expiry', () => {
    expect(makeCard({ id: 'c1', label: ' Everyday ', last4: '1234', network: 'visa', kind: 'credit', exp: '9/29', skin: 'ocean' })).toEqual({
      id: 'c1',
      label: 'Everyday',
      last4: '1234',
      network: 'visa',
      kind: 'credit',
      exp: '09/29',
      skin: 'ocean',
    })
  })
  it('never stores more than 4 digits, and rejects anything else', () => {
    expect(makeCard({ id: 'x', label: 'Card', last4: '4111111111111111' })).toBeNull()
    expect(makeCard({ id: 'x', label: 'Card', last4: '12' })).toBeNull()
    expect(makeCard({ id: 'x', label: '', last4: '1234' })).toBeNull()
    expect(makeCard({ id: 'x', label: 'Card', last4: '1234', exp: '13/29' })).toBeNull()
  })
  it('falls back to safe values for unknown options', () => {
    expect(makeCard({ id: 'x', label: 'Card', last4: '1234', network: 'diners', kind: 'prepaid', skin: 'gold' })).toMatchObject({
      network: 'other',
      kind: 'debit',
      skin: 'onyx',
      exp: '',
    })
  })
  it('reads the last 4 from either kind of card', () => {
    expect(lastFour({ last4: '9876' })).toBe('9876')
    expect(lastFour({ number: '5412 7534 9921 4821' })).toBe('4821')
  })
})
