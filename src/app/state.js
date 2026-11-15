/* What an account starts with, and the demo's sample dashboard. */
import { DEFAULT_GUARD } from '../lib/guard'
import { DEFAULT_BUDGETS } from '../lib/stats'
import { BRAND } from '../config'
import * as seed from '../data/seed'

/* A new account starts empty: no money, no history. Only a few budget
   categories are suggested so the Budget page has something to adjust. */
/* the coins and stocks on the Markets card until the user picks their own */
export const DEFAULT_WATCHLIST = { crypto: ['bitcoin', 'ethereum', 'ripple', 'solana', 'dogecoin'], stocks: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'] }

/* Grace's guard settings (see components/Guard.jsx); the demo doesn't auto-lock */
export const DEMO_GUARD = { ...DEFAULT_GUARD, lock: 0 }

export const freshState = () => ({
  balance: 0,
  transactions: [],
  goals: [],
  budgets: DEFAULT_BUDGETS,
  bills: [],
  contacts: [],
  pots: [],
  activity: [],
  watchlist: DEFAULT_WATCHLIST,
  holdings: [],
  guard: DEFAULT_GUARD,
  notifications: [
    {
      id: 'welcome',
      icon: 'sparkle',
      tone: 'accent',
      title: 'Welcome to {brand}!',
      body: 'Your account is ready. Add your first transaction to get started.',
      vars: { brand: BRAND.name },
      time: 'Now',
      unread: true,
    },
  ],
})

export const DEMO_NOW = new Date(2026, 9, 28, 18, 0)

/* The demo: the full sample dashboard, never saved anywhere. */
export const demoState = () => ({
  balance: seed.BALANCE_USD,
  transactions: seed.TRANSACTIONS,
  goals: seed.GOALS,
  budgets: seed.BUDGETS,
  bills: seed.BILLS,
  contacts: seed.CONTACTS,
  notifications: seed.NOTIFICATIONS,
  pots: seed.POTS,
  activity: [],
  watchlist: DEFAULT_WATCHLIST,
  holdings: seed.HOLDINGS,
  guard: DEMO_GUARD,
})
