/* ------------------------------------------------------------------
   The app's background jobs, out of App.jsx: each one runs on its own
   timer or event and only touches the state it's handed.
     useRepeatingRunner  adds repeating transactions on their date
     usePushPresence     tells the server you're in the app (no push then)
     useReminderNudges   "Cancel Netflix?" on the reminder's day
     useNetWorthSnapshot keeps this month's net worth snapshot
     useWeeklyRecap      once a week, a summary of the week before
   ------------------------------------------------------------------ */
import { useEffect, useMemo } from 'react'
import { isoDay, localIso, money, uid } from '../lib/format'
import { KIND_FOR } from '../lib/stats'
import { runAll } from '../lib/recurring'
import { markActive } from '../lib/push'
import { netWorthNow, withSnapshot } from '../lib/wealth'
import { weekKey, weeklyRecap, weekStart } from '../lib/recap'
import { t } from '../lib/i18n'

const HOUR = 60 * 60 * 1000

/** Add the repeating transactions whose date has come: when ready, every hour, and when the tab is looked at again. */
export function useRepeatingRunner({ ready, recurring, setRecurring, ranRule, setTransactions, setBalance, splitIncome, notify }) {
  useEffect(() => {
    if (!ready) return undefined
    const run = () => {
      const { add, rules, changed } = runAll(recurring, isoDay(new Date()))
      if (!changed) return
      // each run is added once, even if this fires twice before the rules are saved
      const fresh = add.filter((x) => !ranRule.current.has(`${x.rule}|${x.day}`))
      for (const x of fresh) ranRule.current.add(`${x.rule}|${x.day}`)
      setRecurring(rules)
      if (!fresh.length) return
      const today = isoDay(new Date())
      setTransactions((list) =>
        [
          ...fresh.map((x) => ({
            id: uid(),
            name: x.name,
            amount: x.amount,
            category: x.category,
            kind: KIND_FOR[x.category] ?? 'transfer',
            method: x.method || 'Repeats',
            date: x.day === today ? localIso() : `${x.day}T09:00`,
            status: 'Completed',
            repeat: x.rule,
          })),
          ...list,
        ].sort((a, b) => String(b.date).localeCompare(String(a.date))),
      )
      const cents = fresh.reduce((sum, x) => sum + Math.round(x.amount * 100), 0)
      setBalance((b) => Math.round(b * 100 + cents) / 100)
      for (const x of fresh) if (x.amount > 0) splitIncome(x.amount, x.category)
      const first = fresh[0]
      notify({
        icon: 'replay',
        tone: 'accent',
        title: fresh.length === 1 ? 'Added: {name}' : 'Added {n} repeating transactions',
        body: fresh.length === 1 ? '{amount}, as scheduled' : 'Including {name}',
        vars: { name: first.name, amount: money(Math.abs(first.amount)), n: fresh.length },
      })
    }
    run()
    const timer = window.setInterval(run, HOUR)
    window.addEventListener('focus', run)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', run)
    }
  }, [ready, recurring, notify, splitIncome]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** While the app is open and on screen, tell the server so it doesn't push to you; clear it the moment you leave. */
export function usePushPresence(active) {
  useEffect(() => {
    if (!active) return undefined
    const beat = () => markActive(document.visibilityState === 'visible')
    beat()
    const timer = window.setInterval(() => document.visibilityState === 'visible' && markActive(true), 30 * 1000)
    document.addEventListener('visibilitychange', beat)
    const bye = () => markActive(false)
    window.addEventListener('pagehide', bye)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
      window.removeEventListener('pagehide', bye)
      markActive(false)
    }
  }, [active])
}

/** "Cancel {name}?" on a reminder's day: a notification and a toast, once. */
export function useReminderNudges({ ready, reminders, setReminders, notify, toast }) {
  useEffect(() => {
    if (!ready) return undefined
    const check = () => {
      const today = isoDay(new Date())
      const due = reminders.filter((r) => !r.done && r.day <= today)
      if (!due.length) return
      setReminders((list) => list.map((r) => (due.some((d) => d.id === r.id) ? { ...r, done: true } : r)))
      for (const r of due) {
        notify({
          icon: 'bell',
          tone: 'accent',
          title: 'Cancel {name}?',
          body: 'It charges {amount} on {date}. Cancel with them before then if you don’t need it.',
          vars: { name: r.name, amount: money(r.amount), date: r.charge },
        })
        toast(
          t('Cancel {name}?', { name: r.name }),
          t('It charges {amount} on {date}. Cancel with them before then if you don’t need it.', {
            name: r.name,
            amount: money(r.amount),
            date: r.charge,
          }),
          { icon: 'bell', ms: 8000 },
        )
      }
    }
    check()
    const timer = window.setInterval(check, HOUR)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [ready, reminders, notify, toast]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Keep this month's net worth snapshot up to date (one point per month, for the trend). */
export function useNetWorthSnapshot({ ready, balance, goals, holdings, netWorth, setNetWorth }) {
  const worthNow = useMemo(() => netWorthNow({ balance, goals, holdings, items: netWorth.items }).value, [balance, goals, holdings, netWorth.items])
  useEffect(() => {
    if (!ready) return
    const snap = () =>
      setNetWorth((w) => {
        const history = withSnapshot(w.history, worthNow)
        return history === w.history ? w : { ...w, history }
      })
    snap()
  }, [ready, worthNow]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Once a week, the first time the app is open: a notification summing up the week before. */
export function useWeeklyRecap({ ready, recapWeek, setRecapWeek, transactions, budgets, notify }) {
  useEffect(() => {
    if (!ready) return
    const now = new Date()
    const key = weekKey(new Date(weekStart(now).getTime() - 7 * 86400000))
    if (recapWeek === key) return
    const send = () => {
      const r = weeklyRecap({ transactions, budgets }, now)
      setRecapWeek(key)
      if (r.empty) return
      notify({
        icon: 'chart',
        tone: 'accent',
        title: 'Your week: {spent} spent',
        body: r.change == null ? 'Most of it on {category}. Ask Grace “how was my week?”' : '{change} vs the week before. Most of it on {category}.',
        vars: { spent: money(r.spent), change: `${r.change >= 0 ? '+' : ''}${r.change}%`, category: r.top[0]?.category ?? '' },
      })
    }
    send()
  }, [ready, recapWeek, transactions, budgets, notify]) // eslint-disable-line react-hooks/exhaustive-deps
}
