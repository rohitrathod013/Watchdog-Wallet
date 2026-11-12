/* ------------------------------------------------------------------
   Grace's on-device ML: deterministic (fixed seeds), checked on
   synthetic accounts. See scripts/ml-eval.js for the fuller report.
   ------------------------------------------------------------------ */
import { describe, expect, it } from 'vitest'
import { int, normal, rng, sampleIndexes } from '../src/lib/ml/random'
import { mad, median, quantile, robustZ } from '../src/lib/ml/robust'
import { c, fitForest, scoreRow } from '../src/lib/ml/iforest'
import { syntheticAccount } from '../src/lib/ml/synthetic'

describe('seeded randomness', () => {
  it('repeats exactly for the same seed, and differs for another', () => {
    const a = rng(7)
    const b = rng(7)
    const x = Array.from({ length: 5 }, a)
    expect(Array.from({ length: 5 }, b)).toEqual(x)
    expect(Array.from({ length: 5 }, rng(8))).not.toEqual(x)
    expect(x.every((v) => v >= 0 && v < 1)).toBe(true)
  })
  it('helpers stay in range', () => {
    const r = rng(1)
    for (let i = 0; i < 200; i++) {
      const v = int(r, 3, 5)
      expect(v >= 3 && v <= 5).toBe(true)
    }
    expect(new Set(sampleIndexes(r, 10, 10)).size).toBe(10)
    const draws = Array.from({ length: 4000 }, () => normal(r))
    expect(Math.abs(draws.reduce((s, v) => s + v, 0) / draws.length)).toBeLessThan(0.08)
  })
})

describe('robust statistics', () => {
  it('median, MAD and quantiles', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(mad([1, 2, 3, 4, 100])).toBe(1)
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantile([0, 10], 0.1)).toBe(1)
  })
  it('one huge value can’t hide itself, and identical history stays finite', () => {
    expect(robustZ(250, [30, 35, 32, 40, 28, 36, 250])).toBeGreaterThan(10)
    expect(Number.isFinite(robustZ(22.99, [15.49, 15.49, 15.49, 15.49, 15.49]))).toBe(true)
    expect(robustZ(22.99, [15.49, 15.49, 15.49, 15.49, 15.49])).toBeGreaterThan(3)
  })
})

describe('isolation forest', () => {
  it('c(n) matches the paper', () => {
    expect(c(1)).toBe(0)
    expect(c(2)).toBe(1)
    expect(c(256)).toBeCloseTo(10.24, 1)
  })
  it('scores a point far from a tight crowd as more unusual, the same every run', () => {
    const r = rng(3)
    const rows = Array.from({ length: 300 }, () => [normal(r), normal(r)])
    const model = fitForest(rows, { trees: 100, sample: 64, seed: 42 })
    const far = scoreRow(model, [8, 8])
    const near = scoreRow(model, [0, 0])
    expect(far).toBeGreaterThan(0.65)
    expect(near).toBeLessThan(0.5)
    expect(scoreRow(fitForest(rows, { seed: 42 }), [8, 8])).toBe(far)
  })
})

describe('synthetic accounts', () => {
  it('are deterministic, realistic and labelled', () => {
    const a = syntheticAccount({ seed: 5 })
    expect(syntheticAccount({ seed: 5 })).toEqual(a)
    expect(a.transactions.length).toBeGreaterThan(250)
    expect(a.incidents.map((x) => x.type)).toEqual(['duplicate', 'outlier', 'newMerchant', 'priceRise', 'subtle'])
    for (const inc of a.incidents) expect(a.transactions.some((x) => x.id === inc.txId)).toBe(true)
    expect(syntheticAccount({ seed: 5, incidents: false }).incidents).toEqual([])
  })
})

describe('anomaly detection', async () => {
  const { detectAnomalies, eligible, MIN_HISTORY } = await import('../src/lib/ml/anomaly')
  const { traceAddsUp } = await import('../src/lib/trace')
  const quiet = (n = 60, extra = []) => {
    const out = []
    for (let i = 0; i < n; i++) {
      const d = new Date(2026, 8, 1 + Math.floor(i / 2), 12 + (i % 3), 0)
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`
      out.push({
        id: `q${i}`,
        date: day,
        name: ['Cafe', 'Market', 'Metro'][i % 3],
        amount: -[8, 40, 3][i % 3],
        category: ['Food & Dining', 'Groceries', 'Transport'][i % 3],
        status: 'Completed',
      })
    }
    return [...out, ...extra]
  }
  it('needs at least 30 transactions, and says how many more', () => {
    const r = detectAnomalies(quiet(12))
    expect(r).toEqual({ status: 'insufficient_data', needed: MIN_HISTORY - 12, have: 12 })
  })
  it('a quiet, regular history raises nothing', () => {
    expect(detectAnomalies(quiet(60)).flags).toEqual([])
  })
  it('a planted outlier is flagged with a reason, a confidence and a trace', () => {
    const r = detectAnomalies(
      quiet(60, [{ id: 'big', date: '2026-10-02T13:00', name: 'Cafe', amount: -240, category: 'Food & Dining', status: 'Completed' }]),
    )
    const f = r.flags.find((x) => x.txId === 'big')
    expect(f).toBeTruthy()
    expect(f.reasons.join(' ')).toMatch(/Amount \$240\.00 vs typical \$8\.00 for Cafe/)
    expect(f.confidence).toBeGreaterThan(0.5)
    expect(['low', 'medium', 'high']).toContain(f.severity)
    expect(f.trace.rows[0].id).toBe('big')
    expect(traceAddsUp(f.trace)).toBe(true)
  })
  it('is deterministic', () => {
    const a = syntheticAccount({ seed: 9 })
    expect(detectAnomalies(a.transactions)).toEqual(detectAnomalies(a.transactions))
  })
  it('catches the planted duplicate, 10× outlier, new merchant and price rise', () => {
    const a = syntheticAccount({ seed: 1 })
    const r = detectAnomalies(a.transactions)
    for (const inc of a.incidents.filter((i) => i.type !== 'subtle'))
      expect(
        r.flags.some((f) => f.txId === inc.txId),
        inc.type,
      ).toBe(true)
  })
  it('investments and moves between pots never produce flags', () => {
    const odd = [
      { id: 'inv', date: '2026-10-02T03:00', name: 'Bitcoin', amount: -5000, category: 'Investment', status: 'Invested' },
      { id: 'inv2', date: '2026-10-03T03:00', name: 'Apple shares', amount: -4000, category: 'Investment', status: 'Completed' },
      { id: 'pot', date: '2026-10-03T03:00', name: 'Moved to Holiday pot', amount: -3000, category: 'Transfer', status: 'Completed', kind: 'pot' },
    ]
    for (const x of odd) expect(eligible(x)).toBe(false)
    const r = detectAnomalies(quiet(60, odd))
    expect(r.flags.filter((f) => ['inv', 'inv2', 'pot'].includes(f.txId))).toEqual([])
  })
  it('dismissed patterns stop alerting', () => {
    const big = { id: 'big', date: '2026-10-02T13:00', name: 'Cafe', amount: -240, category: 'Food & Dining', status: 'Completed' }
    const r = detectAnomalies(quiet(60, [big]), { dismissed: new Set(['outlier:cafe']) })
    expect(r.flags.some((f) => f.txId === 'big')).toBe(false)
  })
  it('runs 5,000 transactions in under 500ms', () => {
    const many = []
    for (let s = 1; many.length < 5000; s++) many.push(...syntheticAccount({ seed: s }).transactions)
    const list = many.slice(0, 5000)
    const t0 = performance.now()
    const r = detectAnomalies(list)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(r.status).toBe('ok')
  })
})

describe('forecast with a range', async () => {
  const { forecastMonth, balanceAt, recurring } = await import('../src/lib/ml/forecast')
  const a = syntheticAccount({ seed: 3, incidents: false })
  const now = new Date(2026, 9, 15, 12)
  const known = a.transactions.filter((x) => new Date(x.date) < now)
  const balance = balanceAt(a.transactions, a.opening, now)
  it('orders its percentiles and is deterministic', () => {
    const f = forecastMonth({ transactions: known, balance, now })
    expect(f.p10).toBeLessThanOrEqual(f.p50)
    expect(f.p50).toBeLessThanOrEqual(f.p90)
    expect(f.p10).toBeLessThan(f.p90)
    expect(f.pBelowZero).toBeGreaterThanOrEqual(0)
    expect(f.rough).toBe(false)
    expect(forecastMonth({ transactions: known, balance, now })).toEqual(f)
    expect(f.trace.value).toBe(f.p50)
  })
  it('spots pay, rent and subscriptions as repeat items', () => {
    const names = recurring(known, now).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['Northwind Payroll', 'Oakwood Apartments', 'Spotify']))
  })
  it('widens the band and says “rough” with under 60 days of history', () => {
    const full = forecastMonth({ transactions: known, balance, now })
    const short = known.filter((x) => new Date(x.date) >= new Date(2026, 8, 1))
    const brief = forecastMonth({ transactions: short, balance, now })
    expect(brief.rough).toBe(true)
    expect(brief.p90 - brief.p10).toBeGreaterThan(full.p90 - full.p10)
  })
  it('counts unpaid bills, and warns when the balance could dip below zero', () => {
    const tight = forecastMonth({
      transactions: known,
      balance: 200,
      bills: [{ name: 'Car repair', amount: 600, dueDate: '2026-10-20', paid: false }],
      now,
    })
    expect(tight.scheduled.map((s) => s.name)).toContain('Car repair')
    expect(tight.pBelowZero).toBeGreaterThan(0.5)
    expect(tight.dipDay).toBeGreaterThanOrEqual(16)
  })
  it('an empty account gives its balance back, with no spread', () => {
    const f = forecastMonth({ transactions: [], balance: 0, now })
    expect([f.p10, f.p50, f.p90]).toEqual([0, 0, 0])
    expect(f.pBelowZero).toBe(0)
  })
})
