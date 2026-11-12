/* ------------------------------------------------------------------
   Adding friends from the phone's contacts, with the browser's Contact
   Picker. The user agrees in the app first, then the phone shows its
   own list and they pick who to share: the site never sees the rest
   of the address book, and nothing picked is saved or uploaded except
   the email used to look the person up.

   Works in Chrome on Android. Other browsers (iPhone, computers) don't
   offer it yet, so the page explains that and points to email or the
   invite link instead.
   ------------------------------------------------------------------ */
import { EMAIL_RE } from './profile'

const OK_KEY = 'ww-contacts-ok'

/** Whether this browser can open the phone's contact picker. */
export const canPickContacts = () => typeof navigator !== 'undefined' && 'contacts' in navigator && typeof navigator.contacts?.select === 'function'

/** The user said yes to sharing contacts once already (the phone still asks every time). */
export const contactsAllowed = () => {
  try {
    return localStorage.getItem(OK_KEY) === '1'
  } catch {
    return false
  }
}
export const allowContacts = () => {
  try {
    localStorage.setItem(OK_KEY, '1')
  } catch {
    /* storage blocked: they're asked again next time */
  }
}

/** Tidy picked contacts: a name, unique valid emails and phone numbers, and no empty entries. */
export function cleanContacts(raw) {
  const out = []
  for (const c of raw ?? []) {
    const emails = [...new Set((c?.email ?? []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))]
    const phones = [...new Set((c?.tel ?? []).map((p) => String(p).replace(/[^\d+]/g, '')).filter((p) => p.replace(/\D/g, '').length >= 6))]
    const name = String(c?.name?.[0] ?? '').trim() || emails[0]?.split('@')[0] || phones[0] || ''
    if (emails.length || phones.length) out.push({ name, emails, phones })
  }
  return out
}

/** Open the phone's contact picker. → [{ name, emails, phones }], [] if they picked nobody. */
export async function pickContacts() {
  const props = ['name', 'email', 'tel']
  const supported = (await navigator.contacts.getProperties?.().catch(() => null)) ?? props
  const raw = await navigator.contacts.select(
    props.filter((p) => supported.includes(p)),
    { multiple: true },
  )
  return cleanContacts(raw)
}

/** A text or email that invites someone, with the user's invite link. */
export function inviteHref(contact, url, text) {
  const body = `${text} ${url}`
  if (contact.phones[0]) return `sms:${contact.phones[0]}?&body=${encodeURIComponent(body)}`
  if (contact.emails[0]) return `mailto:${contact.emails[0]}?body=${encodeURIComponent(body)}`
  return null
}
