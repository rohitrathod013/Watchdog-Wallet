/* ------------------------------------------------------------------
   Opening the app without a connection.
   After each successful load or save, a copy of the signed-in account's
   data is kept on this device, so with no connection the app can show it
   (read only: saving waits until the connection is back). The copy is
   removed when the user signs out, deactivates or deletes the account.
   ------------------------------------------------------------------ */
const PREFIX = 'ww-offline-'

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
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  } catch {
    /* nothing to remove */
  }
}

/** A failed request that looks like "no connection" rather than a real error. */
export const looksOffline = (err) =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|network ?error|load failed|networkerror|fetch failed/i.test(String(err?.message ?? err ?? ''))
