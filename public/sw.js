/* Watchdog Wallet's service worker: lets the app open without a connection.
   - Pages: network first, so a new version shows straight away; the last copy when offline.
   - Built files (/assets/, hashed names, never change): cache first.
   - Icons, the manifest and Google Fonts: served from the cache, refreshed in the background.
   - Anything else (Supabase, prices, the AI) always goes to the network and is never cached,
     so account data is never stored here. */
const SHELL = 'ww-shell-v1'
const ASSETS = 'ww-assets-v1'
const KEEP = [SHELL, ASSETS]
const MAX_ASSETS = 80
const scope = new URL(self.registration.scope)
const INDEX = new URL('index.html', scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll([scope.href, new URL('manifest.webmanifest', scope).href, new URL('favicon.svg', scope).href]))
      .catch(() => null)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(scope.href, res.clone())
    return res
  } catch {
    return (await cache.match(scope.href)) || (await cache.match(INDEX)) || Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok) {
    await cache.put(request, res.clone())
    trim(ASSETS, MAX_ASSETS)
  }
  return res
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS)
  const hit = await cache.match(request)
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone())
      return res
    })
    .catch(() => null)
  return hit || (await fresh) || Response.error()
}

// the page sends the files it loaded before this worker took over (the very first visit), so they're kept too
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'warm' || !Array.isArray(event.data.urls)) return
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ASSETS)
      for (const href of event.data.urls.slice(0, 200)) {
        const url = new URL(href)
        const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
        if (!fonts && (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname))) continue
        if (await cache.match(href)) continue
        try {
          const res = await fetch(href, fonts ? { mode: 'no-cors' } : undefined)
          if (res.ok || res.type === 'opaque') await cache.put(href, res)
        } catch {
          /* offline or gone: skip */
        }
      }
      trim(ASSETS, MAX_ASSETS)
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (url.origin !== scope.origin && !fonts) return
  if (url.origin === scope.origin && !url.pathname.startsWith(scope.pathname)) return
  if (request.mode === 'navigate') event.respondWith(networkFirst(request))
  else if (url.pathname.includes('/assets/')) event.respondWith(cacheFirst(request))
  else event.respondWith(staleWhileRevalidate(request))
})
