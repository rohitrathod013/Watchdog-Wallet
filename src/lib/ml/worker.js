// Runs the anomaly detector off the main thread for bigger accounts (see useMl.js).
import { detectAnomalies } from './anomaly.js'
import { loadLocale, setLocale } from '../i18n.js'

self.onmessage = async (e) => {
  const { transactions, dismissed, locale } = e.data
  await loadLocale(locale)
  setLocale(locale)
  self.postMessage(detectAnomalies(transactions, { dismissed: new Set(dismissed) }))
}
