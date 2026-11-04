import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

import TopBar from './components/TopBar'
import { GoalModal, ReceiveModal, RequestModal, SendModal } from './components/Modals'
import { Toasts } from './components/ui'
import { Logo } from './components/Brand'

import Dashboard from './pages/Dashboard'

import { AppContext } from './lib/store'
import { PAGES, TABS } from './lib/routes'
import { liquidSwitch } from './lib/themeTransition'
import { localIso, money, uid } from './lib/format'
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

const PAGE_VIEWS = { dashboard: Dashboard, analytics: Analytics, transfer: Transfer, wallet: Wallet, budget: Budget }

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
  const [lang, setLang] = useState('EN')

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
  const [live, setLive] = useState(FEATURES.liveUpdates)
  const [transactions, setTransactions] = useState(seed.TRANSACTIONS)
  const [goals, setGoals] = useState(seed.GOALS)
  const [budgets, setBudgets] = useState(seed.BUDGETS)
  const [bills, setBills] = useState(seed.BILLS)
  const [notifications, setNotifications] = useState(seed.NOTIFICATIONS)
  const [sentToday, setSentToday] = useState(0)

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
    if (!live || signedOut) return undefined
    const t = window.setInterval(() => {
      const drift = Math.round((Math.random() * 260 - 60) * 100) / 100
      setBalance((b) => Math.round((b + drift) * 100) / 100)
    }, 5200)
    return () => window.clearInterval(t)
  }, [live, signedOut])

  /* ---------- actions shared across pages ---------- */
  const addTx = useCallback((row) => setTransactions((list) => [{ id: uid(), date: localIso(), status: 'Completed', ...row }, ...list]), [])
  const notify = useCallback((n) => setNotifications((list) => [{ id: uid(), time: 'Now', unread: true, ...n }, ...list]), [])

  const sendMoney = useCallback(
    ({ to, amount, note }) => {
      setBalance((b) => b - amount)
      setSentToday((s) => s + amount)
      addTx({ name: `Transfer to ${to}`, category: 'Transfer', kind: 'transfer', method: `${BRAND.name} Pay`, amount: -amount, note })
      notify({ icon: 'arrowUpRight', tone: 'accent', title: `You sent ${money(amount)}`, body: `To ${to}` })
      toast('Transfer sent', `${money(amount)} is on its way to ${to}.`, { icon: 'send' })
    },
    [addTx, notify, toast],
  )

  const requestMoney = useCallback(
    ({ from, amount, note }) => {
      addTx({ name: `Request from ${from}`, category: 'Transfer', kind: 'request', method: `${BRAND.name} Pay`, amount, status: 'Pending', note })
      toast('Request sent', `${from} will get a request for ${money(amount)}.`, { icon: 'request' })
    },
    [addTx, toast],
  )

  const receiveMoney = useCallback(() => {
    const who = seed.CONTACTS[Math.floor(Math.random() * seed.CONTACTS.length)]
    const amount = Math.round((120 + Math.random() * 780) * 100) / 100
    setBalance((b) => b + amount)
    addTx({ name: `Payment from ${who.name}`, category: 'Transfer', kind: 'request', method: `${BRAND.name} Pay`, amount })
    notify({ icon: 'arrowDown', tone: 'green', title: `You received ${money(amount)}`, body: `From ${who.name}` })
    toast('Money received', `${who.name} sent you ${money(amount)}.`, { icon: 'receive' })
  }, [addTx, notify, toast])

  const payBill = useCallback(
    (id) => {
      const bill = bills.find((b) => b.id === id)
      if (!bill || bill.paid) return
      setBills((list) => list.map((b) => (b.id === id ? { ...b, paid: true } : b)))
      setBalance((b) => b - bill.amount)
      addTx({ name: bill.name, category: 'Bills', kind: bill.kind, method: 'Autopay', amount: -bill.amount })
      toast(`${bill.name} paid`, `${money(bill.amount)} paid ahead of ${bill.due}.`, { icon: 'check' })
    },
    [bills, addTx, toast],
  )

  const addGoal = useCallback(
    ({ name, target, saved, icon }) => {
      setGoals((g) => [...g, { id: uid(), name, target, saved, icon, monthly: Math.max(50, Math.round(target / 24 / 10) * 10), due: 'Oct 2028' }])
      toast('Goal created', `${name} — ${money(target, '$', 0)} target. You’ve got this!`, { icon: 'target' })
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
      if (g.saved + add >= g.target) toast('Goal reached! 🎉', `${g.name} is fully funded.`, { icon: 'trophy' })
      else toast(`Added ${money(add, '$', 0)}`, `${g.name} is now at ${Math.round(((g.saved + add) / g.target) * 100)}%.`, { icon: 'sack' })
    },
    [goals, toast],
  )

  const removeGoal = useCallback(
    (id) => {
      const g = goals.find((x) => x.id === id)
      setGoals((list) => list.filter((x) => x.id !== id))
      if (g) toast('Goal removed', `${g.name} was archived.`, { icon: 'trash' })
    },
    [goals, toast],
  )

  const setBudgetLimit = useCallback((id, limit) => setBudgets((list) => list.map((b) => (b.id === id ? { ...b, limit } : b))), [])

  const signOut = useCallback(() => {
    setModal(null)
    setSignedOut(true)
  }, [])
  const replayIntro = useCallback(() => {
    setBooting(true)
    setBootKey((k) => k + 1)
    window.scrollTo({ top: 0 })
  }, [])
  const signIn = useCallback(() => {
    setSignedOut(false)
    replayIntro()
  }, [replayIntro])

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
      user: seed.USER,
      contacts: seed.CONTACTS,
      period,
      setPeriod,
      currency,
      setCurrency,
      balance,
      live,
      setLive,
      openAssistant,
      transactions,
      goals,
      budgets,
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
      period,
      currency,
      balance,
      live,
      openAssistant,
      transactions,
      goals,
      budgets,
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

  if (signedOut) {
    return (
      <div className="signed-out">
        <div className="so-card">
          <Logo size={60} />
          <h2>You’re signed out</h2>
          <p>Thanks for stopping by, {seed.USER.first}. Your session ended safely and your data stays encrypted.</p>
          <button type="button" className="btn solid lg" onClick={signIn}>
            Sign back in
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
      {ASSISTANT.enabled ? (
        <Suspense fallback={null}>
          <Buddy key={`codi-${bootKey}`} hidden={aiOpen} onOpen={openAssistant} />
          <Assistant open={aiOpen} onClose={closeAssistant} />
        </Suspense>
      ) : null}
      <Toasts items={toasts} onDismiss={dismiss} />
    </AppContext.Provider>
  )
}
