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
