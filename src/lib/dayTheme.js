/* ------------------------------------------------------------------
   The "Auto" theme: light from sunrise to sunset where the user is,
   dark the rest of the time.

   Where: the approximate location from the visitor's internet address
   (geojs.io, free, no key, city level, no permission prompt), kept for
   a week. Without it, a rough guess from the device's time zone.
   When: sunrise and sunset worked out on the device for that place and
   day (the standard solar position formulas, as in the suncalc library).
   ------------------------------------------------------------------ */
import { THEME } from '../config'

const RAD = Math.PI / 180
const DAY_MS = 86400000
const J1970 = 2440588
const J2000 = 2451545

const toDays = (date) => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000
const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAY_MS)

/**
 * Sunrise and sunset for a day at a place.
 * → { sunrise: Date, sunset: Date } or { polar: 'day' | 'night' } when the sun doesn't rise or set.
 */
export function sunTimes(date, lat, lng) {
  const lw = RAD * -lng
  const phi = RAD * lat
  // the middle of the local day, so "today" means the user's today
  const noonish = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const d = toDays(noonish)
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI))
  const ds = 0.0009 + lw / (2 * Math.PI) + n
  const M = RAD * (357.5291 + 0.98560028 * ds)
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  const L = M + C + RAD * 102.9372 + Math.PI
  const dec = Math.asin(Math.sin(RAD * 23.4397) * Math.sin(L))
  const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
  // the sun's centre 0.833° below the horizon: refraction and the sun's own size
  const cosW = (Math.sin(RAD * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec))
  if (cosW > 1) return { polar: 'night' }
  if (cosW < -1) return { polar: 'day' }
  const w = Math.acos(cosW)
  const a = 0.0009 + (w + lw) / (2 * Math.PI) + n
  const set = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
  return { sunrise: fromJulian(noon - (set - noon)), sunset: fromJulian(set) }
}

/* ---------------- where the user is ---------------- */
const GEO_KEY = 'ww-geo'
const SUN_KEY = 'ww-sun'
const WEEK = 7 * DAY_MS

/** A rough place from the time zone alone: longitude from the UTC offset, a middling latitude. */
export function guessFromClock(now = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  const south =
    /^(Australia|Antarctica|Pacific\/Auckland|America\/(Argentina|Santiago|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima)|Africa\/(Johannesburg|Maputo|Harare|Windhoek))/.test(
      zone,
    )
  return { lat: south ? -33 : 38, lng: -now.getTimezoneOffset() / 4, city: null, guessed: true }
}

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage blocked: it's worked out again next time */
  }
}

/** The saved place, if it's fresh. */
export const savedPlace = () => {
  const geo = read(GEO_KEY)
  return geo && Date.now() - geo.at < WEEK ? geo : null
}

/** Look up the user's approximate place once a week; falls back to the time zone guess. */
export async function locate() {
  const saved = savedPlace()
  if (saved) return saved
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json')
    if (!res.ok) throw new Error(`geojs ${res.status}`)
    const g = await res.json()
    const place = { lat: Number(g.latitude), lng: Number(g.longitude), city: g.city || g.region || null, at: Date.now() }
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) throw new Error('no coordinates')
    write(GEO_KEY, place)
    return place
  } catch {
    return guessFromClock()
  }
}

/* ---------------- which theme, and when it next changes ---------------- */
const fixedHours = THEME.day ?? { from: 7, to: 19 }

/** Today's light hours at a place, as { rise, set } Dates (or a polar day/night). Falls back to THEME.day. */
export function lightHours(now = new Date(), place = null) {
  if (place) {
    const s = sunTimes(now, place.lat, place.lng)
    if (s.polar) return { polar: s.polar }
    return { rise: s.sunrise, set: s.sunset }
  }
  const at = (h) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(h), Math.round((h % 1) * 60))
  return { rise: at(fixedHours.from), set: at(fixedHours.to) }
}

/** 'light' between sunrise and sunset, 'dark' otherwise. */
export function themeForTime(now = new Date(), place = null) {
  const h = lightHours(now, place)
  if (h.polar) return h.polar === 'day' ? 'light' : 'dark'
  return now >= h.rise && now < h.set ? 'light' : 'dark'
}

/** Milliseconds until the next sunrise or sunset (at least a second, at most a few hours so it stays accurate). */
export function msUntilSwitch(now = new Date(), place = null) {
  const today = lightHours(now, place)
  const tomorrow = lightHours(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12), place)
  const next = [today.rise, today.set, tomorrow.rise].filter((d) => d && d > now).sort((a, b) => a - b)[0]
  const ms = next ? next - now : 3 * 60 * 60 * 1000
  return Math.max(1000, Math.min(ms, 6 * 60 * 60 * 1000))
}

/** The theme to show for a saved choice: 'light', 'dark' or 'auto'. */
export const resolveTheme = (mode, now = new Date(), place = savedPlace()) =>
  mode === 'auto' ? themeForTime(now, place) : mode === 'dark' ? 'dark' : 'light'

/** Keep today's sunrise and sunset for the script in index.html, so the first paint is right. */
export function rememberSun(now = new Date(), place = savedPlace()) {
  const h = lightHours(now, place)
  if (h.polar) return write(SUN_KEY, { day: now.toDateString(), polar: h.polar })
  write(SUN_KEY, { day: now.toDateString(), rise: h.rise.valueOf(), set: h.set.valueOf() })
}

/** "6:36 AM" in the user's own clock style. */
export const clockTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
