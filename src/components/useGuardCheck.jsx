import { useState } from 'react'
import Icon from './Icon'
import { useApp } from '../lib/store'
import { money } from '../lib/format'
import { t } from '../lib/i18n'
import { ASSISTANT } from '../config'
import { DEFAULT_GUARD } from '../lib/guard'
import { payeeChecks } from '../lib/shield'

/* ---------------- the extra step in payment windows ----------------
   Returns [notice, ok]: show the notice, and only allow the payment when ok. */
export function useGuardCheck(amount, { payee, firstTime } = {}) {
  const { guard = DEFAULT_GUARD, transactions, contacts, bills, social } = useApp()
  const [ackFor, setAckFor] = useState(null)
  const big = guard.limit > 0 && amount >= guard.limit
  const fresh = Boolean(guard.newPayee && payee && firstTime)
  const acked = ackFor === amount
  // the scam shield's account checks (the first payment and the guard limit are already said above)
  const people = [...(contacts ?? []), ...(social?.friends ?? []).map((f) => ({ name: f.name }))]
  const extra =
    payee && amount > 0
      ? payeeChecks({ transactions, contacts: people, bills }, { payee, amount }).filter((r) => !['newPayee', 'overLimit'].includes(r.code))
      : []
  if (!big && !fresh && !extra.length) return [null, true]
  const notice = (
    <div className={`guard-notice ${big ? 'big' : ''}`} role="note">
      <span className="guard-ic">
        <Icon name="shield" size={17} />
      </span>
      <div>
        <b>{t('{name} is on guard', { name: ASSISTANT.name })}</b>
        {fresh ? <small>{t('This is your first payment to {payee}. Make sure it’s really them and the details are right.', { payee })}</small> : null}
        {extra.map((r) => (
          <small key={r.code} className="guard-check">
            {t(r.label, r.vars)} <em>+{r.weight}</em> <mark>{r.evidence}</mark>
          </small>
        ))}
        {big ? (
          <>
            <small>{t('{amount} is at or above your {limit} guard limit.', { amount: money(amount), limit: money(guard.limit, '$', 0) })}</small>
            <label className="guard-ack">
              <input type="checkbox" checked={acked} onChange={(e) => setAckFor(e.target.checked ? amount : null)} />
              {t('Yes, I meant {amount}', { amount: money(amount) })}
            </label>
          </>
        ) : null}
      </div>
    </div>
  )
  return [notice, !big || acked]
}
