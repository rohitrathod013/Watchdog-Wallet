/* A group's trip budgets and what's been spent on each (from the splits that belong to it). */
import { useEffect, useState } from 'react'
import { groupTrips, tripSplits } from './server'

const r2 = (n) => Math.round(n * 100) / 100

/** A group's trips, loaded when shown (and again after a change). */
export function useTrips(group) {
  const [state, setState] = useState({ for: null, trips: [], spent: {}, failed: '' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!group) return undefined
    let alive = true
    ;(async () => {
      try {
        const trips = await groupTrips(group)
        const spent = {}
        for (const tr of trips) {
          const splits = await tripSplits(tr.id)
          const byCat = {}
          let total = 0
          for (const s of splits) {
            total += Number(s.total)
            if (s.category) byCat[s.category] = r2((byCat[s.category] ?? 0) + Number(s.total))
          }
          spent[tr.id] = { total: r2(total), byCat, count: splits.length }
        }
        if (alive) setState({ for: group, trips, spent, failed: '' })
      } catch (err) {
        if (alive) setState({ for: group, trips: [], spent: {}, failed: err?.setup ? 'setup' : 'error' })
      }
    })()
    return () => {
      alive = false
    }
  }, [group, tick])
  return { ...(state.for === group ? state : { trips: [], spent: {}, failed: '' }), loaded: state.for === group, reload: () => setTick((n) => n + 1) }
}
