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

describe('categorizer that learns', async () => {
  const { predict, similarTo, tokens, trainModel } = await import('../src/lib/ml/categorize')
  it('tokenises names, ignoring numbers and filler', () => {
    expect(tokens("Trader Joe's #552")).toEqual(['trader', 'joes', '=traderjoes'])
    expect(tokens('123')).toEqual([])
  })
  it('knows common merchants from the seed dictionary', () => {
    const r = predict(trainModel(), 'TRADER JOE’S #552')
    expect(r.category).toBe('Groceries')
    expect(r.ask).toBe(false)
    expect(r.confidence).toBeGreaterThan(0.6)
  })
  it('asks instead of guessing when it isn’t sure', () => {
    const r = predict(trainModel(), 'Zqx Holdings')
    expect(r.ask).toBe(true)
    expect(r.category).toBeNull()
    const vague = predict(trainModel(), 'Kitchen Store')
    if (vague.confidence < 0.6) expect(vague.ask).toBe(true)
  })
  it('a correction changes the next prediction', () => {
    const before = predict(trainModel(), 'Netflix')
    expect(before.category).toBe('Subscriptions')
    const after = predict(trainModel({ corrections: [{ text: 'Netflix', from: 'Subscriptions', to: 'Entertainment' }] }), 'Netflix')
    expect(after.category).toBe('Entertainment')
    expect(after.source).toBe('correction')
    // and it carries to a name with the same words
    const near = predict(trainModel({ corrections: [{ text: 'Rosa’s Grocery', to: 'Groceries' }] }), 'Rosas Grocery Store')
    expect(near.category).toBe('Groceries')
  })
  it('learns the user’s own habits from their history', () => {
    const tx = Array.from({ length: 6 }, (_, i) => ({ name: 'Blue Door Bistro', category: 'Food & Dining', amount: -20 - i }))
    expect(predict(trainModel({ transactions: tx }), 'Blue Door Bistro').category).toBe('Food & Dining')
  })
  it('finds similar past transactions to apply a correction to', () => {
    const tx = [
      { id: 1, name: 'Rosa’s Grocery', category: 'Other', amount: -30 },
      { id: 2, name: 'ROSAS GROCERY', category: 'Other', amount: -12 },
      { id: 3, name: 'Rosa’s Grocery', category: 'Groceries', amount: -9 },
      { id: 4, name: 'Rosa Cafe', category: 'Other', amount: -5 },
    ]
    expect(similarTo(tx, 'Rosa’s Grocery', 'Groceries').map((x) => x.id)).toEqual([1, 2])
  })
  it('is quick to retrain', () => {
    const many = []
    for (let s = 1; many.length < 5000; s++) many.push(...syntheticAccount({ seed: s }).transactions)
    const t0 = performance.now()
    const model = trainModel({ transactions: many.slice(0, 5000) })
    for (const x of many.slice(0, 500)) predict(model, x.name)
    expect(performance.now() - t0).toBeLessThan(500)
  })
})

describe('Grace and the models', async () => {
  const { respond } = await import('../src/lib/assistant')
  const { computeStats } = await import('../src/lib/stats')
  const { proactiveFlags } = await import('../src/lib/ml/grace')
  const make = (tx, extra = {}) => {
    const calls = []
    const app = {
      user: { first: 'R', name: 'R' },
      period: 'month',
      currency: 'USD',
      balance: 2500,
      unassigned: 2500,
      pots: [],
      goals: [],
      bills: [],
      contacts: [],
      activity: [],
      budgets: [],
      transactions: tx,
      stats: computeStats(tx, []),
      now: new Date(2026, 9, 31, 20),
      setFlagVerdict: (f, v) => calls.push(['verdict', f.key, v]),
      correctCategory: (c) => calls.push(['correct', c]),
      calls,
      ...extra,
    }
    return app
  }
  const acct = syntheticAccount({ seed: 1 })
  const plain = (r) => r.text.replace(/\*\*/g, '')
  it('“anything unusual?” shows the pattern check’s flags with Dismiss and Confirm, and remembers them', () => {
    const r = respond('anything unusual?', make(acct.transactions), {})
    expect(r.card.type).toBe('flags')
    expect(r.card.flags.length).toBeGreaterThan(0)
    expect(r.memory.lastFlags[0].key).toBe(r.card.flags[0].key)
  })
  it('says so when there isn’t enough history yet', () => {
    const r = respond('anything unusual?', make(acct.transactions.slice(0, 10)), {})
    expect(plain(r)).toMatch(/needs \d+ more transactions/)
  })
  it('explains a flag, takes “that’s fine”, and tells how sure it is', () => {
    const app = make(acct.transactions)
    const first = respond('anything unusual?', app, {})
    const why = respond('why did you flag that?', app, first.memory)
    expect(plain(why)).toMatch(/because/)
    expect(why.traces[0].steps.length).toBeGreaterThan(0)
    const sure = respond('how sure are you?', app, why.memory)
    expect(plain(sure)).toMatch(/% sure/)
    const fine = respond("that's fine", app, first.memory)
    fine.run()
    expect(app.calls[0]).toEqual(['verdict', first.memory.lastFlags[0].key, 'benign'])
  })
  it('“will I run out of money this month?” answers with a range and a chance', () => {
    const r = respond('will I run out of money this month?', make(acct.transactions, { now: new Date(2026, 9, 15, 12) }), {})
    expect(plain(r)).toMatch(/Most likely about \$[\d,.]+ left\. 80% chance it lands between \$[\d,.-]+ and \$[\d,.]+/)
    expect(plain(r)).toMatch(/below zero/)
    expect(r.traces[0].label).toMatch(/range/)
    expect(plain(respond('how sure are you?', make(acct.transactions), r.memory))).toMatch(/simulated months/)
  })
  it('guesses the category of typed spending, and learns from “that’s wrong, it’s …”', () => {
    const app = make(acct.transactions)
    const r = respond('I spent $30 at Trader Joes', app, {})
    expect(plain(r)).toMatch(/under Groceries/)
    expect(plain(r)).toMatch(/I guessed Groceries/)
    // once it's added, correct it
    const added = { id: 'new1', name: r.memory.lastTx.name, amount: -30, category: 'Groceries', date: '2026-10-31T19:00', status: 'Completed' }
    const after = make([added, ...acct.transactions])
    const fix = respond("that's wrong, it's dining", after, r.memory)
    expect(fix.confirm.label).toMatch(/Food & Dining/)
    fix.confirm.run()
    expect(after.calls[0][1]).toMatchObject({ ids: ['new1'], from: 'Groceries', to: 'Food & Dining' })
    expect(fix.links?.[0]?.label ?? '').toMatch(/similar past transaction/)
  })
  it('asks instead of guessing when unsure', () => {
    expect(plain(respond('I spent $30 at Zqxv Holdings', make(acct.transactions), {}))).toMatch(/wasn’t sure of the category/)
  })
  it('shows at most 2 flags when the chat opens', () => {
    expect(proactiveFlags(make(acct.transactions)).length).toBeLessThanOrEqual(2)
    const answered = Object.fromEntries(proactiveFlags(make(acct.transactions)).map((f) => [f.key, { verdict: 'problem', pattern: f.pattern }]))
    const again = proactiveFlags(make(acct.transactions, { mlVerdicts: answered }))
    expect(again.some((f) => answered[f.key])).toBe(false)
  })
})
