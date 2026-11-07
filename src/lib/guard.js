/* Grace's guard settings, shared by the app, the guard panel and Grace's engine.
   lock: minutes without activity before the app locks (0 = off)
   limit: payments at or above this need an extra confirm (0 = off)
   newPayee: warn before the first payment to someone
   privacy: blur the numbers when the window isn't in front */
export const DEFAULT_GUARD = { lock: 15, limit: 500, newPayee: true, privacy: false }
export const LOCK_CHOICES = [0, 1, 5, 15, 30, 60]

/** Each protection and whether it's on, in a fixed order. */
export const guardState = (guard = DEFAULT_GUARD) => [
  { key: 'lock', on: guard.lock > 0 },
  { key: 'limit', on: guard.limit > 0 },
  { key: 'newPayee', on: Boolean(guard.newPayee) },
  { key: 'privacy', on: Boolean(guard.privacy) },
]
