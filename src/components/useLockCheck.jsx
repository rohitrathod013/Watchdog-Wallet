import Icon from './Icon'
import { useApp } from '../lib/store'
import { money } from '../lib/format'
import { t } from '../lib/i18n'
import { checkPayment } from '../lib/envelopes'

/* ---------------- locked budgets, in payment windows ----------------
   Returns [notice, ok]. card: a card payment in `category` (it can use that
   category's locked budget); otherwise a transfer (free money only). */
export function useLockCheck(amount, { category = '', card = true } = {}) {
  const { budgets, balance } = useApp()
  const check = checkPayment({ budgets, balance, amount, category, card })
  if (!check.locked || !(amount > 0)) return [null, true]
  if (!check.ok) {
    const names = check.blockedBy.map((r) => t(r.name)).join(', ')
    return [
      <div key="lock" className="lock-notice bad" role="alert">
        <span className="lock-ic">
          <Icon name="lock" size={16} />
        </span>
        <div>
          <b>{t('This payment would be declined')}</b>
          <small>
            {card && category
              ? t('Money locked for {names} can’t be spent on {category}.', { names, category: t(category) })
              : t('Money locked for {names} can’t be sent or spent on anything else.', { names })}{' '}
            {check.budget
              ? t('You can use {left} from {name} plus {free} free money.', { left: money(check.budget.left), name: t(check.budget.name), free: money(check.free) })
              : t('Free to spend: {free}.', { free: money(check.free) })}
          </small>
          <small>{t('Lower the amount, or unlock a budget on the Budget page.')}</small>
        </div>
      </div>,
      false,
    ]
  }
  // goes through: say where the money comes from
  return [
    <div key="lock" className="lock-notice" role="note">
      <span className="lock-ic">
        <Icon name="lock" size={16} />
      </span>
      <div>
        {check.budget && check.fromBudget > 0 ? (
          <small>
            {check.fromFree > 0
              ? t('{a} from your locked {name} budget, {b} from free money.', { a: money(check.fromBudget), b: money(check.fromFree), name: t(check.budget.name) })
              : t('Paid from your locked {name} budget: {left} left after this.', {
                  name: t(check.budget.name),
                  left: money(Math.max(0, check.budget.left - check.fromBudget)),
                })}
          </small>
        ) : (
          <small>{t('Paid from free money: {left} left after this.', { left: money(Math.max(0, check.free - check.fromFree)) })}</small>
        )}
      </div>
    </div>,
    true,
  ]
}
