/* The Auto theme: light from sunrise to sunset where the user is, dark otherwise; Grace can switch it on. */
import { describe, expect, it } from 'vitest'
import { guessFromClock, msUntilSwitch, resolveTheme, sunTimes, themeForTime } from '../src/lib/dayTheme'
import { respond } from '../src/lib/assistant'
import { computeStats } from '../src/lib/stats'

/** Minutes after midnight on a place's own clock. */
const minutesIn = (date, timeZone) => {
  const [h, m] = date.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number)
  return h * 60 + m
}
const near = (date, timeZone, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  expect(Math.abs(minutesIn(date, timeZone) - (h * 60 + m))).toBeLessThanOrEqual(5)
}

describe('sunTimes', () => {
  // published times for these days, to within a few minutes
  it('Newark in November: sunrise 6:40, sunset 4:44 pm', () => {
    const s = sunTimes(new Date(2026, 10, 10, 12), 40.76, -74.17)
    near(s.sunrise, 'America/New_York', '06:40')
    near(s.sunset, 'America/New_York', '16:44')
  })
  it('Newark at midsummer: sunrise 5:26, sunset 8:31 pm', () => {
    const s = sunTimes(new Date(2026, 5, 21, 12), 40.76, -74.17)
    near(s.sunrise, 'America/New_York', '05:26')
    near(s.sunset, 'America/New_York', '20:31')
  })
  it('Delhi and London in November', () => {
    const d = sunTimes(new Date(2026, 10, 10, 12), 28.61, 77.21)
    near(d.sunrise, 'Asia/Kolkata', '06:38')
    near(d.sunset, 'Asia/Kolkata', '17:31')
    const l = sunTimes(new Date(2026, 10, 10, 12), 51.5, -0.12)
    near(l.sunrise, 'Europe/London', '07:13')
    near(l.sunset, 'Europe/London', '16:20')
  })
  it('knows the polar night and the midnight sun', () => {
    expect(sunTimes(new Date(2026, 11, 21, 12), 69.65, 18.96)).toEqual({ polar: 'night' })
    expect(sunTimes(new Date(2026, 5, 21, 12), 69.65, 18.96)).toEqual({ polar: 'day' })
  })
})

describe('themeForTime at a place', () => {
  // this machine's clock: the place is set so the sun's hours land at fixed local times
  const place = { lat: 0, lng: -new Date(2026, 2, 20, 12).getTimezoneOffset() / 4 }
  it('is light at midday and dark at midnight', () => {
    expect(themeForTime(new Date(2026, 2, 20, 12), place)).toBe('light')
    expect(themeForTime(new Date(2026, 2, 20, 0, 30), place)).toBe('dark')
  })
  it('falls back to 7am to 7pm with no place', () => {
    expect(themeForTime(new Date(2026, 10, 10, 18, 30), null)).toBe('light')
    expect(themeForTime(new Date(2026, 10, 10, 19, 30), null)).toBe('dark')
  })
})

describe('msUntilSwitch', () => {
  it('waits for the next sunrise or sunset, checking at least every 6 hours', () => {
    expect(msUntilSwitch(new Date(2026, 10, 10, 18, 30), null)).toBe(30 * 60 * 1000)
    expect(msUntilSwitch(new Date(2026, 10, 10, 6), null)).toBe(60 * 60 * 1000)
    expect(msUntilSwitch(new Date(2026, 10, 10, 23), null)).toBe(6 * 60 * 60 * 1000)
  })
})

describe('resolveTheme', () => {
  it('follows the sun only in auto', () => {
    expect(resolveTheme('dark', new Date(2026, 10, 10, 9), null)).toBe('dark')
    expect(resolveTheme('light', new Date(2026, 10, 10, 21), null)).toBe('light')
    expect(resolveTheme('auto', new Date(2026, 10, 10, 21), null)).toBe('dark')
  })
})

describe('guessFromClock', () => {
  it('turns the time zone offset into a rough longitude', () => {
    const g = guessFromClock(new Date(2026, 10, 10, 12))
    expect(g.lng).toBeCloseTo(-new Date(2026, 10, 10, 12).getTimezoneOffset() / 4)
    expect(g.guessed).toBe(true)
  })
})

describe('Grace and the auto theme', () => {
  const calls = []
  const app = {
    user: { first: 'R', name: 'R' },
    theme: 'light',
    themeMode: 'light',
    contacts: [],
    goals: [],
    bills: [],
    transactions: [],
    pots: [],
    budgets: [],
    switchTheme: (m) => calls.push(m),
    stats: computeStats([], []),
    period: 'month',
    currency: 'USD',
    activity: [],
  }
  it('turns on auto theme when asked', () => {
    for (const q of ['turn on auto theme', 'automatic dark mode', 'set the theme to auto', 'follow the time of day']) {
      calls.length = 0
      const r = respond(q, app, {})
      expect(r.text).toMatch(/sunset|sunrise/)
      r.run()
      expect(calls).toEqual(['auto'])
    }
  })
  it('still switches to plain dark mode', () => {
    calls.length = 0
    respond('switch to dark mode', app, {}).run()
    expect(calls).toEqual(['dark'])
  })
})
