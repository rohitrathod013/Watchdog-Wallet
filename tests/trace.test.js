/* The trace helper: sums in whole cents, an honest empty case, CSV export. */
import { describe, expect, it } from 'vitest'
import { fromCents, makeTrace, periodOf, sumCents, toCents, traceAddsUp, traceCsv } from '../src/lib/trace'

const rows = [
  { id: 'a', date: '2026-11-03T12:30', name: 'Cafe', amount: -0.1 },
  { id: 'b', date: '2026-11-04', name: 'Deli, "Joe\'s"', amount: -0.2 },
  { id: 'c', date: '2026-11-05', name: 'Market', amount: -187.1 },
]

describe('cents', () => {
  it('adds without floating point drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(fromCents(sumCents([{ amount: 0.1 }, { amount: 0.2 }]))).toBe(0.3)
    expect(toCents(19.999)).toBe(2000)
  })
})

describe('makeTrace', () => {
  it('states exactly the sum of its rows', () => {
    const tr = makeTrace('Food spending', 'sum', rows, ['3 matched'], periodOf({ from: new Date(2026, 10, 3), to: new Date(2026, 10, 10) }), {
      sign: -1,
    })
    expect(tr.value).toBe(187.4)
    expect(tr.period).toEqual({ from: '2026-11-03', to: '2026-11-09' })
    expect(tr.rows[0]).toEqual({ id: 'a', date: '2026-11-03', description: 'Cafe', amount: -0.1 })
    expect(traceAddsUp(tr)).toBe(true)
  })
  it('says $0 and why when nothing matched, instead of inventing a number', () => {
    const tr = makeTrace('Pets spending', 'sum', [], ['should not show'], null, { sign: -1 })
    expect(tr.value).toBe(0)
    expect(tr.rows).toEqual([])
    expect(tr.steps.join(' ')).toMatch(/No transactions matched/)
    expect(traceAddsUp(tr)).toBe(true)
  })
  it('can carry a stated value that isn’t a plain sum (a forecast), without claiming it is', () => {
    const tr = makeTrace('Forecast', 'balance minus bills', rows, ['steps'], null, { value: 1234.5 })
    expect(tr.sum).toBe(false)
    expect(tr.value).toBe(1234.5)
    expect(traceAddsUp(tr)).toBe(true)
  })
})

describe('traceCsv', () => {
  it('quotes awkward text and ends with the total', () => {
    const csv = traceCsv(makeTrace('x', 'y', rows, [], null, { sign: -1 }))
    const lines = csv.split('\n')
    expect(lines[0]).toBe('date,description,amount,currency')
    expect(lines[2]).toBe('2026-11-04,"Deli, ""Joe\'s""",-0.20,USD')
    expect(lines.at(-1)).toBe(',Total,187.40,USD')
  })
})
