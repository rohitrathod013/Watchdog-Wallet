/* ------------------------------------------------------------------
   Accounts: where the money actually sits (checking, savings, cash,
   credit cards), moving money between them, reconciling against a
   statement, and each credit card's utilisation and due date.
   ------------------------------------------------------------------ */
import Icon from '../components/Icon'
import { CardEmpty } from '../components/Cards'
import { CountUp } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { money, stamp } from '../lib/format'
import { t, tMonths } from '../lib/i18n'
import { ACCOUNT_ICON, ACCOUNT_LABEL, cardCycle, MAIN } from '../lib/ledger'
import { MONTHS } from '../lib/format'

const dateText = (d) => (d ? `${tMonths(MONTHS[d.getMonth()])} ${d.getDate()}` : '')

function CreditCard({ acc, owed, i }) {
  const { openModal } = useApp()
  const cyc = cardCycle(acc, owed)
  return (
    <div className="cc-view rv" style={{ '--i': i }}>
      <div className="cc-head">
        <span className="acct-ic credit">
          <Icon name="card" size={18} />
        </span>
        <div>
          <b>{acc.name}</b>
          <small>
            {cyc.owed > 0 ? t('{amount} owed', { amount: money(cyc.owed) }) : t('Nothing owed')}
            {cyc.available != null ? ` · ${t('{amount} available', { amount: money(cyc.available) })}` : ''}
          </small>
        </div>
        <button type="button" className="btn sm solid" disabled={!(cyc.owed > 0)} onClick={() => openModal('accounts', { mode: 'move', from: MAIN, to: acc.id })}>
          {t('Pay card')}
        </button>
      </div>
      {cyc.util != null ? (
        <div className="util">
          <div className="util-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, cyc.util)} aria-label={t('Credit used')}>
            <i className={cyc.level} style={{ width: `${Math.min(100, cyc.util)}%` }} />
            <span className="util-mark" style={{ left: '30%' }} />
          </div>
          <small>
            <b>{t('{pct}% of your limit used', { pct: cyc.util })}</b>
            {' · '}
            {cyc.level === 'good' ? t('Under 30%: good for your credit score.') : cyc.level === 'fair' ? t('Try to keep it under 30%.') : t('High. Paying it down helps your credit score.')}
          </small>
        </div>
      ) : (
        <small className="muted">{t('Add a credit limit to see how much of it you use.')}</small>
      )}
      <div className="cc-dates">
        <span>
          <small>{t('Statement closes')}</small>
          <b>{cyc.close ? `${dateText(cyc.close)} · ${cyc.closeIn === 0 ? t('today') : t('in {n} days', { n: cyc.closeIn })}` : t('Not set')}</b>
        </span>
        <span className={cyc.dueIn != null && cyc.dueIn <= (acc.remindDays ?? 3) && cyc.owed > 0 ? 'soon' : ''}>
          <small>{t('Payment due')}</small>
          <b>{cyc.due ? `${dateText(cyc.due)} · ${cyc.dueIn === 0 ? t('today') : t('in {n} days', { n: cyc.dueIn })}` : t('Not set')}</b>
        </span>
      </div>
    </div>
  )
}

export default function AccountsView() {
  const { moneyAccounts = [], balances = {}, balance, openModal, accountName, reconciled = {}, stats } = useApp()
  const lead = useLead()
  const rows = [{ id: MAIN, name: accountName(MAIN), type: 'main' }, ...moneyAccounts]
  const credit = moneyAccounts.filter((a) => a.type === 'credit')
  const cash = moneyAccounts.find((a) => a.type === 'cash')

  return (
    <>
      <section className="card accounts-card attached" style={{ '--d': '0ms' }}>
        <div className="c-head rv" style={{ '--i': 0 }}>
          <div>
            <h2 className="card-h">{t('Accounts')}</h2>
            <p className="card-sub">{t('Where your money sits. Together they add up to your balance.')}</p>
          </div>
          <div className="c-tools">
            {moneyAccounts.length ? (
              <button type="button" className="btn" onClick={() => openModal('accounts', { mode: 'move' })}>
                <Icon name="transfer" size={17} /> {t('Move money')}
              </button>
            ) : null}
            {cash ? (
              <button type="button" className="btn" onClick={() => openModal('accounts', { mode: 'move', from: MAIN, atm: true })}>
                <Icon name="sack" size={17} /> {t('ATM withdrawal')}
              </button>
            ) : null}
            <button type="button" className="btn solid" disabled={stats.demo} onClick={() => openModal('accounts', { mode: 'add' })}>
              <Icon name="plus" size={17} stroke={2} /> {t('Add account')}
            </button>
          </div>
        </div>
        <div className="acct-total rv" style={{ '--i': 1 }}>
          <small>{t('Total')}</small>
          <b>
            <CountUp value={balance} format={(n) => money(n)} delay={lead + 150} />
          </b>
        </div>
        <div className="acct-list">
          {rows.map((a, i) => (
            <div key={a.id} className="macct-row rv" style={{ '--i': 2 + i * 0.3 }}>
              <span className={`acct-ic ${a.type}`}>
                <Icon name={ACCOUNT_ICON[a.type] ?? 'wallet'} size={18} />
              </span>
              <span className="acct-name">
                <b>{a.name}</b>
                <small>
                  {a.type === 'main' ? t('Everything not in another account') : t(ACCOUNT_LABEL[a.type])}
                  {reconciled[a.id] ? ` · ${t('reconciled {date}', { date: stamp(reconciled[a.id].at) })}` : ''}
                </small>
              </span>
              <strong className={(balances[a.id] ?? 0) < 0 ? 'neg' : ''}>{money(balances[a.id] ?? 0)}</strong>
              <span className="acct-acts">
                <button type="button" className="btn sm" onClick={() => openModal('accounts', { mode: 'reconcile', id: a.id })}>
                  {t('Reconcile')}
                </button>
                {a.type === 'main' ? null : (
                  <button type="button" className="icon-btn soft sm" onClick={() => openModal('accounts', { mode: 'edit', id: a.id })} aria-label={t('Edit {name}', { name: a.name })}>
                    <Icon name="edit" size={15} />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
        {moneyAccounts.length ? null : (
          <CardEmpty
            icon="wallet"
            title={t('Split your balance by where it is')}
            body={t('Add your savings, a cash wallet or a credit card. Payments with a card or cash go to the right one by themselves.')}
          />
        )}
      </section>

      {credit.length ? (
        <section className="card" style={{ '--d': '90ms' }}>
          <div className="c-head rv" style={{ '--i': 0 }}>
            <div>
              <h2 className="card-h">{t('Credit cards')}</h2>
              <p className="card-sub">{t('How much of each limit you use, and when the bill closes and is due')}</p>
            </div>
          </div>
          <div className="cc-list">
            {credit.map((a, i) => (
              <CreditCard key={a.id} acc={a} owed={balances[a.id]} i={1 + i} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
