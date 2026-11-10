/* ------------------------------------------------------------------
   The "Auto" theme: light in the daytime, dark after dark, by the
   clock on this device. The hours are THEME.day in config.js.
   ------------------------------------------------------------------ */
import { THEME } from '../config'

const DAY = THEME.day ?? { from: 7, to: 19 }

/** 'light' between DAY.from and DAY.to (local hours), 'dark' the rest of the time. */
export function themeForTime(now = new Date(), day = DAY) {
  const h = now.getHours() + now.getMinutes() / 60
  return h >= day.from && h < day.to ? 'light' : 'dark'
}

/** Milliseconds until the next switch (sunrise or nightfall on the clock), at least one second. */
export function msUntilSwitch(now = new Date(), day = DAY) {
  const next = new Date(now)
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
  const target = h < day.from ? day.from : h < day.to ? day.to : day.from + 24
  next.setHours(Math.floor(target), Math.round((target % 1) * 60), 0, 0)
  return Math.max(1000, next - now)
}

/** The theme to show for a saved choice: 'light', 'dark' or 'auto'. */
export const resolveTheme = (mode, now = new Date(), day = DAY) => (mode === 'auto' ? themeForTime(now, day) : mode === 'dark' ? 'dark' : 'light')
