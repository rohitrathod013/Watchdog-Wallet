/* ------------------------------------------------------------------
   Error tracking with Sentry, so crashes on the live site are seen.
   Only on the published site, and only when VITE_SENTRY_DSN is set.
   It's loaded after the page so it never slows the start.
   Privacy: errors and their stack traces only. No email, IP address or
   request bodies; no session replay; digits in messages (amounts, card
   or phone numbers) are hidden; breadcrumbs keep page changes and
   clicks, not what was typed or fetched.
   ------------------------------------------------------------------ */
const DSN = import.meta.env.VITE_SENTRY_DSN || ''

const scrub = (s) => (typeof s === 'string' ? s.replace(/\d[\d,.\s]{2,}\d|\d{3,}/g, '•••') : s)

/** Remove anything personal from an event before it leaves the browser. */
export function cleanEvent(event) {
  if (!event) return event
  delete event.user
  if (event.request) {
    delete event.request.data
    delete event.request.cookies
    delete event.request.headers
  }
  if (event.message) event.message = scrub(event.message)
  for (const ex of event.exception?.values ?? []) ex.value = scrub(ex.value)
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.filter((b) => b.category === 'navigation' || b.category === 'ui.click').map((b) => ({ ...b, message: scrub(b.message) }))
  return event
}

export async function startMonitoring() {
  if (!DSN || !import.meta.env.PROD) return
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn: DSN,
    environment: 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // the noise browsers and extensions make, which isn't the app's
    ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection captured', /extension\//i, 'AbortError', 'Load failed', 'Failed to fetch'],
    beforeSend: cleanEvent,
    beforeBreadcrumb: (b) => (b.category === 'navigation' || b.category === 'ui.click' ? b : null),
  })
}
