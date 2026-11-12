/* ------------------------------------------------------------------
   The evaluation behind "ML in Grace" (run with npm run eval).
   Every number here is on SYNTHETIC data made by src/lib/ml/synthetic.js
   (plus the demo's sample data for the forecast backtest). It shows the
   models behave sensibly; it is not a measure of real-world accuracy.
   ------------------------------------------------------------------ */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { syntheticAccount } from '../src/lib/ml/synthetic.js'
import { detectAnomalies } from '../src/lib/ml/anomaly.js'
import { balanceAt, forecastMonth } from '../src/lib/ml/forecast.js'
import { predict, trainModel } from '../src/lib/ml/categorize.js'
import { rng, sampleIndexes } from '../src/lib/ml/random.js'
import { median } from '../src/lib/ml/robust.js'
import * as seed from '../src/data/seed.js'

const ACCOUNTS = 30
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'n/a')
const usd = (v) => `$${Math.round(v).toLocaleString('en-US')}`
const table = (head, rows) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')

/* ---------------- anomalies ---------------- */
function anomalyEval() {
  const withIncidents = Array.from({ length: ACCOUNTS }, (_, i) => syntheticAccount({ seed: i + 1 }))
  const clean = Array.from({ length: ACCOUNTS }, (_, i) => syntheticAccount({ seed: i + 101, incidents: false }))
  const rows = []
  const byType = {}
  let missed = null
  for (const sensitivity of ['low', 'medium', 'high']) {
    let flags = 0
    let truePos = 0
    let found = 0
    let total = 0
    let foundObvious = 0
    let totalObvious = 0
    for (const a of withIncidents) {
      const r = detectAnomalies(a.transactions, { sensitivity })
      const planted = new Set(a.incidents.map((x) => x.txId))
      flags += r.flags.length
      truePos += r.flags.filter((f) => planted.has(f.txId)).length
      for (const inc of a.incidents) {
        const hit = r.flags.some((f) => f.txId === inc.txId)
        total += 1
        found += hit ? 1 : 0
        if (inc.type !== 'subtle') {
          totalObvious += 1
          foundObvious += hit ? 1 : 0
        }
        if (sensitivity === 'medium') {
          byType[inc.type] = byType[inc.type] ?? { hit: 0, n: 0 }
          byType[inc.type].n += 1
          byType[inc.type].hit += hit ? 1 : 0
          if (!hit && !missed) {
            const tx = a.transactions.find((x) => x.id === inc.txId)
            missed = { ...inc, tx, seed: a.transactions[0].id.split('-')[0] }
          }
        }
      }
    }
    const cleanFlags = clean.reduce((s, a) => s + detectAnomalies(a.transactions, { sensitivity }).flags.length, 0)
    rows.push([sensitivity, pct(truePos / flags), pct(found / total), pct(foundObvious / totalObvious), (cleanFlags / (clean.length * 6)).toFixed(2)])
  }
  return { rows, byType, missed }
}

/* ---------------- forecast backtest ---------------- */
function backtest(accounts) {
  const results = []
  for (const a of accounts) {
    const first = new Date(Math.min(...a.transactions.map((x) => new Date(x.date).getTime())))
    const last = new Date(Math.max(...a.transactions.map((x) => new Date(x.date).getTime())))
    for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const now = new Date(m.getFullYear(), m.getMonth(), 15, 12)
      const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 1)
      if (now <= new Date(first.getTime() + 14 * 86400000) || monthEnd > new Date(last.getTime() + 86400000)) continue
      const known = a.transactions.filter((x) => new Date(x.date) < now)
      const f = forecastMonth({ transactions: known, balance: balanceAt(a.transactions, a.opening, now), now })
      const actual = balanceAt(a.transactions, a.opening, monthEnd)
      results.push({ covered: actual >= f.p10 && actual <= f.p90, error: Math.abs(f.p50 - actual), rough: f.rough })
    }
  }
  const settled = results.filter((r) => !r.rough)
  return {
    n: results.length,
    coverage: results.filter((r) => r.covered).length / results.length,
    coverageSettled: settled.filter((r) => r.covered).length / settled.length,
    nSettled: settled.length,
    mae: median(results.map((r) => r.error)),
  }
}

function forecastEval() {
  const synthetic = backtest(Array.from({ length: 20 }, (_, i) => syntheticAccount({ seed: i + 201, incidents: false })))
  // the demo: its balance today, walked back through its own transactions
  const done = seed.TRANSACTIONS.filter((x) => x.status === 'Completed' && x.category !== 'Investment')
  const opening = seed.BALANCE_USD - done.reduce((s, x) => s + x.amount, 0)
  const demo = backtest([{ transactions: seed.TRANSACTIONS, opening }])
  return { synthetic, demo }
}

/* ---------------- categorizer ---------------- */
function categorizerEval() {
  const held = []
  const curve = { 0: [], 5: [], 20: [], 50: [] }
  for (let s = 1; s <= 10; s++) {
    const a = syntheticAccount({ seed: s + 300, incidents: false })
    const items = a.transactions.filter((x) => x.amount < 0)
    const order = sampleIndexes(rng(s), items.length, items.length)
    const cut = Math.floor(items.length * 0.7)
    const train = order.slice(0, cut).map((i) => items[i])
    const test = order.slice(cut).map((i) => items[i])
    const accuracy = (model) => test.filter((x) => predict(model, x.name).category === x.category).length / test.length
    // the user's own history (70%) plus the seed dictionary
    held.push(accuracy(trainModel({ transactions: train })))
    // a brand-new account: the dictionary only, then corrections, one per wrong guess, in date order
    const corrections = []
    let model = trainModel()
    curve[0].push(accuracy(model))
    for (const x of [...train].sort((p, q) => p.date.localeCompare(q.date))) {
      if (corrections.length >= 50) break
      if (predict(model, x.name).category === x.category) continue
      corrections.push({ text: x.name, to: x.category })
      model = trainModel({ corrections })
      if ([5, 20, 50].includes(corrections.length)) curve[corrections.length].push(accuracy(model))
    }
    for (const n of [5, 20, 50]) if (curve[n].length < s) curve[n].push(accuracy(model))
  }
  const avg = (l) => l.reduce((x, y) => x + y, 0) / l.length
  return { held: avg(held), curve: Object.fromEntries(Object.entries(curve).map(([k, v]) => [k, avg(v)])) }
}

export async function run() {
  const t0 = Date.now()
  const anomalies = anomalyEval()
  const forecast = forecastEval()
  const categorizer = categorizerEval()

  const md = `# Grace's on-device ML: evaluation

> **All numbers are on synthetic data** (seeded fake accounts from \`src/lib/ml/synthetic.js\`), plus the demo's sample data for one forecast backtest. They show the models behave sensibly on known, planted cases. They are **not** a measure of accuracy on real people's money, which is messier. Re-run with \`npm run eval\`.

## Anomaly detection (synthetic data)

${ACCOUNTS} accounts with 6 months of spending and 5 planted incidents each (a duplicate charge, a 10× outlier, a big first payment to a new shop, a subscription price rise, and a deliberately subtle one: about 2× a normal grocery shop). ${ACCOUNTS} clean accounts with nothing planted.

${table(['Sensitivity', 'Precision', 'Recall (all 5)', 'Recall (without the subtle one)', 'False flags per month, clean accounts'], anomalies.rows)}

Recall by incident type, medium sensitivity:

${table(
  ['Incident', 'Caught'],
  Object.entries(anomalies.byType).map(([k, v]) => [k, `${v.hit} of ${v.n} (${pct(v.hit / v.n)})`]),
)}

**A miss, on purpose:** ${anomalies.missed ? `in synthetic account ${anomalies.missed.seed}, ${anomalies.missed.note} (${usd(-anomalies.missed.tx.amount)} at ${anomalies.missed.tx.name}) was not flagged. It's unusual, but not unusual enough for the forest to propose it and a z-score of 3 to confirm it.` : 'every planted incident was found this run, including the subtle one, which is luckier than usual.'} Raising the sensitivity catches more of these at the cost of more false flags. Precision here only counts the planted incidents as true, so a genuinely odd charge that happened by chance in the synthetic data counts against it.

## Forecast backtest (synthetic data and the demo)

From the 15th of each past month, forecast the balance at the end of the month using only what was known then, and compare with what happened.

${table(
  ['Data', 'Forecasts', 'p10 to p90 coverage (target about 80%)', 'Coverage, 60+ days of history', 'Median absolute error of p50'],
  [
    [
      'Synthetic, 20 accounts',
      forecast.synthetic.n,
      pct(forecast.synthetic.coverage),
      `${pct(forecast.synthetic.coverageSettled)} (${forecast.synthetic.nSettled})`,
      usd(forecast.synthetic.mae),
    ],
    [
      'Demo sample data',
      forecast.demo.n,
      pct(forecast.demo.coverage),
      `${pct(forecast.demo.coverageSettled)} (${forecast.demo.nSettled})`,
      forecast.demo.n ? usd(forecast.demo.mae) : 'n/a',
    ],
  ],
)}

${forecast.demo.n ? 'The demo only has a short history, so it gives few backtests.' : 'The demo’s sample data spans too short a time for a backtest: each one needs two weeks of history before the 15th and the whole month after it. So the forecast is only measured on synthetic data here.'}

## Categorizer (synthetic data)

10 synthetic accounts; each one's spending split 70/30 at random.

${table(
  ['Setup', 'Accuracy on the held-out 30%'],
  [
    ['Trained on the account’s own 70% plus the seed dictionary', pct(categorizer.held)],
    ['New account: seed dictionary only', pct(categorizer.curve[0])],
    ['… after 5 corrections', pct(categorizer.curve[5])],
    ['… after 20 corrections', pct(categorizer.curve[20])],
    ['… after 50 corrections', pct(categorizer.curve[50])],
  ],
)}

Corrections are simulated as the user fixing each wrong guess in date order. Synthetic names repeat a lot, which flatters these numbers.

_Generated ${new Date().toISOString().slice(0, 10)} in ${((Date.now() - t0) / 1000).toFixed(1)}s._
`
  const out = path.resolve('docs/ml-eval.md')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, md)
  console.log(md)
  console.log(`Written to ${path.relative(process.cwd(), out)}`)
}
