/* ------------------------------------------------------------------
   Opening the app without a connection.
   After each successful load or save, a copy of the signed-in account's
   data is kept on this device, so with no connection the app can show it
   (saving waits until the connection is back). Transactions added while
   offline wait in an outbox on the device and go in when the account
   loads again. The copy and the outbox are removed when the user signs
   out, deactivates or deletes the account.
   ------------------------------------------------------------------ */
const PREFIX = 'ww-offline-'
const OUTBOX = 'ww-outbox-'

/** Keep a copy of this account's data on the device. Quietly does nothing if storage is full or blocked. */
export function keepCopy(userId, data) {
  if (!userId || !data) return
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify({ at: new Date().toISOString(), data }))
  } catch {
    /* storage full or blocked: offline just won't have a copy */
  }
}

/** The copy kept for this account: { at, data }, or null. */
export function readCopy(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(PREFIX + userId)
    const copy = raw ? JSON.parse(raw) : null
    return copy?.data ? copy : null
  } catch {
    return null
  }
}

/** Remove every account copy on this device (sign out, deactivate, delete). */
export function dropCopies() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k.startsWith(OUTBOX)) localStorage.removeItem(k)
  } catch {
    /* nothing to remove */
  }
}

/** A failed request that looks like "no connection" rather than a real error. */
export const looksOffline = (err) =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|network ?error|load failed|networkerror|fetch failed/i.test(String(err?.message ?? err ?? ''))

/** A transaction added while offline: kept on the device until the account can be saved again. */
export function queueOffline(userId, row) {
  if (!userId || !row?.id) return
  try {
    const list = JSON.parse(localStorage.getItem(OUTBOX + userId) || '[]')
    localStorage.setItem(OUTBOX + userId, JSON.stringify([...list.filter((x) => x.id !== row.id), row].slice(-500)))
  } catch {
    /* storage full or blocked: it stays in this visit only */
  }
}

/** The transactions waiting to be saved for this account (and the outbox is emptied). */
export function takeOutbox(userId) {
  if (!userId) return []
  try {
    const list = JSON.parse(localStorage.getItem(OUTBOX + userId) || '[]')
    localStorage.removeItem(OUTBOX + userId)
    return Array.isArray(list) ? list.filter((x) => x && x.id && Number.isFinite(x.amount)) : []
  } catch {
    return []
  }
}
