// Watchdog Wallet: stock prices for the Markets card and Grace.
//
// A Supabase Edge Function that calls Finnhub (finnhub.io) with a key kept
// on the server, so it never ships in the website. Deploy it once:
//   1. Get a free key at https://finnhub.io/register
//   2. Supabase dashboard > Edge Functions > Secrets: add FINNHUB_KEY
//   3. Edge Functions > Deploy a new function > name it "stocks", paste this file
//   4. In the function's settings, turn OFF "Verify JWT" (the site sends its
//      publishable key, which isn't a JWT)
//
//   GET /functions/v1/stocks?q=apple          search US stocks and ETFs
//   GET /functions/v1/stocks?symbols=AAPL,MSFT  quotes (up to 12)

const KEY = Deno.env.get('FINNHUB_KEY')
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// answers are cached per instance so the free limit (60 calls a minute) is never hit
const cache = new Map<string, { at: number; value: any }>()
async function finnhub(path: string, ttl: number) {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  const res = await fetch(`https://finnhub.io/api/v1${path}${path.includes('?') ? '&' : '?'}token=${KEY}`)
  if (!res.ok) throw new Error(`Finnhub ${res.status}`)
  const value = await res.json()
  cache.set(path, { at: Date.now(), value })
  return value
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!KEY) return json({ error: 'FINNHUB_KEY is not set' }, 503)
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim().slice(0, 40)
  const symbols = url.searchParams.get('symbols')
  try {
    if (q) {
      const r = await finnhub(`/search?q=${encodeURIComponent(q)}&exchange=US`, 60 * 60 * 1000)
      const results = (r.result ?? [])
        .filter((x: any) => !x.symbol.includes('.') && ['Common Stock', 'ETP', 'ADR', 'REIT'].includes(x.type))
        .slice(0, 8)
        .map((x: any) => ({ symbol: x.symbol, name: x.description, type: x.type }))
      return json({ results })
    }
    if (symbols) {
      const list = [...new Set(symbols.split(',').map((s) => s.trim().toUpperCase()))].filter((s) => /^[A-Z0-9.-]{1,12}$/.test(s)).slice(0, 12)
      const quotes = await Promise.all(
        list.map(async (symbol) => {
          const [qt, pr] = await Promise.all([
            finnhub(`/quote?symbol=${symbol}`, 60 * 1000),
            finnhub(`/stock/profile2?symbol=${symbol}`, 24 * 60 * 60 * 1000).catch(() => ({})),
          ])
          return {
            symbol,
            name: pr.name || symbol,
            currency: pr.currency || 'USD',
            price: qt.c,
            change: qt.dp ?? 0,
            high: qt.h,
            low: qt.l,
            open: qt.o,
            prev: qt.pc,
            at: qt.t,
          }
        }),
      )
      return json({ quotes: quotes.filter((x) => x.price) })
    }
    return json({ error: 'Pass ?q= to search or ?symbols= for quotes' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 502)
  }
})
