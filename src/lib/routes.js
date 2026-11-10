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

/** The folder tabs on the Dashboard. */
export const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'reports', label: 'Reports' },
]

export const PERIOD_OPTIONS = Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }))
