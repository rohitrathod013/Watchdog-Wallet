/* ------------------------------------------------------------------
   A calendar (.ics) of bills and repeating payments, for Google
   Calendar, Apple Calendar or Outlook. Repeating payments become one
   repeating event (RRULE); bills are one event on their due day.
   The same builder is used by the calendar feed function on the server.
   ------------------------------------------------------------------ */
const FREQ = { weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }

/** Text made safe for an .ics line. */
export const icsText = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1')

/** Long lines folded at 74 characters, as the format asks. */
const fold = (line) => {
  const out = []
  let rest = line
  while (rest.length > 74) {
    out.push(rest.slice(0, 74))
    rest = ` ${rest.slice(74)}`
  }
  out.push(rest)
  return out.join('\r\n')
}

const day = (iso) => String(iso).slice(0, 10).replace(/-/g, '')
const nextDay = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1, d + 1))
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`
}
const money = (n) => `$${Math.abs(Number(n) || 0).toFixed(2)}`

/** Every bill and repeating payment as calendar events. now: when the file was made (for DTSTAMP). */
export function buildIcs({ bills = [], rules = [], name = 'Bills and subscriptions', now = new Date() }) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const events = []
  for (const r of rules) {
    if (!r.active || !(r.amount < 0) || !/^\d{4}-\d{2}-\d{2}/.test(r.next ?? '')) continue
    events.push([
      'BEGIN:VEVENT',
      `UID:repeat-${r.id}@watchdog-wallet`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(r.next)}`,
      `DTEND;VALUE=DATE:${nextDay(r.next)}`,
      `RRULE:${FREQ[r.every] ?? FREQ.monthly}`,
      `SUMMARY:${icsText(`${r.name} ${money(r.amount)}`)}`,
      `DESCRIPTION:${icsText(`${r.category ?? 'Repeating payment'} · ${money(r.amount)}`)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`${r.name} is due`)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    ])
  }
  for (const b of bills) {
    if (b.paid || !/^\d{4}-\d{2}-\d{2}/.test(b.dueDate ?? '')) continue
    events.push([
      'BEGIN:VEVENT',
      `UID:bill-${b.id}@watchdog-wallet`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(b.dueDate)}`,
      `DTEND;VALUE=DATE:${nextDay(b.dueDate)}`,
      `SUMMARY:${icsText(`${b.name} ${money(b.amount)}`)}`,
      `DESCRIPTION:${icsText(`Bill due · ${money(b.amount)}`)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`${b.name} is due`)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    ])
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Watchdog Wallet//Bills//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    ...events.flat(),
    'END:VCALENDAR',
  ]
  return { text: `${lines.map(fold).join('\r\n')}\r\n`, count: events.length }
}
