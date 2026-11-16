import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { liquidSwitch } from './lib/themeTransition'
import { lightHours, locate, msUntilSwitch, rememberSun, resolveTheme, savedPlace } from './lib/dayTheme'
import { isoDay, localIso, MONTHS, money, uid } from './lib/format'
import { billDue, computeStats, demoStats, iconOfCategory, KIND_FOR, makeCard, monthKey } from './lib/stats'
import { LOCALES, setLocale, t, tMonths } from './lib/i18n'
import { applyRates, loadRates } from './lib/live'
import { accountsEnabled, confirmPassword, deleteMyAccount, getSupabase, loadUserState, profileOf, SAVED_KEYS, saveUserState } from './lib/supabase'
import { AccountModal } from './components/Account'
import { ProfileModal } from './components/Profile'
import { confirmCardPayment, takePaymentReturn } from './lib/payments'
import { stashInvite } from './lib/social'
import { removeAllMyMedia } from './lib/media'
import { useSocial } from './lib/useSocial'
import { useMlFlags } from './lib/ml/useMl.js'
import { useNetWorthSnapshot, usePushPresence, useReminderNudges, useRepeatingRunner, useWeeklyRecap } from './app/useBackgroundJobs'
import { DEFAULT_WATCHLIST, DEMO_GUARD, DEMO_NOW, demoState, freshState } from './app/state'
import { fromHash, store, stored } from './app/routing'
import { dropCopies, keepCopy, looksOffline, readCopy } from './lib/offline'
import { makeItem } from './lib/wealth'
import { DEFAULT_SPLIT, planSplit } from './lib/incomeSplit'
import { checkPayment, isCardMethod } from './lib/envelopes'
import { EVERY_LABEL, makeRule, runAll } from './lib/recurring'
import { FriendAskModal, FriendPayModal, GroupGoalsModal, GroupModal, SettleModal, SplitModal } from './components/FriendModals'
import { ImportModal, IncomeSplitModal, RecurringModal } from './components/MoneyTools'
import { TermsModal } from './components/Terms'
import * as seed from './data/seed'
import { ASSISTANT, BRAND, FEATURES, THEME } from './config'

/* The dashboard ships in the first bundle; everything else (other pages and
   the assistant with Framer Motion) loads on demand and is warmed up while idle. */
const load = {
  analytics: () => import('./pages/Analytics'),
  transfer: () => import('./pages/Transfer'),
  wallet: () => import('./pages/Wallet'),
  budget: () => import('./pages/Budget'),
  friends: () => import('./pages/Friends'),
  buddy: () => import('./components/Buddy'),
  assistant: () => import('./components/Assistant'),
}
const Analytics = lazy(load.analytics)
const Transfer = lazy(load.transfer)
const Wallet = lazy(load.wallet)
const Budget = lazy(load.budget)
// chats from any page (it brings the Friends chat with it, so it loads on its own)
const MessengerDock = lazy(() => import('./components/MessengerDock'))
// the first-run tour, only for accounts that haven't finished it
const Tour = lazy(() => import('./components/Tour'))
const Friends = lazy(load.friends)
const Buddy = lazy(load.buddy)
const Assistant = lazy(load.assistant)
const Auth = lazy(() => import('./components/Auth'))

const PAGE_VIEWS = { dashboard: Dashboard, analytics: Analytics, transfer: Transfer, wallet: Wallet, budget: Budget, friends: Friends }

/** Shown while checking the session or loading an account's data. */
function Splash() {
  return (
    <div className="splash" role="status" aria-label={t('Loading…')}>
      <Logo size={56} />
    </div>
  )
}

export default function App() {
  /* ---------- appearance ---------- */
  // themeMode is the choice ('light' | 'dark' | 'auto'); theme is what's on screen right now
  const [themeMode, setThemeMode] = useState(() => {
    const saved = stored('codexr-theme', THEME.defaultTheme)
    return ['light', 'dark', 'auto'].includes(saved) ? saved : 'auto'
  })
  const [theme, setTheme] = useState(() => resolveTheme(themeMode))
  // where the user is, for sunrise and sunset (null until known: then 7am to 7pm)
  const [place, setPlace] = useState(() => savedPlace())
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
  }, [theme])
  useEffect(() => {
    store('codexr-theme', themeMode)
  }, [themeMode])
  useLayoutEffect(() => {
    document.documentElement.dataset.accent = accent
    store('codexr-accent', accent)
  }, [accent])
  useLayoutEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full'
    store('codexr-motion', reduceMotion ? 'reduced' : 'full')
  }, [reduceMotion])

  /** Show a theme with the liquid transition (from the given point, or the top centre). */
  const showTheme = useCallback((next, origin) => {
    if (next === document.documentElement.dataset.theme) return setTheme(next)
    const x = origin?.x ?? window.innerWidth / 2
    const y = origin?.y ?? 0
    liquidSwitch(x, y, () => {
      document.documentElement.dataset.theme = next
      flushSync(() => setTheme(next))
    })
  }, [])
  /** Pick 'light', 'dark' or 'auto' (day and night by the clock). */
  const switchTheme = useCallback(
    (mode, origin) => {
      setThemeMode(mode)
      showTheme(resolveTheme(mode, new Date(), place), origin)
    },
    [showTheme, place],
  )
  // Auto: find out roughly where the user is (once a week), so it follows their sunrise and sunset
  useEffect(() => {
    if (themeMode !== 'auto') return undefined
    let alive = true
    locate().then((p) => alive && setPlace(p))
    return () => {
      alive = false
    }
  }, [themeMode])
  // ...then switch at sunrise and sunset, and check again when the tab comes back after a sleep
  useEffect(() => {
    if (themeMode !== 'auto') return undefined
    let timer = 0
    const check = () => {
      const now = new Date()
      showTheme(resolveTheme('auto', now, place))
      rememberSun(now, place)
      window.clearTimeout(timer)
      timer = window.setTimeout(check, msUntilSwitch(now, place))
    }
    check()
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [themeMode, showTheme, place])
  // today's sunrise and sunset where the user is, for the Settings note
  const daylight = useMemo(() => (themeMode === 'auto' ? { ...lightHours(new Date(), place), city: place?.city ?? null } : null), [themeMode, place])

  /* ---------- intro choreography (plays on every fresh load) ---------- */
  const [bootKey, setBootKey] = useState(0)
  const [booting, setBooting] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setBooting(false), 3200)
    return () => window.clearTimeout(t)
  }, [bootKey])

  /* ---------- routing ---------- */
  const [route, setRoute] = useState(() => {
    stashInvite()
    return fromHash()
  })
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
  // friend transfers from before this moment aren't counted again (set when the data is cleared)
  const [socialSince, setSocialSince] = useState(null)
  // Grace's on-device models: the user's answers to flags, and their category corrections (the models are rebuilt from these)
  const [mlVerdicts, setMlVerdicts] = useState({})
  const [categoryCorrections, setCategoryCorrections] = useState([])
  // repeating transactions (rent, salary, subscriptions): the rules; the app adds each one on its date
  const [recurring, setRecurring] = useState([])
  // "remind me to cancel": a nudge on a day, for one subscription
  const [reminders, setReminders] = useState([])
  // the user's own debit and credit cards (a name and the last 4 digits only)
  const [myCards, setMyCards] = useState([])
  // which version of the bank and card terms the user agreed to, and when
  const [terms, setTerms] = useState(null)
  // net worth: things you own or owe (beyond cash, goals and investments) and a snapshot per month
  const [netWorth, setNetWorth] = useState({ items: [], history: [] })
  // income split: when pay lands, percentages go into pots and goals
  const [incomeSplit, setIncomeSplit] = useState(DEFAULT_SPLIT)
  // the last week a recap was sent for ("2026-W46")
  const [recapWeek, setRecapWeek] = useState(null)
  // Grace's suggestions the user said "not now" to, and whether the first-run tour is done
  const [suggestionsDismissed, setSuggestionsDismissed] = useState([])
  const [tourDone, setTourDone] = useState(false)
  // the friends' chat window (bottom left) is open: Grace steps aside
  const [chatOpen, setChatOpen] = useState(false)
  const ranRule = useRef(new Set())

  /* ---------- accounts (Supabase) ----------
     session: undefined while checking, null when logged out.
     loadedFor: the user id whose saved dashboard is in state. */
  const [session, setSession] = useState(accountsEnabled ? undefined : null)
  const [recovery, setRecovery] = useState(false)
  const [loadedFor, setLoadedFor] = useState(null)
  const [loadError, setLoadError] = useState('')
  // set (to when the copy was made) while showing this device's copy because there's no connection
  const [offlineSince, setOfflineSince] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  // exploring the sample dashboard without an account
  const [demo, setDemo] = useState(false)
  // a deactivated account's saved data, waiting for "Reactivate" (it isn't loaded into the app until then)
  const [paused, setPaused] = useState(null)
  // shown after deactivating or deleting: 'deactivated' | 'deleted'
  const [farewell, setFarewell] = useState(null)
  // set while an account is being deactivated or deleted, so autosave can't write it back
  const stopSaving = useRef(false)
  // this month's budgets (with what's spent) and the balance, for the locked-budget check on payments
  const spendRef = useRef({ budgets: [], balance: 0 })
  const splitRef = useRef({ split: DEFAULT_SPLIT, pots: [], goals: [] })
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
    setSocialSince(data.socialSince ?? null)
    setMlVerdicts(data.mlVerdicts ?? {})
    setCategoryCorrections(data.categoryCorrections ?? [])
    setRecurring(data.recurring ?? [])
    setReminders(data.reminders ?? [])
    setMyCards(data.cards ?? [])
    setTerms(data.terms ?? null)
    setNetWorth({ items: [], history: [], ...(data.netWorth ?? {}) })
    setIncomeSplit({ ...DEFAULT_SPLIT, ...(data.incomeSplit ?? {}) })
    setRecapWeek(data.recapWeek ?? null)
    setSuggestionsDismissed(data.suggestionsDismissed ?? [])
    setTourDone(Boolean(data.tourDone))
    ranRule.current = new Set()
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
        if (!alive) return
        // a deactivated account waits on the reactivate screen
        if (saved?.account?.status === 'deactivated') return setPaused(saved)
        const data = saved ?? freshState()
        if (!saved) await saveUserState(userId, data)
        if (!alive) return
        stopSaving.current = false
        applyState(data)
        setOfflineSince(null)
        setLoadedFor(userId)
        keepCopy(userId, data)
      })
      .catch((err) => {
        if (!alive) return
        // no connection: open this device's copy, read only, until it's back
        const copy = looksOffline(err) ? readCopy(userId) : null
        if (copy) {
          stopSaving.current = true
          applyState(copy.data)
          setOfflineSince(copy.at)
          setLoadedFor(userId)
          return
        }
        setLoadError(err?.message || 'Could not load your data.')
      })
    return () => {
      alive = false
    }
  }, [userId, loadedFor, applyState])

  // save the dashboard back to the account a moment after anything changes
  const saved = useMemo(
    () => ({
      balance,
      transactions,
      goals,
      budgets,
      bills,
      notifications,
      contacts,
      pots,
      activity,
      watchlist,
      holdings,
      guard,
      socialSince,
      mlVerdicts,
      categoryCorrections,
      recurring,
      reminders,
      cards: myCards,
      terms,
      netWorth,
      incomeSplit,
      recapWeek,
      suggestionsDismissed,
      tourDone,
    }),
    [
      balance,
      transactions,
      goals,
      budgets,
      bills,
      notifications,
      contacts,
      pots,
      activity,
      watchlist,
      holdings,
      guard,
      socialSince,
      mlVerdicts,
      categoryCorrections,
      recurring,
      reminders,
      myCards,
      terms,
      netWorth,
      incomeSplit,
      recapWeek,
      suggestionsDismissed,
      tourDone,
    ],
  )
  const [saveFailed, setSaveFailed] = useState(false)
  useEffect(() => {
    if (!offlineSince) return undefined
    const back = () => {
      stopSaving.current = false
      setOfflineSince(null)
      setLoadedFor(null)
    }
    window.addEventListener('online', back)
    return () => window.removeEventListener('online', back)
  }, [offlineSince])
  useEffect(() => {
    if (!accountsEnabled || !userId || loadedFor !== userId) return undefined
    const h = window.setTimeout(() => {
      if (stopSaving.current) return
      const data = Object.fromEntries(SAVED_KEYS.map((k) => [k, saved[k]]))
      saveUserState(userId, data)
        .then(() => {
          setSaveFailed(false)
          keepCopy(userId, data)
        })
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

  /* a payment that would use money locked for other categories: say why, and that nothing was taken */
  const declined = useCallback(
    (check, amount, category) => {
      const names = check.blockedBy.map((r) => t(r.name)).join(', ')
      toast(
        t('Payment declined'),
        category
          ? t('{amount} for {category} would use money locked for {names}. Free to spend: {free}.', {
              amount: money(amount),
              category: t(category),
              names,
              free: money(check.free),
            })
          : t('{amount} would use money locked for {names}. Free to spend: {free}.', { amount: money(amount), names, free: money(check.free) }),
        { icon: 'lock', ms: 6000 },
      )
      notify({
        icon: 'lock',
        tone: 'red',
        title: 'Payment declined: {amount}',
        body: 'It would use money locked for {names}',
        vars: { amount: money(amount), names },
      })
    },
    [notify, toast],
  )

  /** Returns false (and takes nothing) when the transfer would dip into money locked for a budget. */
  const sendMoney = useCallback(
    ({ to, amount, note }) => {
      const check = checkPayment({ ...spendRef.current, amount, card: false })
      if (!check.ok) {
        declined(check, amount)
        return false
      }
      setBalance((b) => b - amount)
      setSentToday((s) => s + amount)
      addTx({ name: `Transfer to ${to}`, category: 'Transfer', kind: 'transfer', method: `${BRAND.name} Pay`, amount: -amount, note })
      notify({ icon: 'arrowUpRight', tone: 'accent', title: 'You sent {amount}', body: 'To {name}', vars: { amount: money(amount), name: to } })
      toast(t('Transfer sent'), t('{amount} is on its way to {name}.', { amount: money(amount), name: to }), { icon: 'send' })
      return true
    },
    [addTx, notify, toast, declined],
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
  /** The user's answer to one of Grace's flags: 'benign' (stops that pattern alerting) or 'problem'. */
  const setFlagVerdict = useCallback(
    (flag, verdict) => setMlVerdicts((v) => ({ ...v, [flag.key]: { verdict, pattern: flag.pattern, at: new Date().toISOString() } })),
    [],
  )
  /** Fix the category of some transactions, and remember it so the categorizer learns. */
  const correctCategory = useCallback(
    ({ ids, text, from, to, similar }) => {
      const pick = new Set(ids)
      setTransactions((list) => list.map((x) => (pick.has(x.id) ? { ...x, category: to, kind: KIND_FOR[to] ?? x.kind } : x)))
      setCategoryCorrections((list) => [...list, { text, from, to, at: new Date().toISOString() }].slice(-500))
      if (similar) toast(t('Categories updated'), t('{n} transactions moved to {category}.', { n: pick.size, category: t(to) }), { icon: 'category' })
    },
    [toast],
  )

  /** Rollover on or off: what a budget doesn't use carries into next month, counted from the month it's turned on. */
  const toggleBudgetRollover = useCallback(
    (id) => {
      const b = budgets.find((x) => x.id === id)
      if (!b) return
      setBudgets((list) => list.map((x) => (x.id === id ? { ...x, rollover: !x.rollover, rollFrom: x.rollover ? undefined : monthKey() } : x)))
      toast(
        b.rollover ? t('Rollover off') : t('Rollover on'),
        b.rollover
          ? t('{name} starts each month at its limit again.', { name: t(b.name) })
          : t('Whatever {name} doesn’t use this month is added to next month.', { name: t(b.name) }),
        { icon: 'replay' },
      )
    },
    [budgets, toast],
  )

  /* ---------- repeating transactions ---------- */
  const addRecurring = useCallback(
    (input) => {
      const rule = makeRule({ ...input, id: uid() })
      if (!rule) return false
      setRecurring((list) => [...list, rule])
      toast(
        t('Repeat set up'),
        t('{name}: {amount}, {every}.', { name: rule.name, amount: money(Math.abs(rule.amount)), every: t(EVERY_LABEL[rule.every]).toLowerCase() }),
        {
          icon: 'replay',
        },
      )
      return true
    },
    [toast],
  )
  const toggleRecurring = useCallback(
    (id) =>
      setRecurring((list) =>
        list.map((r) => {
          if (r.id !== id) return r
          // coming back from a pause: don't add the runs that were missed, start from the next one
          if (!r.active) {
            const today = isoDay(new Date())
            let caught = { ...r, active: true }
            caught = runAll([caught], today).rules[0]
            return caught
          }
          return { ...r, active: false }
        }),
      ),
    [],
  )
  const removeRecurring = useCallback((id) => setRecurring((list) => list.filter((r) => r.id !== id)), [])
  const addReminder = useCallback(
    ({ key, name, day, charge, amount }) => {
      setReminders((list) => [...list.filter((r) => r.key !== key || r.done), { id: uid(), key, name, day, charge, amount, done: false }])
      toast(t('Reminder set'), t('I’ll remind you on {date}, before {name} charges you again.', { date: day, name }), { icon: 'bell' })
    },
    [toast],
  )
  const removeReminder = useCallback((id) => setReminders((list) => list.filter((r) => r.id !== id)), [])
  const acceptTerms = useCallback((version) => setTerms({ version, at: new Date().toISOString() }), [])
  /** Add one of the user's cards; returns false if it isn't usable or is already there. */
  const addCard = useCallback(
    (input) => {
      const card = makeCard({ ...input, id: uid() })
      if (!card) return false
      if (myCards.some((c) => c.last4 === card.last4 && c.network === card.network)) return false
      setMyCards((list) => [...list, card])
      toast(t('Card added'), t('{name} ending {digits}.', { name: card.label, digits: card.last4 }), { icon: 'card' })
      return true
    },
    [myCards, toast],
  )
  const removeCard = useCallback(
    (id) => {
      const c = myCards.find((x) => x.id === id)
      setMyCards((list) => list.filter((x) => x.id !== id))
      if (c)
        toast(
          t('Card removed'),
          t('{name} ending {digits} is gone. Its past payments stay in your transactions.', { name: c.label, digits: c.last4 }),
          { icon: 'trash' },
        )
    },
    [myCards, toast],
  )

  /** Add rows read from a bank statement. changeBalance: also move the balance by their total. Returns how many were added. */
  const importTransactions = useCallback(
    (rows, { changeBalance = false } = {}) => {
      const fresh = rows.map((r) => ({
        id: uid(),
        name: r.name,
        amount: r.amount,
        category: r.category,
        kind: KIND_FOR[r.category] ?? 'transfer',
        method: 'Imported',
        date: `${r.date}T12:00`,
        status: 'Completed',
      }))
      if (!fresh.length) return 0
      setTransactions((list) => [...fresh, ...list].sort((a, b) => String(b.date).localeCompare(String(a.date))))
      if (changeBalance) {
        const cents = fresh.reduce((sum, x) => sum + Math.round(x.amount * 100), 0)
        setBalance((b) => Math.round(b * 100 + cents) / 100)
      }
      toast(t('Import done'), fresh.length === 1 ? t('1 transaction added.') : t('{n} transactions added.', { n: fresh.length }), { icon: 'upload' })
      return fresh.length
    },
    [toast],
  )

  /** Lock (or unlock) a budget: its unspent money can then only go on card payments in its own category. */
  const toggleBudgetLock = useCallback(
    (id) => {
      const b = budgets.find((x) => x.id === id)
      if (!b) return
      setBudgets((list) => list.map((x) => (x.id === id ? { ...x, locked: !x.locked } : x)))
      toast(
        b.locked ? t('Budget unlocked') : t('Budget locked'),
        b.locked
          ? t('{name} money can be spent on anything again.', { name: t(b.name) })
          : t('What’s left of {name} can only be spent on {name} with your card.', { name: t(b.name) }),
        { icon: 'lock' },
      )
    },
    [budgets, toast],
  )

  /** A new budget for a category (one per category); returns false if it already has one. */
  const addBudget = useCallback(
    ({ name, limit, locked = false, rollover = false }) => {
      const clean = String(name ?? '')
        .trim()
        .slice(0, 40)
      if (!clean || budgets.some((b) => b.name.toLowerCase() === clean.toLowerCase())) return false
      setBudgets((list) => [
        ...list,
        {
          id: uid(),
          name: clean,
          icon: iconOfCategory(clean),
          limit: Math.max(1, Math.round(Number(limit) || 0)),
          locked: Boolean(locked),
          ...(rollover ? { rollover: true, rollFrom: monthKey() } : {}),
        },
      ])
      toast(t('Budget added'), t('{name}: {amount} a month.', { name: t(clean), amount: money(Math.round(Number(limit) || 0), '$', 0) }), {
        icon: 'pie',
      })
      return true
    },
    [budgets, toast],
  )
  const removeBudget = useCallback(
    (id) => {
      const b = budgets.find((x) => x.id === id)
      setBudgets((list) => list.filter((x) => x.id !== id))
      if (b)
        toast(t('Budget removed'), t('{name} isn’t tracked any more. Its spending is still in your transactions.', { name: t(b.name) }), {
          icon: 'trash',
        })
    },
    [budgets, toast],
  )

  /** When pay lands: move the set percentages into pots and goals. Returns what moved. */
  const splitIncome = useCallback(
    (amount, category) => {
      const { split, pots: potsNow, goals: goalsNow } = splitRef.current
      const moves = planSplit(amount, category, split, potsNow, goalsNow)
      if (!moves.length) return []
      const toPots = moves.filter((m) => m.kind === 'pot')
      const toGoals = moves.filter((m) => m.kind === 'goal')
      if (toPots.length)
        setPots((list) =>
          list.map((x) => {
            const m = toPots.find((y) => y.target === x.id)
            return m ? { ...x, amount: Math.round((x.amount + m.amount) * 100) / 100 } : x
          }),
        )
      if (toGoals.length) {
        setGoals((list) =>
          list.map((x) => {
            const m = toGoals.find((y) => y.target === x.id)
            return m ? { ...x, saved: Math.round((x.saved + m.amount) * 100) / 100 } : x
          }),
        )
        // goal money leaves the balance, like topping up a goal by hand
        const cents = toGoals.reduce((sum, m) => sum + Math.round(m.amount * 100), 0)
        setBalance((b) => Math.round(b * 100 - cents) / 100)
      }
      toast(t('Pay split'), moves.map((m) => `${t(m.name)} ${money(m.amount)}`).join(' · '), { icon: 'transfer', ms: 6000 })
      return moves
    },
    [toast],
  )

  /** "Not now" on one of Grace's suggestions: it doesn't come back. */
  const dismissSuggestion = useCallback((key) => setSuggestionsDismissed((list) => (list.includes(key) ? list : [...list, key].slice(-200))), [])

  const addWorthItem = useCallback((input) => {
    const item = makeItem({ ...input, id: uid() })
    if (!item) return false
    setNetWorth((w) => ({ ...w, items: [...w.items, item] }))
    return true
  }, [])
  const updateWorthItem = useCallback((id, input) => {
    let ok = false
    setNetWorth((w) => ({
      ...w,
      items: w.items.map((x) => {
        if (x.id !== id) return x
        const next = makeItem({ ...x, ...input, id })
        ok = Boolean(next)
        return next ?? x
      }),
    }))
    return ok
  }, [])
  const removeWorthItem = useCallback((id) => setNetWorth((w) => ({ ...w, items: w.items.filter((x) => x.id !== id) })), [])

  /** Record money in (amount > 0) or out (amount < 0) by hand. A card payment that would use
      money locked for another budget is declined: returns false and nothing changes. */
  const addTransaction = useCallback(
    ({ name, amount, category, date, method, note, potId }) => {
      if (amount < 0 && isCardMethod(method)) {
        const check = checkPayment({ ...spendRef.current, amount: -amount, category, card: true })
        if (!check.ok) {
          declined(check, -amount, category)
          return false
        }
      }
      setBalance((b) => Math.round((b + amount) * 100) / 100)
      // spending from a pot empties that pot first; the rest comes out of unassigned
      if (potId && amount < 0)
        setPots((list) => list.map((p) => (p.id === potId ? { ...p, amount: Math.max(0, Math.round((p.amount + amount) * 100) / 100) } : p)))
      addTx({ name, amount, category, kind: KIND_FOR[category] ?? 'transfer', method: method || 'Cash', date: date || localIso(), note })
      toast(amount > 0 ? t('Income added') : t('Expense added'), `${t(name)} · ${money(Math.abs(amount))}`, { icon: amount > 0 ? 'receive' : 'send' })
      if (amount > 0) splitIncome(amount, category)
      return true
    },
    [addTx, toast, declined, splitIncome],
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

  /* ---------- friends: chat, send, request and split with real accounts ---------- */
  const social = useSocial({
    enabled: accountsEnabled && !demo && Boolean(userId) && loadedFor === userId,
    userId,
    userName: session?.user ? profileOf(session.user).name : '',
    transactions,
    since: socialSince,
    setBalance,
    addTx,
    notify,
    toast,
  })

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

  /* ---------- background jobs (src/app/useBackgroundJobs.js) ---------- */
  // accounts: once this user's data is loaded; the demo and no-login mode: straight away
  const rulesReady = !accountsEnabled || isDemo || Boolean(userId && loadedFor === userId)
  useRepeatingRunner({ ready: rulesReady, recurring, setRecurring, ranRule, setTransactions, setBalance, splitIncome, notify })
  usePushPresence(accountsEnabled && !isDemo && Boolean(userId) && loadedFor === userId)
  useReminderNudges({ ready: rulesReady, reminders, setReminders, notify, toast })

  /* ---------- card top-ups: coming back from Stripe Checkout ----------
     Stripe sends the user back with ?paid=<session id>. The payments
     function checks that session is paid and belongs to this account; the
     transaction keeps the session id so the same payment never counts twice.
     The id waits in localStorage until it's counted, in case the check fails. */
  const paidFor = useRef(null)
  useEffect(() => {
    if (!accountsEnabled || !userId || loadedFor !== userId || paidFor.current === userId) return
    paidFor.current = userId
    const PENDING = 'ww-pending-pay'
    const keep = (v) => {
      try {
        if (v) localStorage.setItem(PENDING, v)
        else localStorage.removeItem(PENDING)
      } catch {
        /* storage blocked */
      }
    }
    let ret = takePaymentReturn()
    if (ret === 'cancel') {
      // a moment later, once the dashboard is on screen
      window.setTimeout(() => toast(t('Payment cancelled'), t('No money was taken from your card.'), { icon: 'info' }), 400)
      return
    }
    try {
      ret ||= localStorage.getItem(PENDING)
    } catch {
      /* storage blocked */
    }
    if (!ret) return
    keep(ret)
    confirmCardPayment(ret)
      .then((p) => {
        keep(null)
        if (transactions.some((x) => x.ref === p.id)) return
        const pot = pots.find((x) => x.id === p.potId)
        setBalance((b) => Math.round((b + p.amount) * 100) / 100)
        if (pot) setPots((list) => list.map((x) => (x.id === pot.id ? { ...x, amount: Math.round((x.amount + p.amount) * 100) / 100 } : x)))
        addTx({
          name: 'Card top-up',
          category: 'Other income',
          kind: 'request',
          method: p.test ? 'Card via Stripe (test)' : 'Card via Stripe',
          amount: p.amount,
          ref: p.id,
        })
        notify({ icon: 'arrowDown', tone: 'green', title: 'You added {amount}', body: 'Paid by card with Stripe', vars: { amount: money(p.amount) } })
        toast(
          t('Payment received'),
          pot
            ? t('{amount} from your card went into {name}.', { amount: money(p.amount), name: t(pot.name) })
            : t('{amount} from your card is in your balance.', { amount: money(p.amount) }),
          { icon: 'receive' },
        )
      })
      .catch((err) => {
        // a payment that isn't this account's, or doesn't exist, will never count: stop asking
        if ([400, 404].includes(err?.status)) keep(null)
        toast(
          t('Couldn’t confirm your payment'),
          err?.status === 409
            ? t('Stripe is still processing it. It’ll show up next time you open {brand}.', { brand: BRAND.name })
            : t('If money was taken, it’ll show up next time you open {brand}.', { brand: BRAND.name }),
          { icon: 'info' },
        )
      })
  }, [userId, loadedFor, transactions, pots, addTx, notify, toast])

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
    applyState({ ...freshState(), socialSince: new Date().toISOString() })
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
      dropCopies()
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
  useLayoutEffect(() => {
    spendRef.current = { budgets: stats.budgets, balance }
  }, [stats, balance])
  useLayoutEffect(() => {
    splitRef.current = { split: incomeSplit, pots, goals }
  }, [incomeSplit, pots, goals])

  useNetWorthSnapshot({ ready: rulesReady && !isDemo, balance, goals, holdings, netWorth, setNetWorth })
  useWeeklyRecap({ ready: rulesReady && !isDemo, recapWeek, setRecapWeek, transactions, budgets: stats.budgets, notify })

  // unusual spending, kept fresh (off the main thread for big accounts)
  const mlFlags = useMlFlags(transactions, mlVerdicts)
  const cards = useMemo(() => (isDemo ? seed.CARDS : myCards.map((c) => ({ ...c, holder: user.name }))), [isDemo, myCards, user])
  const wallets = useMemo(
    () => (isDemo ? seed.WALLETS : [{ code: 'USD', name: 'US Dollar', flag: 'us', amount: balance, usd: balance }]),
    [isDemo, balance],
  )

  /* ---------- account settings: export, deactivate, reactivate, delete ---------- */
  const exportData = useCallback(() => {
    const body = { app: BRAND.name, exportedAt: new Date().toISOString(), profile: { name: user.name, email: user.email }, data: saved }
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `watchdog-wallet-data-${localIso().slice(0, 10)}.json` })
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [saved, user])

  const deactivateAccount = useCallback(async () => {
    if (!userId) return
    stopSaving.current = true
    try {
      const data = Object.fromEntries(SAVED_KEYS.map((k) => [k, saved[k]]))
      await saveUserState(userId, { ...data, account: { status: 'deactivated', at: new Date().toISOString() } })
    } catch (err) {
      stopSaving.current = false
      throw err
    }
    setModal(null)
    setAiOpen(false)
    setFarewell('deactivated')
    setLoadedFor(null)
    dropCopies()
    const supabase = await getSupabase()
    await supabase.auth.signOut()
  }, [userId, saved])

  const reactivate = useCallback(async () => {
    if (!paused || !userId) return
    const data = { ...paused, account: { status: 'active', at: new Date().toISOString() } }
    await saveUserState(userId, data)
    stopSaving.current = false
    applyState(data)
    setPaused(null)
    setLoadedFor(userId)
  }, [paused, userId, applyState])

  const deleteAccount = useCallback(
    async (password) => {
      if (!userId) return
      await confirmPassword(user.email, password)
      stopSaving.current = true
      try {
        // photos and voice notes in chats go first: the account's files can't be removed once it's gone
        await removeAllMyMedia(userId).catch(() => null)
        await deleteMyAccount()
      } catch (err) {
        stopSaving.current = false
        throw err
      }
      setModal(null)
      setAiOpen(false)
      setLoadedFor(null)
      setPaused(null)
      setFarewell('deleted')
      dropCopies()
      try {
        ;['ww-locked', 'ww-grace-voice'].forEach((k) => localStorage.removeItem(k))
      } catch {
        /* nothing saved */
      }
    },
    [userId, user],
  )

  const ctx = useMemo(
    () => ({
      page: route.page,
      tab: route.tab,
      go,
      setTab,
      booting,
      theme,
      themeMode,
      daylight,
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
      exportData,
      deactivateAccount,
      deleteAccount,
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
      mlFlags,
      mlVerdicts,
      setFlagVerdict,
      categoryCorrections,
      correctCategory,
      addBudget,
      removeBudget,
      toggleBudgetLock,
      toggleBudgetRollover,
      recurring,
      addRecurring,
      toggleRecurring,
      removeRecurring,
      importTransactions,
      reminders,
      addReminder,
      removeReminder,
      addCard,
      removeCard,
      terms,
      acceptTerms,
      suggestionsDismissed,
      dismissSuggestion,
      tourDone,
      setTourDone,
      netWorth,
      addWorthItem,
      updateWorthItem,
      removeWorthItem,
      incomeSplit,
      setIncomeSplit,
      toast,
      openModal,
      social,
    }),
    [
      route,
      go,
      setTab,
      booting,
      theme,
      themeMode,
      daylight,
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
      exportData,
      deactivateAccount,
      deleteAccount,
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
      mlFlags,
      mlVerdicts,
      setFlagVerdict,
      categoryCorrections,
      correctCategory,
      addBudget,
      removeBudget,
      toggleBudgetLock,
      toggleBudgetRollover,
      recurring,
      addRecurring,
      toggleRecurring,
      removeRecurring,
      importTransactions,
      reminders,
      addReminder,
      removeReminder,
      addCard,
      removeCard,
      terms,
      acceptTerms,
      suggestionsDismissed,
      dismissSuggestion,
      tourDone,
      setTourDone,
      netWorth,
      addWorthItem,
      updateWorthItem,
      removeWorthItem,
      incomeSplit,
      setIncomeSplit,
      toast,
      openModal,
      social,
    ],
  )

  if (accountsEnabled && !demo) {
    if (farewell && !session)
      return (
        <div className="signed-out">
          <div className="so-card">
            <Logo size={60} />
            <h2>{farewell === 'deleted' ? t('Your account is deleted') : t('Your account is deactivated')}</h2>
            <p>
              {farewell === 'deleted'
                ? t('Your login and all your data are gone for good. Thanks for using {brand}.', { brand: BRAND.name })
                : t('Your data is kept safe. Log in again any time to reactivate your account.')}
            </p>
            <button type="button" className="btn solid lg" onClick={() => setFarewell(null)}>
              {t('Back to log in')}
            </button>
          </div>
        </div>
      )
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
    if (paused)
      return (
        <div className="signed-out">
          <div className="so-card">
            <Logo size={60} />
            <h2>{t('Welcome back')}</h2>
            <p>{t('Your account is deactivated. Reactivate it to pick up where you left off: all your data is still here.')}</p>
            <button
              type="button"
              className="btn solid lg"
              onClick={() =>
                reactivate().catch(() => toast(t('Couldn’t reactivate'), t('Something went wrong. Try again in a minute.'), { icon: 'info' }))
              }
            >
              {t('Reactivate my account')}
            </button>
            <button type="button" className="link" onClick={() => (setPaused(null), signOut())}>
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
      <FriendPayModal open={modal?.type === 'friendPay'} payload={modal?.payload} onClose={closeModal} />
      <FriendAskModal open={modal?.type === 'friendAsk'} payload={modal?.payload} onClose={closeModal} />
      <SplitModal open={modal?.type === 'split'} payload={modal?.payload} onClose={closeModal} />
      <GroupModal open={modal?.type === 'newGroup'} onClose={closeModal} />
      <SettleModal open={modal?.type === 'settle'} payload={modal?.payload} onClose={closeModal} />
      <GroupGoalsModal open={modal?.type === 'groupGoals'} payload={modal?.payload} onClose={closeModal} />
      <TermsModal open={modal?.type === 'terms'} onClose={closeModal} />
      <IncomeSplitModal open={modal?.type === 'split-income'} onClose={closeModal} />
      <RecurringModal open={modal?.type === 'recurring'} onClose={closeModal} />
      <ImportModal open={modal?.type === 'import'} payload={modal?.payload} onClose={closeModal} />
      <GuardModal open={modal?.type === 'guard'} onClose={closeModal} />
      <AccountModal open={modal?.type === 'account'} onClose={closeModal} />
      <ProfileModal open={modal?.type === 'profile'} onClose={closeModal} />
      {hidden && !lock ? (
        <div className="guard-veil" aria-hidden="true">
          <span>
            <Icon name="eyeOff" size={18} /> {t('Hidden by {name} while you’re away', { name: ASSISTANT.name })}
          </span>
        </div>
      ) : null}
      {lock ? <LockScreen user={user} demo={isDemo} reason={lock} onUnlock={unlock} onSignOut={signOut} /> : null}
      {accountsEnabled && !isDemo && userId && loadedFor === userId && !tourDone && !lock && !booting ? (
        <Suspense fallback={null}>
          <Tour onOpenAssistant={() => openAssistant()} />
        </Suspense>
      ) : null}
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
          {/* out of the way of friends' chats: hidden on the Friends page and while the chat window is open */}
          <Buddy key={`codi-${bootKey}`} hidden={aiOpen || Boolean(lock) || route.page === 'friends' || chatOpen} onOpen={openAssistant} />
          <Assistant open={aiOpen && !lock} onClose={closeAssistant} prompt={lock ? null : aiAsk} />
        </Suspense>
      ) : null}
      {social.enabled && social.setup && route.page !== 'friends' && !lock ? (
        <Suspense fallback={null}>
          <MessengerDock onOpenChange={setChatOpen} />
        </Suspense>
      ) : null}
      {offlineSince ? (
        <div className="save-warn offline-bar" role="status">
          {t('You’re offline. Showing your data from {when}. Changes won’t be saved until you’re back online.', {
            when: new Date(offlineSince).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
          })}
        </div>
      ) : saveFailed ? (
        <div className="save-warn" role="status">
          {t('Changes aren’t saving right now. Check your connection.')}
        </div>
      ) : null}
      <Toasts items={toasts} onDismiss={dismiss} />
    </AppContext.Provider>
  )
}
