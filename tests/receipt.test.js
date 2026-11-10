/* Grace reading receipts and bills: picking the total, date, shop and due date out of the text. */
import { describe, expect, it } from 'vitest'
import { datesIn, parseReceipt, toNumber } from '../src/lib/receipt'

const today = new Date(2026, 10, 10)

describe('toNumber', () => {
  it('reads US and European money', () => {
    expect(toNumber('$1,234.56')).toBe(1234.56)
    expect(toNumber('1.234,56 €')).toBe(1234.56)
    expect(toNumber('42,18')).toBe(42.18)
  })
})

describe('datesIn', () => {
  it('reads the common date styles', () => {
    expect(datesIn('Date: 10/28/2026', today)).toEqual(['2026-10-28'])
    expect(datesIn('28/10/2026', today)).toEqual(['2026-10-28'])
    expect(datesIn('2026-10-28 14:02', today)).toEqual(['2026-10-28'])
    expect(datesIn('Oct 28, 2026', today)).toEqual(['2026-10-28'])
    expect(datesIn('28 October 2026', today)).toEqual(['2026-10-28'])
  })
  it('ignores things that are not dates', () => {
    expect(datesIn('Table 12/40', today)).toEqual([])
    expect(datesIn('31/02/2026', today)).toEqual([])
  })
})

describe('parseReceipt', () => {
  it('reads a restaurant receipt', () => {
    const p = parseReceipt(
      `LUIGI'S TRATTORIA
123 Main St
Tel 555-0100
Date: 10/28/2026 8:14 PM
Margherita 14.00
Tiramisu 7.50
Subtotal 21.50
Tax 1.94
Tip 4.00
TOTAL $27.44
VISA **** 4821`,
      today,
    )
    expect(p).toMatchObject({
      merchant: "LUIGI'S TRATTORIA",
      total: 27.44,
      date: '2026-10-28',
      kind: 'expense',
      category: 'Food & Dining',
      currency: 'USD',
    })
  })
  it('uses the grand total, not the subtotal', () => {
    expect(parseReceipt('Corner Mart\nSubtotal 10.00\nVAT 2.00\nGrand Total 12.00', today).total).toBe(12)
  })
  it('finds the amount on the line after the label', () => {
    expect(parseReceipt('Cafe Blue\nTotal\n$9.80', today).total).toBe(9.8)
  })
  it('spots a bill with a due date', () => {
    const p = parseReceipt(
      `City Electric Co
Statement date 11/01/2026
Account number 99812
Amount due $84.20
Due date: 11/30/2026`,
      today,
    )
    expect(p).toMatchObject({ merchant: 'City Electric Co', total: 84.2, dueDate: '2026-11-30', kind: 'bill', category: 'Bills' })
  })
  it('treats a bill that is already past due as spending', () => {
    expect(parseReceipt('Water Board\nAmount due 30.00\nDue 10/01/2026', today).kind).toBe('expense')
  })
  it('notices other currencies', () => {
    expect(parseReceipt('Boulangerie\nTOTAL 12,40 €', today)).toMatchObject({ total: 12.4, currency: 'EUR' })
  })
  it('falls back to the biggest amount when nothing says total', () => {
    expect(parseReceipt('Kiosk\nItem 2.50\nItem 3.75', today).total).toBe(3.75)
  })
  it('gives up when there is no money on it', () => {
    expect(parseReceipt('just some words\nno numbers', today)).toBeNull()
    expect(parseReceipt('', today)).toBeNull()
  })
})
