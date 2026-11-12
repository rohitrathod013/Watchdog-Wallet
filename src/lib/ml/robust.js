/* ------------------------------------------------------------------
   Robust statistics: medians and the median absolute deviation (MAD)
   instead of means and standard deviations, so one huge charge can't
   hide itself by dragging the "typical" value up.
   ------------------------------------------------------------------ */

export function median(list) {
  if (!list.length) return 0
  const s = [...list].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Median absolute deviation from the median. */
export function mad(list, mid = median(list)) {
  return median(list.map((x) => Math.abs(x - mid)))
}

/**
 * Robust z-score of x against a sample: 0.6745 × (x − median) / MAD.
 * When over half the sample is identical (MAD = 0), falls back to the mean absolute
 * deviation (× 1.2533 so it's on the same scale), then to a tiny floor, so a
 * repeated price like a subscription still gives a finite, honest answer.
 */
export function robustZ(x, sample) {
  if (!sample.length) return 0
  const mid = median(sample)
  let spread = mad(sample, mid) / 0.6745
  if (!spread) spread = (sample.reduce((s, v) => s + Math.abs(v - mid), 0) / sample.length) * 1.2533
  if (!spread) spread = Math.max(Math.abs(mid) * 0.05, 0.01)
  return (x - mid) / spread
}

/** The p-th quantile (0..1) of a list, with linear interpolation. */
export function quantile(list, p) {
  if (!list.length) return 0
  const s = [...list].sort((a, b) => a - b)
  const at = (s.length - 1) * Math.min(1, Math.max(0, p))
  const lo = Math.floor(at)
  const hi = Math.ceil(at)
  return s[lo] + (s[hi] - s[lo]) * (at - lo)
}

export const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0)
