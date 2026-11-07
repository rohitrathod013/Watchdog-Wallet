import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

import TopBar from './components/TopBar'
import Icon from './components/Icon'
import {
  AddMoneyModal,
  BillModal,
  ContactModal,
  GoalModal,
  MoveMoneyModal,
  PotModal,
  ReceiveModal,
  RequestModal,
  SendModal,
  TransactionModal,
  ActivityModal,
  InvestModal,
  SellModal,
} from './components/Modals'
import { Toasts } from './components/ui'
import { Copyright, Logo } from './components/Brand'
import { GuardModal, LockScreen } from './components/Guard'
import { DEFAULT_GUARD } from './lib/guard'

import Dashboard from './pages/Dashboard'

import { AppContext } from './lib/store'
import { PAGES, TABS } from './lib/routes'
import { liquidSwitch } from './lib/themeTransition'
import { localIso, MONTHS, money, uid } from './lib/format'
import { accountCards, billDue, computeStats, DEFAULT_BUDGETS, demoStats, KIND_FOR } from './lib/stats'
import { LOCALES, setLocale, t, tMonths } from './lib/i18n'
import { applyRates, loadRates } from './lib/live'
import { accountsEnabled, getSupabase, loadUserState, profileOf, SAVED_KEYS, saveUserState } from './lib/supabase'
import * as seed from './data/seed'
import { ASSISTANT, BRAND, FEATURES, THEME } from './config'

/* The dashboard ships in the first bundle; everything else (other pages and
   the assistant with Framer Motion) loads on demand and is warmed up while idle. */
const load = {
  analytics: () => import('./pages/Analytics'),
  transfer: () => import('./pages/Transfer'),
  wallet: () => import('./pages/Wallet'),
  budget: () => import('./pages/Budget'),
  buddy: () => import('./components/Buddy'),
  assistant: () => import('./components/Assistant'),
}
const Analytics = lazy(load.analytics)
const Transfer = lazy(load.transfer)
const Wallet = lazy(load.wallet)
const Budget = lazy(load.budget)
const Buddy = lazy(load.buddy)
const Assistant = lazy(load.assistant)
const Auth = lazy(() => import('./components/Auth'))

const PAGE_VIEWS = { dashboard: Dashboard, analytics: Analytics, transfer: Transfer, wallet: Wallet, budget: Budget }

/* A new account starts empty: no money, no history. Only a few budget
   categories are suggested so the Budget page has something to adjust. */
/* the coins and stocks on the Markets card until the user picks their own */
const DEFAULT_WATCHLIST = { crypto: ['bitcoin', 'ethereum', 'ripple', 'solana', 'dogecoin'], stocks: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'] }

/* Grace's guard settings (see components/Guard.jsx); the demo doesn't auto-lock */
const DEMO_GUARD = { ...DEFAULT_GUARD, lock: 0 }

const freshState = () => ({
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

const DEMO_NOW = new Date(2026, 9, 28, 18, 0)

/* The demo: the full sample dashboard, never saved anywhere. */
const demoState = () => ({
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

/** Shown while checking the session or loading an account's data. */
function Splash() {
  return (
    <div className="splash" role="status" aria-label={t('Loading…')}>
      <Logo size={56} />
    </div>
  )
}

/* #/dashboard/reports → { page: 'dashboard', tab: 'reports' } */
const fromHash = () => {
  const [p, t] = window.location.hash.replace(/^#\/?/, '').split('/')
  const page = PAGES.some((x) => x.id === p) ? p : 'dashboard'
  const tab = page === 'dashboard' && TABS.some((x) => x.id === t) ? t : 'overview'
  return { page, tab }
}

const stored = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

const store = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: preferences just will not persist */
  }
}

export default function App() {
  /* ---------- appearance ---------- */
  const [theme, setTheme] = useState(() => stored('codexr-theme', THEME.defaultTheme))
  const [accent, setAccent] = useState(() => stored('codexr-accent', THEME.defaultAccent))
  const [reduceMotion, setReduceMotion] = useState(() => stored('codexr-motion', 'full') === 'reduced')
  const [lang, setLang] = useState(() => {
    const saved = stored('codexr-lang', 'EN')
    return LOCALES[saved] ? saved : 'EN'
  })
  // set before any child renders so every t() call in this pass uses it
  setLocale(lang)

  useLayoutEffect(() => {
    const loc = LOCALES[lang]
    document.documentElement.lang = loc.tag
    document.documentElement.dir = loc.dir
    store('codexr-lang', lang)
  }, [lang])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    store('codexr-theme', theme)
  }, [theme])
  useLayoutEffect(() => {
    document.documentElement.dataset.accent = accent
    store('codexr-accent', accent)
  }, [accent])
  useLayoutEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full'
    store('codexr-motion', reduceMotion ? 'reduced' : 'full')
  }, [reduceMotion])

  const switchTheme = useCallback(
    (next, origin) => {
      if (next === theme) return
      const x = origin?.x ?? window.innerWidth / 2
      const y = origin?.y ?? 0
      liquidSwitch(x, y, () => {
        document.documentElement.dataset.theme = next
        flushSync(() => setTheme(next))
      })
    },
    [theme],
  )

  /* ---------- intro choreography (plays on every fresh load) ---------- */
  const [bootKey, setBootKey] = useState(0)
  const [booting, setBooting] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setBooting(false), 3200)
    return () => window.clearTimeout(t)
  }, [bootKey])

  /* ---------- routing ---------- */
  const [route, setRoute] = useState(fromHash)
  useEffect(() => {
    const onHash = () => setRoute(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = useCallback(
    (page, params = {}) => {
      const tab = page === 'dashboard' ? (params.tab ?? (route.page === 'dashboard' ? route.tab : 'overview')) : route.tab
      const hash = page === 'dashboard' && tab !== 'overview' ? `#/dashboard/${tab}` : `#/${page}`
      if (window.location.hash !== hash) window.history.pushState(null, '', hash)
      setRoute({ page, tab })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [route],
  )
  const setTab = useCallback((tab) => go('dashboard', { tab }), [go])

  /* ---------- data ---------- */
  const [period, setPeriod] = useState('month')
  const [currency, setCurrency] = useState('USD')
  // live exchange rates for the currency switcher (European Central Bank, via Frankfurter)
  const [ratesDate, setRatesDate] = useState(null)
  useEffect(() => {
    loadRates()
      .then((r) => {
        if (!r) return
        applyRates(r.rates)
        setRatesDate(r.date)
      })
      .catch(() => null) // offline: the built-in rates stay
  }, [])
  const [balance, setBalance] = useState(seed.BALANCE_USD)
  // the "live" wiggle is shown on top of the real balance and never saved
  const [drift, setDrift] = useState(0)
  const [live, setLive] = useState(FEATURES.liveUpdates)
  const [transactions, setTransactions] = useState(seed.TRANSACTIONS)
  const [goals, setGoals] = useState(seed.GOALS)
  const [budgets, setBudgets] = useState(seed.BUDGETS)
  const [bills, setBills] = useState(seed.BILLS)
  const [notifications, setNotifications] = useState(seed.NOTIFICATIONS)
  const [contacts, setContacts] = useState(seed.CONTACTS)
  // the balance split into pots by what it's for; whatever is left is unassigned
  const [pots, setPots] = useState(seed.POTS)
  // everything Grace has done, newest first: the audit trail behind "why did you do that?"
  const [activity, setActivity] = useState([])
  // the coins and stocks on the Markets card
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST)
  // coins and stocks the user has recorded buying: { kind, asset, name, symbol, qty, cost }
  const [holdings, setHoldings] = useState(seed.HOLDINGS)
  // Grace on guard: auto-lock, large-payment checks, first-payment warnings, privacy blur
  const [guard, setGuardState] = useState(DEMO_GUARD)
  const setGuard = useCallback((patch) => setGuardState((g) => ({ ...g, ...patch })), [])
  const [sentToday, setSentToday] = useState(0)

  /* ---------- accounts (Supabase) ----------
     session: undefined while checking, null when logged out.
     loadedFor: the user id whose saved dashboard is in state. */
  const [session, setSession] = useState(accountsEnabled ? undefined : null)
  const [recovery, setRecovery] = useState(false)
  const [loadedFor, setLoadedFor] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [authMode, setAuthMode] = useState('login')
  // exploring the sample dashboard without an account
  const [demo, setDemo] = useState(false)
  /* locked: null, or why ('idle' | 'manual'). It survives a reload, so refreshing doesn't get past the lock. */
  const [lock, setLock] = useState(() => {
    try {
      return localStorage.getItem('ww-locked') || null
    } catch {
      return null
    }
  })
  // a lock only guards a signed-in session: with nobody signed in there's nothing to unlock
  const clearLock = useCallback(() => {
    setLock(null)
    try {
      localStorage.removeItem('ww-locked')
    } catch {
      /* nothing saved */
    }
  }, [])
  const isDemo = !accountsEnabled || demo
  const userId = demo ? null : (session?.user?.id ?? null)

  const applyState = useCallback((data) => {
    setBalance(data.balance ?? 0)
    setTransactions(data.transactions ?? [])
    setGoals(data.goals ?? [])
    setBudgets(data.budgets ?? [])
    setBills(data.bills ?? [])
    setNotifications(data.notifications ?? [])
    setContacts(data.contacts ?? [])
    setPots(data.pots ?? [])
    setActivity(data.activity ?? [])
    setWatchlist(data.watchlist ?? DEFAULT_WATCHLIST)
    setHoldings(data.holdings ?? [])
    setGuardState({ ...DEFAULT_GUARD, ...(data.guard ?? {}) })
    setDrift(0)
    setSentToday(0)
  }, [])

  useEffect(() => {
    if (!accountsEnabled) return undefined
    let unsub = null
    let alive = true
    getSupabase().then((supabase) => {
      if (!alive) return
      supabase.auth.getSession().then(({ data }) => {
        if (!alive) return
        setSession(data.session ?? null)
        if (!data.session) clearLock()
      })
      const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
        setSession(s ?? null)
        if (!s) clearLock()
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      })
      unsub = () => sub.subscription.unsubscribe()
    })
    return () => {
      alive = false
      unsub?.()
    }
  }, [clearLock])

  // load (or create) the signed-in user's dashboard
  useEffect(() => {
    if (!accountsEnabled || !userId || loadedFor === userId) return undefined
    let alive = true
    loadUserState(userId)
      .then(async (saved) => {
        const data = saved ?? freshState()
        if (!saved) await saveUserState(userId, data)
        if (!alive) return
        applyState(data)
        setLoadedFor(userId)
      })
      .catch((err) => alive && setLoadError(err?.message || 'Could not load your data.'))
    return () => {
      alive = false
    }
  }, [userId, loadedFor, applyState])

  // save the dashboard back to the account a moment after anything changes
  const saved = useMemo(
    () => ({ balance, transactions, goals, budgets, bills, notifications, contacts, pots, activity, watchlist, holdings, guard }),
    [balance, transactions, goals, budgets, bills, notifications, contacts, pots, activity, watchlist, holdings, guard],
  )
  const [saveFailed, setSaveFailed] = useState(false)
  useEffect(() => {
    if (!accountsEnabled || !userId || loadedFor !== userId) return undefined
    const h = window.setTimeout(() => {
      saveUserState(userId, Object.fromEntries(SAVED_KEYS.map((k) => [k, saved[k]])))
        .then(() => setSaveFailed(false))
        .catch(() => setSaveFailed(true))
    }, 800)
    return () => window.clearTimeout(h)
  }, [saved, userId, loadedFor])

  /* ---------- toasts ---------- */
  const [toasts, setToasts] = useState([])
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback(
    (title, body, opts = {}) => {
      const id = uid()
      setToasts((t) => [...t.slice(-3), { id, title, body, ...opts }])
      window.setTimeout(() => dismiss(id), opts.ms ?? 3400)
    },
    [dismiss],
  )

  /* ---------- modals ---------- */
  const [modal, setModal] = useState(null)
  const openModal = useCallback((type, payload = {}) => setModal({ type, payload }), [])
  const closeModal = useCallback(() => setModal(null), [])
  const [signedOut, setSignedOut] = useState(false)

  /* warm the lazy chunks once the intro has played */
  useEffect(() => {
    const t = window.setTimeout(() => Object.values(load).forEach((f) => f()), 2500)
    return () => window.clearTimeout(t)
  }, [])

  /* ---------- Grace, the assistant ---------- */
  const [aiOpen, setAiOpen] = useState(false)
  // openAssistant('crypto prices') opens Grace and asks her straight away
  const [aiAsk, setAiAsk] = useState(null)
  const openAssistant = useCallback((q) => {
    setAiOpen(true)
    if (typeof q === 'string') setAiAsk({ q, n: Date.now() })
  }, [])
  const closeAssistant = useCallback(() => setAiOpen(false), [])
  const lockNow = useCallback((why = 'manual') => {
    setModal(null)
    setAiOpen(false)
    setLock(why)
    try {
      localStorage.setItem('ww-locked', why)
    } catch {
      /* the lock still holds for this visit */
    }
  }, [])
  const unlock = useCallback(() => {
    setLock(null)
    try {
      localStorage.removeItem('ww-locked')
    } catch {
      /* nothing saved */
    }
  }, [])
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('ai-open', aiOpen)
  }, [aiOpen])
  useEffect(() => {
    const key = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
      if (ASSISTANT.enabled && e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setAiOpen(true)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  /* ---------- live update: small real-time drift in the balance ---------- */
  useEffect(() => {
    if (!live || signedOut || !isDemo) return undefined
    const t = window.setInterval(() => {
      const step = Math.round((Math.random() * 260 - 60) * 100) / 100
      setDrift((d) => Math.round((d + step) * 100) / 100)
    }, 5200)
    return () => window.clearInterval(t)
  }, [live, signedOut, isDemo])

  /* ---------- actions shared across pages ---------- */
  const addTx = useCallback((row) => setTransactions((list) => [{ id: uid(), date: localIso(), status: 'Completed', ...row }, ...list]), [])
  const notify = useCallback((n) => setNotifications((list) => [{ id: uid(), time: 'Now', unread: true, ...n }, ...list]), [])

  const sendMoney = useCallback(
    ({ to, amount, note }) => {
      setBalance((b) => b - amount)
      setSentToday((s) => s + amount)
      addTx({ name: `Transfer to ${to}`, category: 'Transfer', kind: 'transfer', method: `${BRAND.name} Pay`, amount: -amount, note })
      notify({ icon: 'arrowUpRight', tone: 'accent', title: 'You sent {amount}', body: 'To {name}', vars: { amount: money(amount), name: to } })
      toast(t('Transfer sent'), t('{amount} is on its way to {name}.', { amount: money(amount), name: to }), { icon: 'send' })
    },
    [addTx, notify, toast],
  )

  const requestMoney = useCallback(
    ({ from, amount, note }) => {
      addTx({ name: `Request from ${from}`, category: 'Transfer', kind: 'request', method: `${BRAND.name} Pay`, amount, status: 'Pending', note })
      toast(t('Request sent'), t('{name} will get a request for {amount}.', { name: from, amount: money(amount) }), { icon: 'request' })
    },
    [addTx, toast],
  )

  const receiveMoney = useCallback(() => {
    const pool = contacts.length ? contacts : seed.CONTACTS
    const who = pool[Math.floor(Math.random() * pool.length)]
    const amount = Math.round((120 + Math.random() * 780) * 100) / 100
    setBalance((b) => b + amount)
    addTx({ name: `Payment from ${who.name}`, category: 'Transfer', kind: 'request', method: `${BRAND.name} Pay`, amount })
    notify({ icon: 'arrowDown', tone: 'green', title: 'You received {amount}', body: 'From {name}', vars: { amount: money(amount), name: who.name } })
    toast(t('Money received'), t('{name} sent you {amount}.', { name: who.name, amount: money(amount) }), { icon: 'receive' })
  }, [contacts, addTx, notify, toast])

  const payBill = useCallback(
    (id) => {
      const bill = bills.find((b) => b.id === id)
      if (!bill || bill.paid) return
      setBills((list) => list.map((b) => (b.id === id ? { ...b, paid: true } : b)))
      setBalance((b) => b - bill.amount)
      addTx({ name: bill.name, category: 'Bills', kind: bill.kind, method: 'Autopay', amount: -bill.amount })
      toast(
        t('{name} paid', { name: t(bill.name) }),
        t('{amount} paid ahead of {date}.', { amount: money(bill.amount), date: tMonths(billDue(bill).due) }),
        {
          icon: 'check',
        },
      )
    },
    [bills, addTx, toast],
  )

  const addGoal = useCallback(
    ({ name, target, saved, icon, monthly: planned, due: plannedDue }) => {
      const monthly = planned ? Math.round(planned) : Math.max(50, Math.round(target / 24 / 10) * 10)
      const at = new Date()
      at.setMonth(at.getMonth() + Math.max(1, Math.ceil((target - saved) / monthly)))
      setGoals((g) => [...g, { id: uid(), name, target, saved, icon, monthly, due: plannedDue ?? `${MONTHS[at.getMonth()]} ${at.getFullYear()}` }])
      toast(t('Goal created'), t('{name}: {amount} target. You’ve got this!', { name, amount: money(target, '$', 0) }), { icon: 'target' })
    },
    [toast],
  )

  const fundGoal = useCallback(
    (id, amount) => {
      const g = goals.find((x) => x.id === id)
      if (!g) return
      const add = Math.min(amount, g.target - g.saved)
      if (add <= 0) return
      setGoals((list) => list.map((x) => (x.id === id ? { ...x, saved: x.saved + add } : x)))
      setBalance((b) => b - add)
      if (g.saved + add >= g.target) toast(t('Goal reached! 🎉'), t('{name} is fully funded.', { name: t(g.name) }), { icon: 'trophy' })
      else
        toast(
          t('Added {amount}', { amount: money(add, '$', 0) }),
          t('{name} is now at {pct}%.', { name: t(g.name), pct: Math.round(((g.saved + add) / g.target) * 100) }),
          {
            icon: 'sack',
          },
        )
    },
    [goals, toast],
  )

  const removeGoal = useCallback(
    (id) => {
      const g = goals.find((x) => x.id === id)
      setGoals((list) => list.filter((x) => x.id !== id))
      if (g) toast(t('Goal removed'), t('{name} was archived.', { name: t(g.name) }), { icon: 'trash' })
    },
    [goals, toast],
  )

  const setBudgetLimit = useCallback((id, limit) => setBudgets((list) => list.map((b) => (b.id === id ? { ...b, limit } : b))), [])

  /** Record money in (amount > 0) or out (amount < 0) by hand. */
  const addTransaction = useCallback(
    ({ name, amount, category, date, method, note, potId }) => {
      setBalance((b) => Math.round((b + amount) * 100) / 100)
      // spending from a pot empties that pot first; the rest comes out of unassigned
      if (potId && amount < 0)
        setPots((list) => list.map((p) => (p.id === potId ? { ...p, amount: Math.max(0, Math.round((p.amount + amount) * 100) / 100) } : p)))
      addTx({ name, amount, category, kind: KIND_FOR[category] ?? 'transfer', method: method || 'Cash', date: date || localIso(), note })
      toast(amount > 0 ? t('Income added') : t('Expense added'), `${t(name)} · ${money(Math.abs(amount))}`, { icon: amount > 0 ? 'receive' : 'send' })
    },
    [addTx, toast],
  )

  const addContact = useCallback(
    (name) => {
      const c = { id: uid(), name, hue: Math.floor(Math.random() * 360) }
      setContacts((list) => [...list, c])
      toast(t('Contact added'), t('{name} is now in your contacts.', { name }), { icon: 'check' })
      return c
    },
    [toast],
  )

  const addBill = useCallback(
    ({ name, amount, dueDate, category }) => {
      setBills((list) => [...list, { id: uid(), name, amount, dueDate, kind: KIND_FOR[category] ?? 'wifi', paid: false }])
      toast(t('Bill added'), t('{name} is due {date}.', { name, date: tMonths(billDue({ dueDate }).due) }), { icon: 'receipt' })
    },
    [toast],
  )

  /* ---------- pots ---------- */
  const inPots = useMemo(() => Math.round(pots.reduce((s, p) => s + p.amount, 0) * 100) / 100, [pots])
  const unassigned = Math.round((balance - inPots) * 100) / 100

  /** Record money the user has (no bank involved) and optionally drop it straight into a pot. */
  const addMoney = useCallback(
    ({ amount, category, name, date, potId }) => {
      setBalance((b) => Math.round((b + amount) * 100) / 100)
      addTx({ name: name || category, amount, category, kind: KIND_FOR[category] ?? 'request', method: 'Added by you', date: date || localIso() })
      if (potId) setPots((list) => list.map((p) => (p.id === potId ? { ...p, amount: Math.round((p.amount + amount) * 100) / 100 } : p)))
      const pot = pots.find((p) => p.id === potId)
      toast(
        t('Money added'),
        pot
          ? t('{amount} went into {name}.', { amount: money(amount), name: t(pot.name) })
          : t('{amount} is ready to sort into pots.', { amount: money(amount) }),
        { icon: 'receive' },
      )
    },
    [addTx, pots, toast],
  )

  const createPot = useCallback(
    ({ name, icon, amount = 0 }) => {
      const start = Math.max(0, Math.min(amount, unassigned))
      setPots((list) => [...list, { id: uid(), name, icon, amount: start }])
      toast(
        t('Pot created'),
        start ? t('{name} starts with {amount}.', { name, amount: money(start) }) : t('{name} is ready. Move money into it any time.', { name }),
        {
          icon: 'safe',
        },
      )
    },
    [unassigned, toast],
  )

  /** Move money between two pots, or between a pot and unassigned ('unassigned'). */
  const moveMoney = useCallback(
    ({ from, to, amount }) => {
      if (!amount || from === to) return
      const have = from === 'unassigned' ? unassigned : (pots.find((p) => p.id === from)?.amount ?? 0)
      const n = Math.round(Math.min(amount, Math.max(0, have)) * 100) / 100
      if (n <= 0) return
      setPots((list) =>
        list.map((p) => {
          if (p.id === from) return { ...p, amount: Math.round((p.amount - n) * 100) / 100 }
          if (p.id === to) return { ...p, amount: Math.round((p.amount + n) * 100) / 100 }
          return p
        }),
      )
      const label = (id) => (id === 'unassigned' ? t('Unassigned') : t(pots.find((p) => p.id === id)?.name ?? ''))
      toast(t('Money moved'), t('{amount} from {from} to {to}.', { amount: money(n), from: label(from), to: label(to) }), { icon: 'transfer' })
    },
    [pots, unassigned, toast],
  )

  const removePot = useCallback(
    (id) => {
      const p = pots.find((x) => x.id === id)
      setPots((list) => list.filter((x) => x.id !== id))
      if (p) toast(t('Pot removed'), p.amount ? t('{amount} went back to Unassigned.', { amount: money(p.amount) }) : t(p.name), { icon: 'trash' })
    },
    [pots, toast],
  )

  /** Record something Grace did, with what was asked and why (kept to the last 200). */
  /* add or remove a coin (CoinGecko id) or stock (ticker) on the Markets card */
  const watch = useCallback(
    (kind, id) => setWatchlist((w) => (w[kind]?.includes(id) ? w : { ...w, [kind]: [...(w[kind] ?? []), id].slice(-12) })),
    [],
  )
  const unwatch = useCallback((kind, id) => setWatchlist((w) => ({ ...w, [kind]: (w[kind] ?? []).filter((x) => x !== id) })), [])

  /* investing: recorded here, valued live at market prices. No real trade is placed.
     Buys and sells are saved with status 'Invested', so they never count as income or spending. */
  const invest = useCallback(
    ({ kind, asset, name, symbol, amount, price, potId }) => {
      const cost = Math.round(amount * 100) / 100
      const qty = cost / price
      if (!(qty > 0)) return
      setBalance((b) => Math.round((b - cost) * 100) / 100)
      if (potId) setPots((list) => list.map((p) => (p.id === potId ? { ...p, amount: Math.max(0, Math.round((p.amount - cost) * 100) / 100) } : p)))
      setHoldings((list) => {
        const have = list.find((h) => h.kind === kind && h.asset === asset)
        if (have) return list.map((h) => (h === have ? { ...h, qty: h.qty + qty, cost: Math.round((h.cost + cost) * 100) / 100 } : h))
        return [...list, { id: uid(), kind, asset, name, symbol, qty, cost, at: localIso() }]
      })
      addTx({
        name: `Bought ${symbol}`,
        category: 'Investment',
        kind: 'business',
        method: 'Portfolio',
        amount: -cost,
        status: 'Invested',
        note: `${+qty.toPrecision(6)} ${symbol} at ${money(price)}`,
      })
      toast(t('Investment recorded'), t('{qty} {symbol} for {amount}.', { qty: +qty.toPrecision(6), symbol, amount: money(cost) }), {
        icon: 'trendUp',
      })
    },
    [addTx, toast],
  )
  const sellHolding = useCallback(
    ({ id, qty, price }) => {
      const h = holdings.find((x) => x.id === id)
      if (!h || !(price > 0)) return
      const n = Math.min(h.qty, qty ?? h.qty)
      const value = Math.round(n * price * 100) / 100
      const costPart = Math.round(h.cost * (n / h.qty) * 100) / 100
      setBalance((b) => Math.round((b + value) * 100) / 100)
      setHoldings((list) =>
        n >= h.qty * 0.9999
          ? list.filter((x) => x.id !== id)
          : list.map((x) => (x.id === id ? { ...x, qty: x.qty - n, cost: Math.round((x.cost - costPart) * 100) / 100 } : x)),
      )
      addTx({
        name: `Sold ${h.symbol}`,
        category: 'Investment',
        kind: 'business',
        method: 'Portfolio',
        amount: value,
        status: 'Invested',
        note: `${+n.toPrecision(6)} ${h.symbol} at ${money(price)}`,
      })
      const gain = value - costPart
      toast(
        t('Sale recorded'),
        t('{amount} back in your balance ({gain} {word}).', {
          amount: money(value),
          gain: money(Math.abs(gain)),
          word: gain >= 0 ? t('profit') : t('loss'),
        }),
        { icon: 'receive' },
      )
      return { value, gain }
    },
    [holdings, addTx, toast],
  )

  const logActivity = useCallback(
    (entry) => setActivity((list) => [{ id: uid(), at: new Date().toISOString(), ...entry }, ...list].slice(0, 200)),
    [],
  )

  /** Wipe this account back to a fresh, empty dashboard. */
  const clearData = useCallback(() => {
    applyState(freshState())
    toast(t('Your data was cleared'), t('You’re starting fresh.'), { icon: 'trash' })
  }, [applyState, toast])

  const enterDemo = useCallback(() => {
    clearLock()
    applyState(demoState())
    setDemo(true)
    window.history.replaceState(null, '', '#/dashboard')
    setRoute({ page: 'dashboard', tab: 'overview' })
  }, [applyState, clearLock])

  const leaveDemo = useCallback((mode = 'login') => {
    setModal(null)
    setAiOpen(false)
    setDemo(false)
    setAuthMode(mode)
  }, [])

  const signOut = useCallback(() => {
    setModal(null)
    setAiOpen(false)
    setLock(null)
    try {
      localStorage.removeItem('ww-locked')
    } catch {
      /* nothing saved */
    }
    if (accountsEnabled && demo) {
      setDemo(false)
      setAuthMode('login')
    } else if (accountsEnabled) {
      setLoadedFor(null)
      getSupabase().then((supabase) => supabase.auth.signOut())
    } else setSignedOut(true)
  }, [demo])
  const replayIntro = useCallback(() => {
    setBooting(true)
    setBootKey((k) => k + 1)
    window.scrollTo({ top: 0 })
  }, [])
  const signIn = useCallback(() => {
    setSignedOut(false)
    replayIntro()
  }, [replayIntro])

  // auto-lock after `guard.lock` minutes without any input (only inside the app, never on the login screen)
  const inApp = !accountsEnabled || isDemo || Boolean(session && loadedFor === userId)
  useEffect(() => {
    if (!guard.lock || lock || !inApp) return undefined
    let timer = 0
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => lockNow('idle'), guard.lock * 60 * 1000)
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }))
    arm()
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, arm))
    }
  }, [guard.lock, lock, inApp, lockNow])

  // privacy blur: hide the numbers while the window isn't in front
  const [away, setAway] = useState(false)
  useEffect(() => {
    if (!guard.privacy) return undefined
    const check = () => setAway(document.hidden || !document.hasFocus())
    window.addEventListener('blur', check)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('blur', check)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
      setAway(false)
    }
  }, [guard.privacy])
  const hidden = guard.privacy && away

  const user = useMemo(() => {
    if (isDemo) return { ...seed.USER, avatar: `${import.meta.env.BASE_URL}avatar.jpg` }
    return session?.user ? profileOf(session.user) : seed.USER
  }, [session, isDemo])

  /* every chart and summary, from the sample figures or this account's own transactions */
  const stats = useMemo(() => (isDemo ? demoStats(budgets) : computeStats(transactions, budgets)), [isDemo, transactions, budgets])
  const cards = useMemo(() => (isDemo ? seed.CARDS : accountCards(user)), [isDemo, user])
  const wallets = useMemo(
    () => (isDemo ? seed.WALLETS : [{ code: 'USD', name: 'US Dollar', flag: 'us', amount: balance, usd: balance }]),
    [isDemo, balance],
  )

  const ctx = useMemo(
    () => ({
      page: route.page,
      tab: route.tab,
      go,
      setTab,
      booting,
      theme,
      switchTheme,
      accent,
      setAccent,
      reduceMotion,
      setReduceMotion,
      lang,
      setLang,
      replayIntro,
      signOut,
      user,
      accounts: accountsEnabled,
      demo: isDemo,
      stats,
      cards,
      wallets,
      addTransaction,
      addContact,
      addBill,
      clearData,
      leaveDemo,
      activity,
      logActivity,
      watchlist,
      watch,
      unwatch,
      holdings,
      invest,
      sellHolding,
      guard,
      setGuard,
      lockNow,
      // the demo's sample data ends on Oct 28 2026, so Grace treats that as today there
      now: isDemo ? DEMO_NOW : undefined,
      pots,
      unassigned,
      inPots,
      addMoney,
      createPot,
      moveMoney,
      removePot,
      contacts,
      period,
      setPeriod,
      currency,
      setCurrency,
      ratesDate,
      balance: balance + drift,
      live,
      setLive,
      openAssistant,
      transactions,
      goals,
      budgets: stats.budgets,
      setBudgets,
      bills,
      notifications,
      setNotifications,
      sentToday,
      sendMoney,
      requestMoney,
      receiveMoney,
      payBill,
      addGoal,
      fundGoal,
      removeGoal,
      setBudgetLimit,
      toast,
      openModal,
    }),
    [
      route,
      go,
      setTab,
      booting,
      theme,
      switchTheme,
      accent,
      reduceMotion,
      lang,
      replayIntro,
      signOut,
      user,
      isDemo,
      stats,
      cards,
      wallets,
      addTransaction,
      addContact,
      addBill,
      clearData,
      leaveDemo,
      activity,
      logActivity,
      watchlist,
      watch,
      unwatch,
      holdings,
      invest,
      sellHolding,
      guard,
      setGuard,
      lockNow,
      pots,
      unassigned,
      inPots,
      addMoney,
      createPot,
      moveMoney,
      removePot,
      contacts,
      period,
      currency,
      ratesDate,
      balance,
      drift,
      live,
      openAssistant,
      transactions,
      goals,
      bills,
      notifications,
      sentToday,
      sendMoney,
      requestMoney,
      receiveMoney,
      payBill,
      addGoal,
      fundGoal,
      removeGoal,
      setBudgetLimit,
      toast,
      openModal,
    ],
  )

  if (accountsEnabled && !demo) {
    if (session === undefined) return <Splash />
    if (!session || recovery) {
      return (
        <Suspense fallback={<Splash />}>
          <Auth
            key={recovery ? 'reset' : `auth-${authMode}`}
            initialMode={recovery ? 'reset' : authMode}
            onDemo={enterDemo}
            lang={lang}
            setLang={setLang}
            onPasswordUpdated={() => {
              setRecovery(false)
              toast(t('Password updated'), t('You’re signed in with your new password.'), { icon: 'check' })
            }}
          />
        </Suspense>
      )
    }
    if (loadError)
      return (
        <div className="signed-out">
          <div className="so-card">
            <Logo size={60} />
            <h2>{t('We couldn’t load your data')}</h2>
            <p>{loadError}</p>
            <button type="button" className="btn solid lg" onClick={() => window.location.reload()}>
              {t('Try again')}
            </button>
            <button type="button" className="link" onClick={signOut}>
              {t('Log out')}
            </button>
          </div>
        </div>
      )
    if (loadedFor !== userId) return <Splash />
  }

  if (signedOut) {
    return (
      <div className="signed-out">
        <div className="so-card">
          <Logo size={60} />
          <h2>{t('You’re signed out')}</h2>
          <p>{t('Thanks for stopping by, {name}. Your session ended safely and your data stays encrypted.', { name: user.first })}</p>
          <button type="button" className="btn solid lg" onClick={signIn}>
            {t('Sign back in')}
          </button>
        </div>
      </div>
    )
  }

  const Page = PAGE_VIEWS[route.page] ?? Dashboard

  return (
    <AppContext.Provider value={ctx}>
      <div className={`shell ${booting ? 'booting' : ''} ${hidden || lock ? 'guard-hidden' : ''}`} key={bootKey} inert={lock ? true : undefined}>
        <TopBar />
        <main className="main" key={route.page}>
          <Suspense fallback={null}>
            <Page />
          </Suspense>
        </main>
        <Copyright />
      </div>

      <SendModal open={modal?.type === 'send'} payload={modal?.payload} onClose={closeModal} />
      <ReceiveModal open={modal?.type === 'receive'} onClose={closeModal} />
      <RequestModal open={modal?.type === 'request'} onClose={closeModal} />
      <GoalModal open={modal?.type === 'goal'} onClose={closeModal} />
      <TransactionModal open={modal?.type === 'transaction'} payload={modal?.payload} onClose={closeModal} />
      <ContactModal open={modal?.type === 'contact'} payload={modal?.payload} onClose={closeModal} />
      <BillModal open={modal?.type === 'bill'} onClose={closeModal} />
      <AddMoneyModal open={modal?.type === 'addMoney'} payload={modal?.payload} onClose={closeModal} />
      <MoveMoneyModal open={modal?.type === 'move'} payload={modal?.payload} onClose={closeModal} />
      <PotModal open={modal?.type === 'pot'} onClose={closeModal} />
      <ActivityModal open={modal?.type === 'activity'} onClose={closeModal} />
      <InvestModal open={modal?.type === 'invest'} payload={modal?.payload} onClose={closeModal} />
      <SellModal open={modal?.type === 'sell'} payload={modal?.payload} onClose={closeModal} />
      <GuardModal open={modal?.type === 'guard'} onClose={closeModal} />
      {hidden && !lock ? (
        <div className="guard-veil" aria-hidden="true">
          <span>
            <Icon name="eyeOff" size={18} /> {t('Hidden by {name} while you’re away', { name: ASSISTANT.name })}
          </span>
        </div>
      ) : null}
      {lock ? <LockScreen user={user} demo={isDemo} reason={lock} onUnlock={unlock} onSignOut={signOut} /> : null}
      {accountsEnabled && demo ? (
        <div className="demo-bar" role="status">
          <span className="demo-long">{t('You’re exploring the demo. Nothing here is saved.')}</span>
          <span className="demo-short">{t('Demo · nothing is saved')}</span>
          <button type="button" className="btn solid" onClick={() => leaveDemo('signup')}>
            {t('Create your account')}
          </button>
        </div>
      ) : null}
      {ASSISTANT.enabled ? (
        <Suspense fallback={null}>
          {/* while locked, Grace stays out of reach so nothing can be done through the chat */}
          <Buddy key={`codi-${bootKey}`} hidden={aiOpen || Boolean(lock)} onOpen={openAssistant} />
          <Assistant open={aiOpen && !lock} onClose={closeAssistant} prompt={lock ? null : aiAsk} />
        </Suspense>
      ) : null}
      {saveFailed ? (
        <div className="save-warn" role="status">
          {t('Changes aren’t saving right now. Check your connection.')}
        </div>
      ) : null}
      <Toasts items={toasts} onDismiss={dismiss} />
    </AppContext.Provider>
  )
}
