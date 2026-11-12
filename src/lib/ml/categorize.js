/* ------------------------------------------------------------------
   A categorizer that learns from the user.

   Multinomial naive Bayes over the words in a transaction's name (and
   the whole name joined up, so "Trader Joe's" also counts as one
   token), with Laplace smoothing (alpha = 1):
     log P(category) + Σ log( (count(word, category) + 1) / (words in category + vocabulary size) )
   Trained only on this account's own transactions, its corrections
   (each counted 5 times, and an exact name match wins outright) and a
   small seed dictionary of common merchants (src/data/merchants.js).
   Before the model guesses, an exact name is looked up: a correction
   first, then this account's own history (if it's been the same
   category at least 80% of the time), then the dictionary.
   Retraining is cheap, so the model itself is never saved: only the
   corrections are, with the account, and the model is rebuilt on load.

   It only proposes: under 60% sure it asks instead of guessing.
   ------------------------------------------------------------------ */
import { MERCHANTS } from '../../data/merchants.js'

export const ASK_BELOW = 0.6
const CORRECTION_WEIGHT = 5
// categories that say nothing about what was bought
const SKIP = new Set(['Other', 'Other income', 'Investment'])
const STOP = new Set([
  'the',
  'and',
  'of',
  'at',
  'to',
  'for',
  'an',
  'in',
  'on',
  'my',
  'co',
  'inc',
  'llc',
  'ltd',
  'com',
  'www',
  'pos',
  'purchase',
  'payment',
  'paid',
  'spent',
  'bought',
])

const clean = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** The words of a name (no numbers or filler), plus the whole name as one token. */
export function tokens(text) {
  const words = clean(text)
    .split(' ')
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !STOP.has(w))
  return words.length ? [...words, `=${words.join('')}`] : []
}

/** The name as a key for exact matches ("Trader Joe's #552" → "trader joes"). */
export const nameKey = (text) =>
  clean(text)
    .split(' ')
    .filter((w) => w && !/^\d+$/.test(w))
    .join(' ')

/**
 * Build a model. Cheap: a few milliseconds for thousands of transactions.
 * { transactions = [], corrections = [{ text, to }], useSeed = true, alpha = 1 }
 */
export function trainModel({ transactions = [], corrections = [], useSeed = true, alpha = 1 } = {}) {
  const docs = new Map() // category → weighted document count
  const words = new Map() // category → Map(token → count)
  const totals = new Map() // category → token count
  const vocab = new Set()
  const add = (text, category, weight = 1) => {
    if (!category || SKIP.has(category)) return
    const toks = tokens(text)
    if (!toks.length) return
    docs.set(category, (docs.get(category) ?? 0) + weight)
    if (!words.has(category)) words.set(category, new Map())
    const m = words.get(category)
    for (const tok of toks) {
      m.set(tok, (m.get(tok) ?? 0) + weight)
      totals.set(category, (totals.get(category) ?? 0) + weight)
      vocab.add(tok)
    }
  }
  // exact names: from the dictionary, and from this account's history (when it's been consistent)
  const known = new Map()
  if (useSeed)
    for (const m of MERCHANTS) {
      add(m.name, m.category)
      known.set(nameKey(m.name), { category: m.category, confidence: 0.9, source: 'dictionary' })
    }
  const seen = new Map()
  for (const x of transactions) {
    add(x.name, x.category)
    if (!x.category || SKIP.has(x.category)) continue
    const k = nameKey(x.name)
    if (!seen.has(k)) seen.set(k, new Map())
    seen.get(k).set(x.category, (seen.get(k).get(x.category) ?? 0) + 1)
  }
  for (const [k, counts] of seen) {
    const total = [...counts.values()].reduce((s, v) => s + v, 0)
    const [category, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    // twice or more, and at least 80% of the time
    if (total >= 2 && n / total >= 0.8) known.set(k, { category, confidence: Math.min(0.97, n / total - 0.5 / total), source: 'history' })
  }
  const exact = new Map()
  for (const c of corrections) {
    add(c.text, c.to, CORRECTION_WEIGHT)
    exact.set(nameKey(c.text), c.to)
  }
  return { docs, words, totals, vocab, exact, known, alpha, n: [...docs.values()].reduce((s, v) => s + v, 0) }
}

/**
 * Guess a category. → { category, confidence, ask, top: [{ category, p }], because, source }
 * category is null (and ask true) when nothing in the name is known.
 */
export function predict(model, text, { threshold = ASK_BELOW } = {}) {
  const key = nameKey(text)
  if (key && model.exact.has(key)) {
    const category = model.exact.get(key)
    return { category, confidence: 0.99, ask: false, top: [{ category, p: 0.99 }], because: [], source: 'correction' }
  }
  // the same name as before (or a well-known merchant): no need to guess
  const hit = key ? model.known.get(key) : null
  if (hit)
    return {
      category: hit.category,
      confidence: hit.confidence,
      ask: hit.confidence < threshold,
      top: [{ category: hit.category, p: hit.confidence }],
      because: [],
      source: hit.source,
    }
  const toks = tokens(text).filter((tok) => model.vocab.has(tok))
  const cats = [...model.docs.keys()]
  if (!toks.length || !cats.length) return { category: null, confidence: 0, ask: true, top: [], because: [], source: 'none' }
  const V = model.vocab.size
  const logs = cats.map((c) => {
    const m = model.words.get(c)
    const total = model.totals.get(c) ?? 0
    let lp = Math.log((model.docs.get(c) + 1) / (model.n + cats.length))
    for (const tok of toks) lp += Math.log(((m.get(tok) ?? 0) + model.alpha) / (total + model.alpha * V))
    return lp
  })
  const max = Math.max(...logs)
  const exps = logs.map((l) => Math.exp(l - max))
  const sum = exps.reduce((s, v) => s + v, 0)
  const top = cats
    .map((c, i) => ({ category: c, p: exps[i] / sum }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map((x) => ({ ...x, p: Math.round(x.p * 1000) / 1000 }))
  const best = top[0]
  // the words that pointed most to the winner, for "why"
  const because = toks
    .filter((tok) => !tok.startsWith('='))
    .map((tok) => ({ word: tok, n: model.words.get(best.category).get(tok) ?? 0 }))
    .filter((w) => w.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((w) => w.word)
  return { category: best.category, confidence: best.p, ask: best.p < threshold, top, because, source: 'model' }
}

/** Past transactions like this one (same name, or mostly the same words) that aren't in this category yet. */
export function similarTo(transactions, text, category) {
  const key = nameKey(text)
  const mine = new Set(tokens(text).filter((t) => !t.startsWith('=')))
  return transactions.filter((x) => {
    if (x.category === category || x.amount > 0 || x.category === 'Investment') return false
    if (nameKey(x.name) === key) return true
    const theirs = new Set(tokens(x.name).filter((t) => !t.startsWith('=')))
    if (!mine.size || !theirs.size) return false
    const both = [...mine].filter((t) => theirs.has(t)).length
    return both / (mine.size + theirs.size - both) >= 0.6
  })
}

// a small cache: the same transactions and corrections give the same model
let last = null
/** The model for an account, rebuilt only when its transactions or corrections change. */
export function modelFor(transactions = [], corrections = []) {
  if (last && last.transactions === transactions && last.corrections === corrections) return last.model
  const model = trainModel({ transactions, corrections })
  last = { transactions, corrections, model }
  return model
}
