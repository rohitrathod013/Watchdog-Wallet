import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

import TopBar from './components/TopBar'
import { BillModal, ContactModal, GoalModal, ReceiveModal, RequestModal, SendModal, TransactionModal } from './components/Modals'
import { Toasts } from './components/ui'
import { Logo } from './components/Brand'

import Dashboard from './pages/Dashboard'

import { AppContext } from './lib/store'
import { PAGES, TABS } from './lib/routes'
import { liquidSwitch } from './lib/themeTransition'
import { localIso, MONTHS, money, uid } from './lib/format'
import { accountCards, billDue, computeStats, DEFAULT_BUDGETS, demoStats, KIND_FOR } from './lib/stats'
import { LOCALES, setLocale, t, tMonths } from './lib/i18n'
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
const freshState = () => ({
  balance: 0,
  transactions: [],
  goals: [],
  budgets: DEFAULT_BUDGETS,
  bills: [],
  contacts: [],
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

/* The demo: the full sample dashboard, never saved anywhere. */
const demoState = () => ({
  balance: seed.BALANCE_USD,
  transactions: seed.TRANSACTIONS,
  goals: seed.GOALS,
  budgets: seed.BUDGETS,
  bills: seed.BILLS,
  contacts: seed.CONTACTS,
  notifications: seed.NOTIFICATIONS,
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
    /* private mode — preferences just will not persist */
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
    setDrift(0)
    setSentToday(0)
  }, [])

  useEffect(() => {
    if (!accountsEnabled) return undefined
    let unsub = null
    let alive = true
    getSupabase().then((supabase) => {
      if (!alive) return
      supabase.auth.getSession().then(({ data }) => alive && setSession(data.session ?? null))
      const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
        setSession(s ?? null)
        if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      })
      unsub = () => sub.subscription.unsubscribe()
    })
    return () => {
      alive = false
      unsub?.()
    }
  }, [])

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
    () => ({ balance, transactions, goals, budgets, bills, notifications, contacts }),
    [balance, transactions, goals, budgets, bills, notifications, contacts],
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
  const openAssistant = useCallback(() => setAiOpen(true), [])
  const closeAssistant = useCallback(() => setAiOpen(false), [])
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
    ({ name, target, saved, icon }) => {
      const monthly = Math.max(50, Math.round(target / 24 / 10) * 10)
      const at = new Date()
      at.setMonth(at.getMonth() + Math.max(1, Math.ceil((target - saved) / monthly)))
      setGoals((g) => [...g, { id: uid(), name, target, saved, icon, monthly, due: `${MONTHS[at.getMonth()]} ${at.getFullYear()}` }])
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
    ({ name, amount, category, date, method, note }) => {
      setBalance((b) => Math.round((b + amount) * 100) / 100)
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

  /** Wipe this account back to a fresh, empty dashboard. */
  const clearData = useCallback(() => {
    applyState(freshState())
    toast(t('Your data was cleared'), t('You’re starting fresh.'), { icon: 'trash' })
  }, [applyState, toast])

  const enterDemo = useCallback(() => {
    applyState(demoState())
    setDemo(true)
    window.history.replaceState(null, '', '#/dashboard')
    setRoute({ page: 'dashboard', tab: 'overview' })
  }, [applyState])

  const leaveDemo = useCallback((mode = 'login') => {
    setModal(null)
    setAiOpen(false)
    setDemo(false)
    setAuthMode(mode)
  }, [])

  const signOut = useCallback(() => {
    setModal(null)
    setAiOpen(false)
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
      contacts,
      period,
      setPeriod,
      currency,
      setCurrency,
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
      contacts,
      period,
      currency,
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
      <div className={`shell ${booting ? 'booting' : ''}`} key={bootKey}>
        <TopBar />
        <main className="main" key={route.page}>
          <Suspense fallback={null}>
            <Page />
          </Suspense>
        </main>
      </div>

      <SendModal open={modal?.type === 'send'} payload={modal?.payload} onClose={closeModal} />
      <ReceiveModal open={modal?.type === 'receive'} onClose={closeModal} />
      <RequestModal open={modal?.type === 'request'} onClose={closeModal} />
      <GoalModal open={modal?.type === 'goal'} onClose={closeModal} />
      <TransactionModal open={modal?.type === 'transaction'} payload={modal?.payload} onClose={closeModal} />
      <ContactModal open={modal?.type === 'contact'} payload={modal?.payload} onClose={closeModal} />
      <BillModal open={modal?.type === 'bill'} onClose={closeModal} />
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
          <Buddy key={`codi-${bootKey}`} hidden={aiOpen} onOpen={openAssistant} />
          <Assistant open={aiOpen} onClose={closeAssistant} />
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
