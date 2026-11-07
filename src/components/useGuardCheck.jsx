import { useState } from 'react'
import Icon from './Icon'
import { useApp } from '../lib/store'
import { money } from '../lib/format'
import { t } from '../lib/i18n'
import { ASSISTANT } from '../config'
import { DEFAULT_GUARD } from '../lib/guard'

/* ---------------- the extra step in payment windows ----------------
   Returns [notice, ok]: show the notice, and only allow the payment when ok. */
export function useGuardCheck(amount, { payee, firstTime } = {}) {
  const { guard = DEFAULT_GUARD } = useApp()
  const [ackFor, setAckFor] = useState(null)
  const big = guard.limit > 0 && amount >= guard.limit
  const fresh = Boolean(guard.newPayee && payee && firstTime)
  const acked = ackFor === amount
  if (!big && !fresh) return [null, true]
  const notice = (
    <div className={`guard-notice ${big ? 'big' : ''}`} role="note">
      <span className="guard-ic">
        <Icon name="shield" size={17} />
      </span>
      <div>
        <b>{t('{name} is on guard', { name: ASSISTANT.name })}</b>
        {fresh ? <small>{t('This is your first payment to {payee}. Make sure it’s really them and the details are right.', { payee })}</small> : null}
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
