/* Live prices for the coins and stocks someone holds (and SPY, for the S&P 500 comparison), refreshed every minute. */
import { useEffect, useState } from 'react'

export function useHoldingPrices(holdings = [], { spy = false } = {}) {
  const coins = [...new Set(holdings.filter((h) => h.kind === 'crypto').map((h) => h.asset))].sort().join()
  const stocks = [...new Set([...holdings.filter((h) => h.kind === 'stocks').map((h) => h.asset), ...(spy ? ['SPY'] : [])])].sort().join()
  const [state, setState] = useState({ prices: {}, spy: null, ready: false })
  useEffect(() => {
    if (!coins && !stocks) return undefined
    let alive = true
    const load = async () => {
      const L = await import('./live')
      const [c, s] = await Promise.all([
        coins ? L.loadMarkets(coins.split(','), 'usd').catch(() => []) : [],
        stocks ? L.loadStocks(stocks.split(',')).catch(() => []) : [],
      ])
      if (!alive) return
      const prices = {}
      let spyPrice = null
      for (const x of c) prices[`crypto:${x.id}`] = x.price
      for (const x of s) {
        prices[`stocks:${x.symbol}`] = x.price
        if (x.symbol === 'SPY') spyPrice = x.price
      }
      setState({ prices, spy: spyPrice, ready: true })
    }
    load()
    const h = window.setInterval(load, 60 * 1000)
    return () => {
      alive = false
      window.clearInterval(h)
    }
  }, [coins, stocks])
  return state
}
