/* ------------------------------------------------------------------
   Live data from free, key-free public APIs. Nothing here needs a
   secret, so it's safe to call straight from the browser.

   - Frankfurter (api.frankfurter.dev): exchange rates from the European
     Central Bank, updated once each working day
   - CoinGecko (api.coingecko.com): crypto prices and 24-hour change
   - Nager.Date (date.nager.at): public holidays by country

   Every answer is cached (in memory and in localStorage) so the free
   limits are never hit: rates for 6 hours, crypto for 2 minutes,
   holidays for a week.
   ------------------------------------------------------------------ */
import { CURRENCIES } from '../data/seed'
import { SUPABASE } from '../config'

const MIN = 60 * 1000
const memo = new Map()

const store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(`ww-live:${key}`))
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`ww-live:${key}`, JSON.stringify(value))
    } catch {
      /* private mode or storage full: the memory cache still works */
    }
  },
}

/** A cached value, or null when it's older than `ttl` (or missing). */
export function cached(key, ttl = Infinity) {
  const hit = memo.get(key) ?? store.get(key)
  return hit && Date.now() - hit.at < ttl ? hit.value : null
}

async function getJSON(key, url, ttl) {
  const fresh = cached(key, ttl)
  if (fresh) return fresh
  let res = await fetch(url, { headers: { Accept: 'application/json' } })
  // free tiers rate-limit bursts; wait a moment and try once more
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500))
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  }
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
  const value = await res.json()
  const hit = { at: Date.now(), value }
  memo.set(key, hit)
  store.set(key, hit)
  return value
}

/* ---------------- exchange rates ---------------- */
export const CURRENCY_WORDS = [
  ['USD', /\b(usd|us dollars?|bucks)\b|(?<!(canadian|australian|singapore|zealand|kong) )\bdollars?\b|\$/],
  ['EUR', /\b(eur|euros?)\b|€/],
  ['GBP', /\b(gbp|pounds?|sterling|quid)\b|£/],
  ['JPY', /\b(jpy|yen)\b|¥/],
  ['INR', /\b(inr|rupees?|rs)\b|₹/],
  ['CAD', /\b(cad|canadian dollars?)\b/],
  ['AUD', /\b(aud|australian dollars?)\b/],
  ['CHF', /\b(chf|swiss francs?|francs?)\b/],
  ['CNY', /\b(cny|yuan|renminbi|rmb)\b/],
  ['SGD', /\b(sgd|singapore dollars?)\b/],
  ['MXN', /\b(mxn|pesos?)\b/],
  ['SEK', /\b(sek|kronor|swedish krona)\b/],
  ['NZD', /\b(nzd|new zealand dollars?)\b/],
  ['HKD', /\b(hkd|hong kong dollars?)\b/],
  ['KRW', /\b(krw|korean won)\b/],
  ['BRL', /\b(brl|reais|brazilian real)\b/],
  ['ZAR', /\b(zar|rand)\b/],
  ['TRY', /\b(turkish lira|lira)\b/],
]

/** Latest rates against USD: { date, rates: { EUR: 0.9, … } } */
export const loadRates = () =>
  getJSON('rates', 'https://api.frankfurter.dev/v1/latest?base=USD', 6 * 60 * MIN).then((r) => (r ? { ...r, rates: { ...r.rates, USD: 1 } } : null))

/** Put live rates into the currency switcher. */
export function applyRates(rates) {
  for (const code of Object.keys(CURRENCIES)) if (rates?.[code]) CURRENCIES[code].rate = rates[code]
}

/* ---------------- crypto ---------------- */
export const COINS = [
  ['bitcoin', 'Bitcoin', 'BTC', /\b(bitcoin|btc)\b/],
  ['ethereum', 'Ethereum', 'ETH', /\b(ethereum|ether|eth)\b/],
  ['solana', 'Solana', 'SOL', /\b(solana|sol)\b/],
  ['ripple', 'XRP', 'XRP', /\b(xrp|ripple)\b/],
  ['dogecoin', 'Dogecoin', 'DOGE', /\b(dogecoin|doge)\b/],
  ['cardano', 'Cardano', 'ADA', /\b(cardano|ada)\b/],
  ['litecoin', 'Litecoin', 'LTC', /\b(litecoin|ltc)\b/],
  ['binancecoin', 'BNB', 'BNB', /\b(bnb|binance coin)\b/],
  ['tether', 'Tether', 'USDT', /\b(tether|usdt)\b/],
  ['tron', 'TRON', 'TRX', /\b(tron|trx)\b/],
]

/** Prices for the given CoinGecko ids, in USD, EUR, GBP and JPY. */
export function loadCoins(ids) {
  const list = [...ids].sort().join(',')
  return getJSON(
    `coins:${list}`,
    `https://api.coingecko.com/api/v3/simple/price?ids=${list}&vs_currencies=usd,eur,gbp,jpy&include_24hr_change=true`,
    2 * MIN,
  )
}

/** Market data for the dashboard card: price, 24h change and a 7-day trend line, in one currency. */
export async function loadMarkets(ids, vs = 'usd') {
  const list = ids.join(',')
  const rows = await getJSON(
    `markets:${vs}:${list}`,
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}&ids=${list}&sparkline=true&price_change_percentage=24h`,
    2 * MIN,
  )
  return (rows ?? []).map((c) => {
    const week = c.sparkline_in_7d?.price ?? []
    const step = Math.max(1, Math.floor(week.length / 42)) // about 4 points a day is plenty for a sparkline
    return {
      id: c.id,
      name: c.name,
      symbol: c.symbol.toUpperCase(),
      price: c.current_price,
      change: c.price_change_percentage_24h ?? 0,
      trend: week.filter((_, i) => i % step === 0),
    }
  })
}

/** Search every coin CoinGecko lists: [{ id, name, symbol, rank }] */
export async function searchCoins(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const r = await getJSON(`coin-search:${q}`, `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, 60 * MIN)
  return (r?.coins ?? []).slice(0, 8).map((c) => ({ id: c.id, name: c.name, symbol: c.symbol.toUpperCase(), rank: c.market_cap_rank }))
}

/* ---------------- stocks ----------------
   Stock data needs an API key, so it goes through the "stocks" Supabase
   Edge Function (supabase/functions/stocks), which keeps the key secret. */
export class StocksNotSetUp extends Error {
  setup = true
}

async function stocksCall(key, params, ttl) {
  const fresh = cached(key, ttl)
  if (fresh) return fresh
  if (!SUPABASE.url) throw new StocksNotSetUp('No Supabase project')
  const url = `${SUPABASE.url.replace(/\/rest\/v1\/?$/, '')}/functions/v1/stocks?${new URLSearchParams({ ...params, apikey: SUPABASE.anonKey })}`
  // a plain GET first: no custom headers means no CORS preflight, so a "not deployed" 404 can be read
  let res = await fetch(url)
  // the gateway wants the key as a header: ask again with it (the deployed function answers the preflight)
  if (res.status === 401) res = await fetch(url, { headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}` } })
  // not deployed yet (404), JWT check still on (401), or no Finnhub key (503)
  if ([401, 403, 404, 503].includes(res.status)) throw new StocksNotSetUp(`stocks function: ${res.status}`)
  if (!res.ok) throw new Error(`${res.status} from stocks function`)
  const value = await res.json()
  const hit = { at: Date.now(), value }
  memo.set(key, hit)
  store.set(key, hit)
  return value
}

/** Search US stocks and ETFs: [{ symbol, name, type }] */
export async function searchStocks(query) {
  const q = query.trim()
  if (!q) return []
  return (await stocksCall(`stock-search:${q.toLowerCase()}`, { q }, 60 * MIN)).results ?? []
}

/** Quotes for tickers: [{ symbol, name, currency, price, change, high, low, open, prev }] */
export async function loadStocks(symbols) {
  const list = [...new Set(symbols.map((s) => s.toUpperCase()))]
  if (!list.length) return []
  return (await stocksCall(`stocks:${list.join(',')}`, { symbols: list.join(',') }, MIN)).quotes ?? []
}

/* ---------------- public holidays ---------------- */
export const COUNTRIES = [
  ['US', /\b(us|usa|america|united states)\b/],
  ['GB', /\b(uk|britain|england|united kingdom|scotland|wales)\b/],
  ['CA', /\bcanada\b/],
  ['AU', /\baustralia\b/],
  ['NZ', /\bnew zealand\b/],
  ['IE', /\bireland\b/],
  ['DE', /\b(germany|deutschland)\b/],
  ['FR', /\bfrance\b/],
  ['ES', /\b(spain|espa[nñ]a)\b/],
  ['IT', /\bitaly\b/],
  ['NL', /\b(netherlands|holland)\b/],
  ['PT', /\bportugal\b/],
  ['MX', /\bmexico\b/],
  ['BR', /\bbrazil\b/],
  ['JP', /\bjapan\b/],
  ['SG', /\bsingapore\b/],
  ['ZA', /\bsouth africa\b/],
  ['EG', /\begypt\b/],
  ['MA', /\bmorocco\b/],
  ['CH', /\bswitzerland\b/],
  ['IN', /\bindia\b/],
  ['PK', /\bpakistan\b/],
  ['AE', /\b(uae|emirates|dubai)\b/],
]

/** The visitor's country from their browser language ("en-GB" → GB), US by default. */
export function homeCountry() {
  const tag = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || ''
  return tag.split('-')[1]?.toUpperCase() || 'US'
}

/** Public holidays for a country and year: [{ date, name, localName, types }]. null when there's no data. */
export const loadHolidays = (country, year) =>
  getJSON(`holidays:${country}:${year}`, `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, 7 * 24 * 60 * MIN)

/** Holidays already cached for this year and next, without going online. */
export function cachedHolidays(country, year) {
  return [...(cached(`holidays:${country}:${year}`) ?? []), ...(cached(`holidays:${country}:${year + 1}`) ?? [])]
}

/** Forget every cached answer (used by the tests). */
export function clearLiveCache() {
  memo.clear()
}
