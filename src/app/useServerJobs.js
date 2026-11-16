/* ------------------------------------------------------------------
   Server features that need a little work in the background while the
   app is open (every minute, and when the tab is looked at again):

   - payment links: a link someone paid adds the money here, once
     (the transaction keeps the Stripe session id as its ref)
   - family: a parent's app pays the allowance when it's due; a child's
     app records spending the parent approved, once
   - receipts inbox: emailed or Gmail receipts waiting to be confirmed
   ------------------------------------------------------------------ */
import { useCallback, useEffect, useRef, useState } from 'react'
import { localIso, money } from '../lib/format'
import { t } from '../lib/i18n'
import { KIND_FOR } from '../lib/stats'
import { familyLinks, myPayLinks, payAllowance, pendingExpenses, spendRecorded, spendRequests } from '../lib/server'

const MINUTE = 60 * 1000

export function useServerJobs({ ready, userId, transactions, setBalance, addTx, notify, toast, social }) {
  const [payLinks, setPayLinks] = useState([])
  const [family, setFamily] = useState({ links: [], requests: [] })
  const [pending, setPending] = useState([])
  const [setup, setSetup] = useState(true)
  const live = useRef({})
  useEffect(() => {
    live.current = { transactions }
  })
  const credited = useRef(new Set())

  /* ---------------- payment links ---------------- */
  const refreshPayLinks = useCallback(async () => {
    if (!ready) return []
    try {
      const list = await myPayLinks()
      setPayLinks(list)
      const have = new Set(live.current.transactions.map((x) => x.ref).filter(Boolean))
      for (const l of list) {
        if (l.status !== 'paid' || !l.paid_session || have.has(l.paid_session) || credited.current.has(l.paid_session)) continue
        credited.current.add(l.paid_session)
        const amount = Number(l.amount)
        setBalance((b) => Math.round((b + amount) * 100) / 100)
        addTx({
          name: l.payer_name ? `Payment from ${l.payer_name}` : 'Payment link',
          category: 'Other income',
          kind: 'request',
          method: 'Payment link',
          amount,
          note: l.note || undefined,
          date: l.paid_at ? localIso(new Date(l.paid_at)) : localIso(),
          ref: l.paid_session,
        })
        notify({ icon: 'arrowDown', tone: 'green', title: 'You received {amount}', body: 'Paid through your payment link', vars: { amount: money(amount) } })
        toast(t('Payment link paid'), t('{amount} is in your balance.', { amount: money(amount) }), { icon: 'receive' })
      }
      return list
    } catch (err) {
      if (err?.setup) setSetup(false)
      return []
    }
  }, [ready, setBalance, addTx, notify, toast])

  /* ---------------- family ---------------- */
  const refreshFamily = useCallback(async () => {
    if (!ready) return
    try {
      const [links, requests] = await Promise.all([familyLinks(), spendRequests()])
      setFamily({ links, requests })
      const today = localIso().slice(0, 10)
      // a parent: pay any allowance that's due (the server checks the date too)
      for (const f of links) {
        if (f.parent === userId && f.status === 'active' && Number(f.allowance) > 0 && f.next_allowance && f.next_allowance <= today) {
          const id = await payAllowance(f.id).catch(() => null)
          if (id) {
            toast(t('Allowance sent'), t('{amount} went to {name}.', { amount: money(Number(f.allowance)), name: social?.nameOf?.(f.child) ?? '' }), { icon: 'send' })
            social?.refresh?.()
          }
        }
      }
      // a child: spending the parent approved is recorded once
      for (const r of requests) {
        if (r.child !== userId || r.status !== 'approved' || r.recorded) continue
        await spendRecorded(r.id).catch(() => null)
        const amount = Number(r.amount)
        setBalance((b) => Math.round((b - amount) * 100) / 100)
        addTx({ name: r.name, amount: -amount, category: r.category, kind: KIND_FOR[r.category] ?? 'transfer', method: 'Approved by parent', ref: `spend-${r.id}` })
        toast(t('Approved'), t('{name}: {amount} is recorded.', { name: r.name, amount: money(amount) }), { icon: 'check' })
      }
    } catch (err) {
      if (err?.setup) setSetup(false)
    }
  }, [ready, userId, setBalance, addTx, toast, social])

  /* ---------------- receipts inbox ---------------- */
  const refreshPending = useCallback(async () => {
    if (!ready) return
    try {
      setPending(await pendingExpenses())
    } catch (err) {
      if (err?.setup) setSetup(false)
    }
  }, [ready])

  useEffect(() => {
    if (!ready) return undefined
    const run = () => {
      refreshPayLinks()
      refreshFamily()
      refreshPending()
    }
    run()
    const h = window.setInterval(run, MINUTE)
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(h)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const asChild = family.links.find((f) => f.child === userId) ?? null
  return {
    setup,
    payLinks,
    refreshPayLinks,
    family,
    refreshFamily,
    // spending goes to the parent first
    needsApproval: Boolean(asChild && asChild.status === 'active' && asChild.approve),
    pending,
    refreshPending,
    setPending,
  }
}
