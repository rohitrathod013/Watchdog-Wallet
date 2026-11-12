// Runs the anomaly detector off the main thread for bigger accounts (see useMl.js).
import { detectAnomalies } from './anomaly.js'
import { setLocale } from '../i18n.js'

self.onmessage = (e) => {
  const { transactions, dismissed, locale } = e.data
  setLocale(locale)
  self.postMessage(detectAnomalies(transactions, { dismissed: new Set(dismissed) }))
}
