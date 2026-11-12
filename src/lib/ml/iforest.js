/* ------------------------------------------------------------------
   Isolation Forest (Liu, Ting and Zhou, 2008), small and readable.

   Idea: pick a random feature and a random split between its min and
   max, again and again, until each point is alone. Unusual points sit
   far from the crowd, so they're isolated after few splits. Average
   the depth over many random trees and turn it into a score:
     score = 2^(−E[depth] / c(n))
   about 0.5 is ordinary, close to 1 is easy to isolate (unusual).
   c(n) is the average depth of an unsuccessful search in a binary
   search tree of n points, so scores are comparable across sizes.
   ------------------------------------------------------------------ */
import { rng, sampleIndexes } from './random.js'

const EULER = 0.5772156649
/** Average path length of an unsuccessful binary search tree lookup among n points. */
export const c = (n) => (n <= 1 ? 0 : n === 2 ? 1 : 2 * (Math.log(n - 1) + EULER) - (2 * (n - 1)) / n)

function grow(rows, depth, limit, rand) {
  if (depth >= limit || rows.length <= 1) return { size: rows.length }
  // only features that still vary can split
  const width = rows[0].length
  const usable = []
  for (let f = 0; f < width; f++) {
    let lo = Infinity
    let hi = -Infinity
    for (const r of rows) {
      if (r[f] < lo) lo = r[f]
      if (r[f] > hi) hi = r[f]
    }
    if (hi > lo) usable.push([f, lo, hi])
  }
  if (!usable.length) return { size: rows.length }
  const [f, lo, hi] = usable[Math.floor(rand() * usable.length)]
  const at = lo + rand() * (hi - lo)
  const left = []
  const right = []
  for (const r of rows) (r[f] < at ? left : right).push(r)
  return { f, at, left: grow(left, depth + 1, limit, rand), right: grow(right, depth + 1, limit, rand) }
}

function depthOf(x, node, depth = 0) {
  while (node.left) {
    node = x[node.f] < node.at ? node.left : node.right
    depth += 1
  }
  return depth + c(node.size)
}

/**
 * Fit a forest on rows of numbers (each row the same length).
 * opts: { trees = 100, sample = 64, seed = 42 }
 */
export function fitForest(rows, { trees = 100, sample = 64, seed = 42 } = {}) {
  const rand = rng(seed)
  const size = Math.min(sample, rows.length)
  const limit = Math.ceil(Math.log2(Math.max(2, size)))
  const forest = []
  for (let k = 0; k < trees; k++)
    forest.push(
      grow(
        sampleIndexes(rand, rows.length, size).map((i) => rows[i]),
        0,
        limit,
        rand,
      ),
    )
  return { forest, size }
}

/** The anomaly score of one row: about 0.5 ordinary, towards 1 unusual. */
export function scoreRow(model, x) {
  if (!model.forest.length || model.size < 2) return 0.5
  const avg = model.forest.reduce((s, tree) => s + depthOf(x, tree), 0) / model.forest.length
  return 2 ** (-avg / c(model.size))
}
