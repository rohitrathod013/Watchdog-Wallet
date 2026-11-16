/* ------------------------------------------------------------------
   Accounts, planning and the other money tools that came later, in one
   hook so App.jsx stays readable. It owns their saved state and the
   actions that change it; App passes in the setters it shares.

   Saved with the account (see SAVED_KEYS in lib/supabase.js):
     accounts        where money sits: checking, savings, cash, credit cards
     savedSearches   searches kept on the Transactions tab
     budgetPause     a trip or holiday when budgets don't count
     paycheck        the paycheque breakdown's numbers
     challenges      no-spend weeks and the 52-week plan
     investLog       realised gains and dividends
     splitRules      monthly splits with friends (rent, utilities)
     nudged          card due-date reminders already shown
     reconciled      when each account last matched its bank statement
   ------------------------------------------------------------------ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isoDay, localIso, money, uid } from '../lib/format'
import { t } from '../lib/i18n'
import { KIND_FOR } from '../lib/stats'
import { accountBalances, cardsDueSoon, inRange, makeAccount, makePause, makeSearch, MAIN, transferPair } from '../lib/ledger'
import { DEFAULT_PAYCHECK, nextYear } from '../lib/planning'
import { dueSplits } from '../lib/social'

const EMPTY_LOG = { realised: [], dividends: [] }
const r2 = (n) => Math.round(n * 100) / 100

/* bridge: a ref App fills with { addTx, toast, notify } once they exist (they're made further down in App) */
export function useMoreMoney({ balance, setBalance, transactions, setTransactions, goals, setGoals, bridge }) {
  // made once; each one looks up App's function when it's called
  const [{ addTx, toast, notify }] = useState(() => ({
    addTx: (...a) => bridge.current.addTx?.(...a),
    toast: (...a) => bridge.current.toast?.(...a),
    notify: (...a) => bridge.current.notify?.(...a),
  }))
  const [accounts, setAccounts] = useState([])
  const [savedSearches, setSavedSearches] = useState([])
  const [budgetPause, setBudgetPauseState] = useState(null)
  const [paycheck, setPaycheck] = useState(DEFAULT_PAYCHECK)
  const [challenges, setChallenges] = useState([])
  const [investLog, setInvestLog] = useState(EMPTY_LOG)
  const [splitRules, setSplitRules] = useState([])
  const [nudged, setNudged] = useState([])
  const [reconciled, setReconciled] = useState({})

  /** Load what an account saved (or the defaults for a new one). */
  const apply = useCallback((data) => {
    setAccounts(data.accounts ?? [])
    setSavedSearches(data.savedSearches ?? [])
    setBudgetPauseState(data.budgetPause ?? null)
    setPaycheck({ ...DEFAULT_PAYCHECK, ...(data.paycheck ?? {}) })
    setChallenges(data.challenges ?? [])
    setInvestLog({ ...EMPTY_LOG, ...(data.investLog ?? {}) })
    setSplitRules(data.splitRules ?? [])
    setNudged(data.nudged ?? [])
    setReconciled(data.reconciled ?? {})
  }, [])

  const saved = useMemo(
    () => ({ accounts, savedSearches, budgetPause, paycheck, challenges, investLog, splitRules, nudged, reconciled }),
    [accounts, savedSearches, budgetPause, paycheck, challenges, investLog, splitRules, nudged, reconciled],
  )

  const balances = useMemo(() => accountBalances(accounts, transactions, balance), [accounts, transactions, balance])
  const nameOf = useCallback((id) => (id === MAIN ? t('Main account') : (accounts.find((a) => a.id === id)?.name ?? t('Main account'))), [accounts])

  /* ---------------- accounts ---------------- */
  /** A new account. Its opening balance is money the app didn't know about, so it's added to the balance. */
  const addAccount = useCallback(
    (input) => {
      const acc = makeAccount({ ...input, id: uid() })
      if (!acc) return null
      setAccounts((list) => [...list, acc])
      if (acc.opening) setBalance((b) => r2(b + acc.opening))
      toast(t('Account added'), acc.opening ? `${acc.name} · ${money(acc.opening)}` : acc.name, { icon: 'wallet' })
      return acc
    },
    [setBalance, toast],
  )
  const updateAccount = useCallback(
    (id, input) => {
      const old = accounts.find((a) => a.id === id)
      if (!old) return false
      const next = makeAccount({ ...old, ...input, id, type: old.type })
      if (!next) return false
      setAccounts((list) => list.map((a) => (a.id === id ? { ...a, ...next, reconciled: a.reconciled } : a)))
      // a corrected opening balance moves the total by the difference
      const diff = r2(next.opening - old.opening)
      if (diff) setBalance((b) => r2(b + diff))
      return true
    },
    [accounts, setBalance],
  )
  /** Remove an account: its transactions and money become part of the main account (the total doesn't change). */
  const removeAccount = useCallback(
    (id) => {
      const acc = accounts.find((a) => a.id === id)
      setAccounts((list) => list.filter((a) => a.id !== id))
      setTransactions((list) =>
        list.map((x) => {
          if (x.account !== id) return x
          const rest = { ...x }
          delete rest.account
          return rest
        }),
      )
      if (acc) toast(t('Account removed'), t('{name}’s transactions are now in your main account.', { name: acc.name }), { icon: 'trash' })
    },
    [accounts, setTransactions, toast],
  )
  /** Move money between two accounts (ATM withdrawals, paying a card, saving). The total doesn't change. */
  const moveBetween = useCallback(
    ({ from, to, amount, note = '' }) => {
      const names = { [from]: nameOf(from), [to]: nameOf(to) }
      const pair = transferPair({ from, to, amount, date: localIso(), note, names }, uid)
      if (!pair.length) return false
      setTransactions((list) => [...pair.reverse(), ...list])
      toast(t('Money moved'), t('{amount} from {from} to {to}.', { amount: money(amount), from: names[from], to: names[to] }), { icon: 'transfer' })
      return true
    },
    [nameOf, setTransactions, toast],
  )
  /** The last time each account matched its statement: { [id]: { at, statement } } */
  const finishReconcile = useCallback((id, statement) => setReconciled((m) => ({ ...m, [id]: { at: localIso(), statement: Number(statement) } })), [])

  /* ---------------- one transaction ---------------- */
  /** Change one transaction's details: note, tags, account, cleared, claim, receipt, category. */
  const updateTx = useCallback(
    (id, patch) => setTransactions((list) => list.map((x) => (x.id === id ? { ...x, ...patch, kind: patch.category ? (KIND_FOR[patch.category] ?? x.kind) : x.kind } : x))),
    [setTransactions],
  )
  /** Delete one transaction. adjust: also undo what it did to the balance. */
  const deleteTx = useCallback(
    (id, { adjust = false } = {}) => {
      const x = transactions.find((y) => y.id === id)
      if (!x) return
      // a move between accounts goes with its other half
      setTransactions((list) => list.filter((y) => y.id !== id && !(x.pair && y.pair === x.pair)))
      if (adjust && !x.pair && x.status !== 'Pending' && x.status !== 'Failed') setBalance((b) => r2(b - x.amount))
      toast(t('Transaction deleted'), `${x.name} · ${money(Math.abs(x.amount))}`, { icon: 'trash' })
    },
    [transactions, setTransactions, setBalance, toast],
  )
  /** Delete every transaction between two days. Returns how many went. The balance isn't changed. */
  const deleteRange = useCallback(
    (from, to) => {
      const { hit } = inRange(transactions, from, to)
      if (!hit.length) return 0
      const gone = new Set(hit.map((x) => x.id))
      setTransactions((list) => list.filter((x) => !gone.has(x.id)))
      toast(t('Transactions deleted'), t('{n} transactions removed. Your balance didn’t change.', { n: hit.length }), { icon: 'trash' })
      return hit.length
    },
    [transactions, setTransactions, toast],
  )
  /** Money claimed back (from work or a friend) arrived: record it and close the claim. */
  const claimPaid = useCallback(
    (id) => {
      const x = transactions.find((y) => y.id === id)
      if (!x?.claim || x.claim.status === 'paid') return
      const amount = r2(Math.abs(Number(x.claim.amount ?? x.amount)))
      setTransactions((list) => list.map((y) => (y.id === id ? { ...y, claim: { ...y.claim, status: 'paid', paidAt: localIso() } } : y)))
      setBalance((b) => r2(b + amount))
      addTx({ name: `Paid back: ${x.name}`, amount, category: 'Other income', kind: 'request', method: x.claim.from || 'Reimbursement', ...(x.account ? { account: x.account } : {}) })
      toast(t('Paid back'), t('{amount} from {name} is in your balance.', { amount: money(amount), name: x.claim.from || t('them') }), { icon: 'receive' })
    },
    [transactions, setTransactions, setBalance, addTx, toast],
  )

  /* ---------------- saved searches ---------------- */
  const saveSearch = useCallback((input) => {
    const s = makeSearch({ ...input, id: uid() })
    if (!s) return false
    setSavedSearches((list) => [...list.filter((x) => x.name.toLowerCase() !== s.name.toLowerCase()), s].slice(-20))
    return true
  }, [])
  const removeSearch = useCallback((id) => setSavedSearches((list) => list.filter((x) => x.id !== id)), [])

  /* ---------------- pausing budgets ---------------- */
  const setBudgetPause = useCallback(
    (input) => {
      if (!input) {
        setBudgetPauseState(null)
        toast(t('Budgets back on'), t('Spending counts against your budgets again.'), { icon: 'pie' })
        return true
      }
      const p = makePause(input)
      if (!p) return false
      setBudgetPauseState(p)
      toast(t('Budgets paused'), t('Spending from {from} to {to} won’t count against them.', { from: p.from, to: p.to }), { icon: 'plane' })
      return true
    },
    [toast],
  )

  /* ---------------- sinking funds (goals with a yearly due date) ---------------- */
  /** The yearly cost came: record it as spending (the money already left the balance into the fund) and start again for next year. */
  const paySinking = useCallback(
    (id) => {
      const g = goals.find((x) => x.id === id)
      if (!g?.sinking) return
      const paid = r2(Math.min(g.saved, g.target))
      setGoals((list) => list.map((x) => (x.id === id ? { ...x, saved: r2(x.saved - paid), dueDate: nextYear(x.dueDate) } : x)))
      if (paid > 0) addTx({ name: g.name, amount: -paid, category: g.category ?? 'Bills', kind: KIND_FOR[g.category] ?? 'wifi', method: 'Sinking fund' })
      // what the fund didn't cover comes out of the balance now
      const short = r2(g.target - paid)
      if (short > 0) {
        setBalance((b) => r2(b - short))
        addTx({ name: `${g.name} (rest)`, amount: -short, category: g.category ?? 'Bills', kind: KIND_FOR[g.category] ?? 'wifi', method: 'Main account' })
      }
      toast(t('Paid from your fund'), t('{name} is paid. Saving for next year starts now.', { name: g.name }), { icon: 'check' })
    },
    [goals, setGoals, setBalance, addTx, toast],
  )

  /* ---------------- challenges ---------------- */
  const startChallenge = useCallback(
    (type, opts = {}) => {
      const ch =
        type === 'week52'
          ? { id: uid(), type, start: isoDay(new Date()), step: Math.max(0.5, Number(opts.step) || 1), saved: [] }
          : { id: uid(), type: 'nospend', start: isoDay(new Date()), days: Math.min(31, Math.max(3, Number(opts.days) || 7)) }
      setChallenges((list) => [...list.filter((x) => x.type !== ch.type), ch])
      toast(t('Challenge started'), type === 'week52' ? t('Week 1: put aside {amount}.', { amount: money(ch.step) }) : t('{n} days without spending on extras. You can do it!', { n: ch.days }), {
        icon: 'trophy',
      })
    },
    [toast],
  )
  const stopChallenge = useCallback((id) => setChallenges((list) => list.filter((x) => x.id !== id)), [])
  /** Put aside week n of the 52-week plan: the money goes into its own goal. */
  const saveWeek = useCallback(
    (id, week) => {
      const ch = challenges.find((x) => x.id === id)
      if (!ch || ch.saved.includes(week)) return
      const amount = r2((ch.step || 1) * week)
      const goalName = '52-week challenge'
      setGoals((list) => {
        const g = list.find((x) => x.challenge === id)
        if (g) return list.map((x) => (x === g ? { ...x, saved: r2(x.saved + amount) } : x))
        return [...list, { id: uid(), name: goalName, target: r2(((ch.step || 1) * 52 * 53) / 2), saved: amount, icon: 'trophy', monthly: r2((ch.step || 1) * 26 * 4.33), due: '', challenge: id }]
      })
      setBalance((b) => r2(b - amount))
      setChallenges((list) => list.map((x) => (x.id === id ? { ...x, saved: [...x.saved, week].sort((a, b) => a - b) } : x)))
      toast(t('Week {n} done', { n: week }), t('{amount} put aside.', { amount: money(amount) }), { icon: 'sack' })
    },
    [challenges, setGoals, setBalance, toast],
  )

  /* ---------------- dividends ---------------- */
  const addDividend = useCallback(
    ({ holding, amount, date }) => {
      const n = r2(Number(amount))
      if (!(n > 0) || !holding) return false
      const at = date && date !== isoDay(new Date()) ? `${date}T12:00` : localIso()
      setBalance((b) => r2(b + n))
      addTx({ name: `Dividend: ${holding.symbol}`, amount: n, category: 'Dividends', kind: 'business', method: 'Portfolio', date: at })
      setInvestLog((log) => ({ ...log, dividends: [...log.dividends, { id: uid(), symbol: holding.symbol, asset: `${holding.kind}:${holding.asset}`, amount: n, at }].slice(-500) }))
      toast(t('Dividend recorded'), t('{amount} from {name}.', { amount: money(n), name: holding.name }), { icon: 'receive' })
      return true
    },
    [setBalance, addTx, toast],
  )

  /* ---------------- monthly splits ---------------- */
  const addSplitRule = useCallback((rule) => {
    const day = Math.min(28, Math.max(1, new Date().getDate()))
    const now = new Date()
    const next = isoDay(new Date(now.getFullYear(), now.getMonth() + 1, Math.min(day, new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate())))
    setSplitRules((list) => [...list, { id: uid(), active: true, day, next, ...rule }])
  }, [])
  const removeSplitRule = useCallback((id) => setSplitRules((list) => list.filter((r) => r.id !== id)), [])

  /* ---------------- background: card reminders ---------------- */
  const noted = useRef(new Set())
  useEffect(() => {
    const due = cardsDueSoon(accounts, balances, nudged).filter((x) => !noted.current.has(x.key))
    if (!due.length) return
    for (const x of due) noted.current.add(x.key)
    for (const { acc, cyc } of due)
      notify({
        icon: 'card',
        tone: 'amber',
        title: '{name} payment due {when}',
        body: '{amount} owed. Pay it in full to avoid interest.',
        vars: {
          name: acc.name,
          when: cyc.dueIn === 0 ? t('today') : cyc.dueIn === 1 ? t('tomorrow') : t('in {n} days', { n: cyc.dueIn }),
          amount: money(cyc.owed),
        },
      })
    setNudged((list) => [...list, ...due.map((x) => x.key)].slice(-100))
  }, [accounts, balances, nudged, notify])

  return {
    apply,
    saved,
    setInvestLog,
    /** run monthly splits whose day came (needs the friends connection, so App calls it) */
    takeDueSplits: () => {
      const { due, rules } = dueSplits(splitRules, isoDay(new Date()))
      if (due.length) setSplitRules(rules)
      return due
    },
    ctx: {
      moneyAccounts: accounts,
      balances,
      accountName: nameOf,
      addAccount,
      updateAccount,
      removeAccount,
      moveBetween,
      finishReconcile,
      reconciled,
      updateTx,
      deleteTx,
      deleteRange,
      claimPaid,
      savedSearches,
      saveSearch,
      removeSearch,
      budgetPause,
      setBudgetPause,
      paycheck,
      setPaycheck,
      paySinking,
      challenges,
      startChallenge,
      stopChallenge,
      saveWeek,
      investLog,
      addDividend,
      splitRules,
      addSplitRule,
      removeSplitRule,
    },
  }
}
