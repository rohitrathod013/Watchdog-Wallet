import { PERIODS } from '../data/seed'

/** Top navigation. */
export const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'category' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'transfer', label: 'Transfer', icon: 'transfer' },
  { id: 'friends', label: 'Friends', icon: 'users' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'budget', label: 'Budget', icon: 'pie' },
]

/** The folder tabs on the Dashboard (budgets have their own page, so no tab here). */
export const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'networth', label: 'Net worth' },
  { id: 'reports', label: 'Reports' },
]

export const PERIOD_OPTIONS = Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }))
