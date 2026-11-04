const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export { MONTHS }

export const money = (n, symbol = '$', dp = 2) => {
  const sign = n < 0 ? '-' : ''
  return sign + symbol + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export const whole = (n, symbol = '$') => money(n, symbol, 0)

/** +$4,500.00 / -$15.49 */
export const signed = (n) => `${n >= 0 ? '+' : '-'}${money(Math.abs(n))}`

export const compact = (n, symbol = '$') => {
  const a = Math.abs(n)
  if (a >= 1e6) return `${symbol}${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m`
  if (a >= 1e3) return `${symbol}${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return `${symbol}${Math.round(n)}`
}

const two = (n) => String(n).padStart(2, '0')

export const isoDay = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`

export const localIso = (d = new Date()) => `${isoDay(d)}T${two(d.getHours())}:${two(d.getMinutes())}`

/** Oct 27, 2026 */
export const shortDate = (iso) => {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** Oct 27 · 09:41 AM */
export const stamp = (iso) => {
  const d = new Date(iso)
  const h = d.getHours() % 12 || 12
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${two(h)}:${two(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

export const uid = () => Math.random().toString(36).slice(2, 9)

export const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/** Hand the browser a file to save. */
export const saveFile = (name, text, type = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}
