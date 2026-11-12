/* ------------------------------------------------------------------
   Seeded randomness, so every model run (and every test) gives the
   same answer for the same data. mulberry32: tiny, fast, good enough
   for sampling; not for anything secret.
   ------------------------------------------------------------------ */

/** A random number generator in [0, 1), the same sequence for the same seed. */
export function rng(seed = 42) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A whole number in [lo, hi]. */
export const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))

/** One item from a list. */
export const pick = (rand, list) => list[Math.floor(rand() * list.length)]

/** About normal (mean 0, sd 1), from Box-Muller. */
export function normal(rand) {
  const u = Math.max(rand(), 1e-12)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** k different indexes from 0..n-1 (all of them, shuffled, when k >= n). */
export function sampleIndexes(rand, n, k) {
  const idx = Array.from({ length: n }, (_, i) => i)
  const take = Math.min(k, n)
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rand() * (n - i))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx.slice(0, take)
}

/** A stable seed from some text, so each account gets its own fixed sequence. */
export function seedOf(text) {
  let h = 2166136261
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619)
  return h >>> 0
}
