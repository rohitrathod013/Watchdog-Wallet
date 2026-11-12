/* ------------------------------------------------------------------
   Unusual spending, found on the device from the user's own history.

   Two stages (the same pattern as Workforce Hub):
   a) Isolation Forest (100 trees, 64-point samples, fixed seed) over
      per-transaction features. It proposes candidates: anything easy
      to isolate from the rest of this account.
   b) A candidate is kept only if a robust z-score (median and MAD,
      |z| >= 3, and for amounts also at least 1.75× and $15 above the
      typical) on at least one feature confirms it against this
      account's own history for the same merchant, else the same
      category, else everything (when there are fewer than 5 samples).
   Why two stages: the forest alone flags anything rare (a one-off
   hardware shop, a 6am coffee) and its score has no unit a person can
   check. The z-score gives a plain reason ("$240 vs a typical $35")
   and stops the forest from fitting on noise.

   Alongside, three simple rules: the same charge twice within 48
   hours, a subscription price rise, and a big first payment to a
   merchant never seen before.

   Models only propose: every flag carries reasons, a confidence (a
   heuristic, not a calibrated probability) and a "show your work"
   trace. Nothing is blocked or changed.
   ------------------------------------------------------------------ */
import { fitForest, scoreRow } from './iforest.js'
import { median, robustZ } from './robust.js'
import { makeTrace } from '../trace.js'
import { money } from '../format.js'
import { t } from '../i18n.js'

export const MIN_HISTORY = 30
// stage (a) thresholds on the forest score, by sensitivity
export const SENSITIVITY = { low: 0.66, medium: 0.6, high: 0.56 }
const Z = 3
const DAY = 86400000

const parse = (iso) => {
  const [d, tm = '00:00'] = String(iso).split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, mi] = tm.split(':').map(Number)
  return new Date(y, m - 1, day, h || 0, mi || 0)
}
export const merchantKey = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Spending the models look at: completed money out, not investments and not moves between pots. */
export const eligible = (x) =>
  x &&
  x.status === 'Completed' &&
  x.amount < 0 &&
  x.category !== 'Investment' &&
  x.kind !== 'pot' &&
  !(x.category === 'Transfer' && /\bpots?\b/i.test(`${x.name} ${x.note ?? ''}`))

const clock = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

/** The 8 features per transaction, in date order. */
export function featuresOf(list) {
  const byCat = new Map()
  const byMerchant = new Map()
  for (const x of list) {
    const a = -x.amount
    if (!byCat.has(x.category)) byCat.set(x.category, [])
    byCat.get(x.category).push(a)
    const k = merchantKey(x.name)
    byMerchant.set(k, (byMerchant.get(k) ?? 0) + 1)
  }
  const catMedian = new Map([...byCat].map(([k, v]) => [k, median(v)]))
  const last = new Map()
  return list.map((x) => {
    const a = -x.amount
    const d = parse(x.date)
    const k = merchantKey(x.name)
    const since = last.has(k) ? Math.min(365, (d - last.get(k)) / DAY) : 365
    last.set(k, d)
    return [
      a,
      Math.log1p(a),
      byCat.get(x.category).length / list.length,
      byMerchant.get(k) / list.length,
      d.getHours() + d.getMinutes() / 60,
      d.getDay(),
      since,
      a / (catMedian.get(x.category) || 1),
    ]
  })
}

const SEVERITY = { high: 3, medium: 2, low: 1 }

/**
 * Find unusual spending.
 * opts: { sensitivity = 'medium', dismissed = Set of patterns ("type:merchant"), seed = 42 }
 * → { status: 'insufficient_data', needed, have } or { status: 'ok', flags, checked }
 */
export function detectAnomalies(transactions, { sensitivity = 'medium', dismissed = new Set(), seed = 42 } = {}) {
  const list = (transactions ?? []).filter(eligible).sort((a, b) => a.date.localeCompare(b.date))
  if (list.length < MIN_HISTORY) return { status: 'insufficient_data', needed: MIN_HISTORY - list.length, have: list.length }

  const X = featuresOf(list)
  const model = fitForest(X, { trees: 100, sample: 64, seed })
  const cut = SENSITIVITY[sensitivity] ?? SENSITIVITY.medium
  const amounts = list.map((x) => -x.amount)
  const keys = list.map((x) => merchantKey(x.name))
  const times = list.map((x) => parse(x.date).getTime())
  // index lists per merchant and per category, built once
  const groupBy = (keyOf) => {
    const m = new Map()
    list.forEach((x, i) => {
      const k = keyOf(x, i)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(i)
    })
    return m
  }
  const merchants = groupBy((_, i) => keys[i])
  const cats = groupBy((x) => x.category)
  // whole-account baselines (with thousands of rows, leaving one out changes nothing)
  const hours = X.map((r) => r[4])
  const hourMid = median(hours)
  const found = new Map()
  const keep = (x, flag) => {
    const was = found.get(x.id)
    if (!was || SEVERITY[flag.severity] > SEVERITY[was.severity]) found.set(x.id, { ...flag, reasons: [...flag.reasons, ...(was?.reasons ?? [])] })
    else was.reasons.push(...flag.reasons)
  }

  // ---- (a) forest proposes, (b) robust z confirms
  list.forEach((x, i) => {
    const score = scoreRow(model, X[i])
    if (score < cut) return
    const a = amounts[i]
    const merchantIdx = merchants.get(keys[i]).filter((j) => j !== i)
    const catIdx = cats.get(x.category).filter((j) => j !== i)
    const [idx, group] =
      merchantIdx.length >= 5 ? [merchantIdx, x.name] : catIdx.length >= 5 ? [catIdx, t(x.category)] : [null, t('all your spending')]
    const base = idx ? idx.map((j) => amounts[j]) : amounts
    const reasons = []
    const z = robustZ(a, base)
    const typical = median(base)
    // a practical floor too: a tight history can make $31 vs $18 a z of 3, which nobody needs to hear about
    if (z >= Z && a >= typical * 1.75 && a - typical >= 15)
      reasons.push(t('Amount {amount} vs typical {typical} for {group}', { amount: money(a), typical: money(typical), group }))
    // only computed for candidates, against the account's usual hours
    const hz = Math.abs(X[i][4] - hourMid) > 4 ? robustZ(X[i][4], hours) : 0
    if (Math.abs(hz) >= Z * 1.5)
      reasons.push(t('At {time}, outside the hours you usually spend', { time: clock(parse(x.date).getHours(), parse(x.date).getMinutes()) }))
    if (!reasons.length) return
    const severity = z >= 8 || a >= 500 ? 'high' : z >= 5 ? 'medium' : 'low'
    const confidence = Math.min(0.97, Math.max(0.5, 0.5 + (score - 0.5) * 1.5 + Math.min(Math.max(z, 0), 12) / 40))
    const history = (idx ?? list.map((_, j) => j).filter((j) => j !== i)).slice(-30).map((j) => list[j])
    keep(x, {
      type: 'outlier',
      score,
      severity,
      confidence,
      reasons,
      trace: makeTrace(
        t('Why {name} was flagged', { name: x.name }),
        t(
          'An isolation forest (100 random trees) found it easy to separate from your other spending; a robust z-score against your own history for {group} confirmed it.',
          {
            group,
          },
        ),
        [x, ...history.reverse()],
        [
          t('Forest score: {score} (flag at {cut} or more; about 0.5 is ordinary)', { score: score.toFixed(2), cut: cut.toFixed(2) }),
          t('Typical for {group}: {typical} (median of {n})', { group, typical: money(typical), n: base.length }),
          t('Robust z-score: {z} (confirm at 3 or more)', { z: z.toFixed(1) }),
        ],
        null,
        { value: a },
      ),
    })
  })

  // ---- the same charge twice within 48 hours (unless that exact price is a habit: daily coffee isn't a double charge)
  const priceCount = new Map()
  list.forEach((x, i) => priceCount.set(`${keys[i]}|${x.amount}`, (priceCount.get(`${keys[i]}|${x.amount}`) ?? 0) + 1))
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      if (times[j] - times[i] > 2 * DAY) break
      if (keys[i] === keys[j] && a.amount === b.amount && priceCount.get(`${keys[i]}|${a.amount}`) <= 3)
        keep(b, {
          type: 'duplicate',
          score: 1,
          severity: -b.amount >= 200 ? 'high' : 'medium',
          confidence: 0.9,
          reasons: [t('{amount} at {name} twice within 48 hours', { amount: money(-b.amount), name: b.name })],
          trace: makeTrace(
            t('Possible double charge'),
            t('Two charges with the same merchant and amount within 48 hours.'),
            [b, a],
            [t('Same merchant, same amount, {hours} hours apart', { hours: Math.round((parse(b.date) - parse(a.date)) / 3600000) })],
            null,
            {
              value: -b.amount,
            },
          ),
        })
    }
  }

  // ---- subscription price rises: 3+ charges in different months, steady, then up
  const byMerchant = new Map()
  list.forEach((x, i) => {
    if (!byMerchant.has(keys[i])) byMerchant.set(keys[i], [])
    byMerchant.get(keys[i]).push(x)
  })
  for (const charges of byMerchant.values()) {
    const months = new Set(charges.map((x) => x.date.slice(0, 7)))
    if (charges.length < 3 || months.size < charges.length - 1) continue
    const last = charges[charges.length - 1]
    const before = charges.slice(0, -1).map((x) => -x.amount)
    const usual = median(before)
    const steady = Math.max(...before) <= Math.min(...before) * 1.05
    if (steady && -last.amount > usual * 1.02 && -last.amount - usual >= 0.5) {
      const rise = -last.amount / usual - 1
      keep(last, {
        type: 'priceRise',
        score: 1,
        severity: rise >= 0.3 ? 'medium' : 'low',
        confidence: 0.85,
        reasons: [t('{name} went up from {from} to {to}', { name: last.name, from: money(usual), to: money(-last.amount) })],
        trace: makeTrace(
          t('Price rise'),
          t('A repeat charge that was steady, then went up.'),
          [...charges].reverse(),
          [t('Usual price: {usual}, now {now} (+{pct}%)', { usual: money(usual), now: money(-last.amount), pct: Math.round(rise * 100) })],
          null,
          {
            value: -last.amount,
          },
        ),
      })
    }
  }

  // ---- a big first payment to somewhere new (not in the first 30 days, when everything is new)
  const firstDay = parse(list[0].date)
  const overall = median(amounts)
  const seen = new Set()
  for (const x of list) {
    const k = merchantKey(x.name)
    const isNew = !seen.has(k)
    seen.add(k)
    if (!isNew || parse(x.date) - firstDay < 30 * DAY) continue
    const a = -x.amount
    if (a >= Math.max(100, overall * 3))
      keep(x, {
        type: 'newMerchant',
        score: 1,
        severity: a >= 500 ? 'high' : 'medium',
        confidence: 0.7,
        reasons: [
          t('First payment to {name}, and {amount} is over {times}× your typical payment', {
            name: x.name,
            amount: money(a),
            times: Math.floor(a / (overall || 1)),
          }),
        ],
        trace: makeTrace(
          t('New merchant, big amount'),
          t('The first payment to this merchant, compared with the median of all your spending.'),
          [x],
          [t('Typical payment: {typical} (median of {n})', { typical: money(overall), n: amounts.length })],
          null,
          {
            value: a,
          },
        ),
      })
  }

  const flags = [...found.entries()]
    .map(([txId, f]) => {
      const x = list.find((y) => y.id === txId)
      const pattern = `${f.type}:${merchantKey(x.name)}`
      return {
        key: `${f.type}:${txId}`,
        pattern,
        txId,
        tx: { id: x.id, name: x.name, amount: x.amount, date: x.date, category: x.category },
        ...f,
        score: Math.round(f.score * 100) / 100,
        confidence: Math.round(f.confidence * 100) / 100,
        reasons: [...new Set(f.reasons)],
      }
    })
    .filter((f) => !dismissed.has(f.pattern))
    .sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || b.score - a.score || b.tx.date.localeCompare(a.tx.date))
  return { status: 'ok', flags, checked: list.length }
}
