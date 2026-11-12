/* ------------------------------------------------------------------
   Keeps the anomaly flags for the account up to date. Small accounts
   are checked right away (about 15ms for 300 transactions); over 400
   transactions the work moves to a Web Worker so the page never
   stutters (5,000 take about a third of a second).
   ------------------------------------------------------------------ */
import { useEffect, useMemo, useState } from 'react'
import { detectAnomalies } from './anomaly.js'
import { getLocale } from '../i18n.js'
import { dismissedOf } from './grace.js'

export const WORKER_ABOVE = 400

export function useMlFlags(transactions, verdicts) {
  const [state, setState] = useState(null)
  const dismissed = useMemo(() => dismissedOf(verdicts), [verdicts])
  const locale = getLocale()
  useEffect(() => {
    let alive = true
    const done = (result) => alive && setState({ transactions, key: `${dismissed.join('|')}|${locale}`, result })
    let worker = null
    let timer = 0
    const inline = () => done(detectAnomalies(transactions, { dismissed: new Set(dismissed) }))
    if (typeof Worker !== 'undefined' && transactions.length > WORKER_ABOVE) {
      try {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
        worker.onmessage = (e) => done(e.data)
        worker.onerror = inline
        worker.postMessage({ transactions, dismissed, locale })
      } catch {
        timer = window.setTimeout(inline, 0)
      }
    } else timer = window.setTimeout(inline, 0)
    return () => {
      alive = false
      window.clearTimeout(timer)
      worker?.terminate()
    }
  }, [transactions, dismissed, locale])
  return state && state.transactions === transactions && state.key === `${dismissed.join('|')}|${locale}` ? state.result : null
}
