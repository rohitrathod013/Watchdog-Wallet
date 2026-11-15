/* The page in the address bar (#/dashboard/reports), and small saved preferences in the browser. */
import { PAGES, TABS } from '../lib/routes'

/* #/dashboard/reports → { page: 'dashboard', tab: 'reports' } */
export const fromHash = () => {
  const [p, t] = window.location.hash.replace(/^#\/?/, '').split('/')
  // the Dashboard used to have a Budgets tab: old links open the Budget page
  if (p === 'dashboard' && t === 'budgets') return { page: 'budget', tab: 'overview' }
  const page = PAGES.some((x) => x.id === p) ? p : 'dashboard'
  const tab = page === 'dashboard' && TABS.some((x) => x.id === t) ? t : 'overview'
  return { page, tab }
}

export const stored = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export const store = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: preferences just will not persist */
  }
}
