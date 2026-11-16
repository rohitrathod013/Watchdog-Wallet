/* The app, or (for a payment link, ?pay=<id>) the small public page where anyone can pay it. */
import { lazy, Suspense } from 'react'
import App from './App.jsx'
import { setLocale } from './lib/i18n'

const PayPage = lazy(() => import('./components/PayLinks').then((m) => ({ default: m.PayPage })))
const payId = new URLSearchParams(window.location.search).get('pay')
const payLink = /^[0-9a-f-]{36}$/i.test(payId ?? '') ? payId : null

export default function Root() {
  if (!payLink) return <App />
  try {
    setLocale(localStorage.getItem('codexr-lang') || 'EN')
  } catch {
    setLocale('EN')
  }
  return (
    <Suspense fallback={null}>
      <PayPage id={payLink} />
    </Suspense>
  )
}
