/* ------------------------------------------------------------------
   Net worth and the debt payoff planner (a Dashboard tab).
   ------------------------------------------------------------------ */
import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { LineChart } from '../components/Charts'
import { CountUp } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { money, whole } from '../lib/format'
import { compareMethods, debtFreeBy, monthChange, netWorthNow } from '../lib/wealth'
import { t, tMonths } from '../lib/i18n'
import { MONTHS } from '../lib/format'
import { useHoldingPrices } from '../lib/useHoldingPrices'

const monthYear = (d) => (d ? `${tMonths(MONTHS[d.getMonth()])} ${d.getFullYear()}` : '')

function ItemForm({ item, onDone }) {
  const { addWorthItem, updateWorthItem } = useApp()
  const [kind, setKind] = useState(item?.kind ?? 'asset')
  const [name, setName] = useState(item?.name ?? '')
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [apr, setApr] = useState(item?.apr != null ? String(item.apr) : '')
  const [minPayment, setMin] = useState(item?.minPayment != null ? String(item.minPayment) : '')
  const ok = name.trim() && Number(amount) > 0
  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    const input = { name, kind, amount: Number(amount), apr: Number(apr) || 0, minPayment: Number(minPayment) || 0 }
    if (item ? updateWorthItem(item.id, input) : addWorthItem(input)) onDone()
  }
  const num = (set) => (e) => set(e.target.value.replace(/[^\d.]/g, ''))
  return (
    <form className="form nw-form" onSubmit={submit}>
      <div className="auth-switch" role="tablist">
        <button type="button" role="tab" aria-selected={kind === 'asset'} className={kind === 'asset' ? 'on' : ''} onClick={() => setKind('asset')}>
          {t('Something I own')}
        </button>
        <button type="button" role="tab" aria-selected={kind === 'debt'} className={kind === 'debt' ? 'on' : ''} onClick={() => setKind('debt')}>
          {t('Something I owe')}
        </button>
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t('Name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={kind === 'debt' ? t('Credit card, car loan…') : t('Home, car, pension…')}
            autoFocus
          />
        </label>
        <label className="field">
          <span>{kind === 'debt' ? t('Amount owed') : t('Worth about')}</span>
          <input inputMode="decimal" value={amount} onChange={num(setAmount)} placeholder="0.00" />
        </label>
      </div>
      {kind === 'debt' ? (
        <div className="field-row">
          <label className="field">
            <span>{t('Interest rate (APR %)')}</span>
            <input inputMode="decimal" value={apr} onChange={num(setApr)} placeholder="19.9" />
          </label>
          <label className="field">
            <span>{t('Minimum payment a month')}</span>
            <input inputMode="decimal" value={minPayment} onChange={num(setMin)} placeholder="0.00" />
          </label>
        </div>
      ) : null}
      <div className="budget-form-btns">
        <button type="button" className="btn" onClick={onDone}>
          {t('Cancel')}
        </button>
        <button type="submit" className="btn solid" disabled={!ok}>
          {item ? t('Save') : t('Add')}
        </button>
      </div>
    </form>
  )
}

function PlanCol({ title, sub, p, best, today }) {
  return (
    <section className={`dp-col ${best ? 'best' : ''}`}>
      <h3>{title}</h3>
      <small>{sub}</small>
      {p.ok ? (
        <>
          <strong>{monthYear(debtFreeBy(p.months, today))}</strong>
          <span>{t('{n} months · {amount} interest', { n: p.months, amount: money(p.interest) })}</span>
          <ol>
            {p.order.map((o) => (
              <li key={o.id}>
                {o.name} <em>{monthYear(debtFreeBy(o.month, today))}</em>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="dp-stuck">{t('The interest grows faster than these payments, so it never clears. Pay more each month.')}</p>
      )}
    </section>
  )
}

function DebtPlanner({ debts, d }) {
  const { now } = useApp()
  const [extra, setExtra] = useState('100')
  const plan = useMemo(() => compareMethods(debts, Number(extra) || 0), [debts, extra])
  const today = now ?? new Date()
  const missingRates = debts.some((x) => !x.minPayment)
  return (
    <section className="card dp-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Debt payoff planner')}</h2>
          <p className="card-sub">{t('The same money each month, two ways to use it')}</p>
        </div>
        <label className="field dp-extra">
          <span>{t('Extra each month')}</span>
          <input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
      </div>
      {missingRates ? <p className="tool-sum">{t('Add a minimum payment to every debt for a full plan.')}</p> : null}
      <div className="dp-cols rv" style={{ '--i': 1 }}>
        <PlanCol
          today={today}
          title={t('Avalanche')}
          sub={t('Highest interest rate first: costs the least')}
          p={plan.avalanche}
          best={plan.saves > 0}
        />
        <PlanCol today={today} title={t('Snowball')} sub={t('Smallest balance first: quick wins')} p={plan.snowball} />
      </div>
      {plan.saves > 0 ? <p className="tool-sum">{t('The avalanche saves you {amount} in interest.', { amount: money(plan.saves) })}</p> : null}
    </section>
  )
}

export default function NetWorthView({ attached = true }) {
  const { balance, goals, holdings, netWorth = { items: [], history: [] }, removeWorthItem, now, stats } = useApp()
  const lead = useLead()
  const [editing, setEditing] = useState(null) // null | 'new' | item
  const live = useHoldingPrices(holdings)
  const n = netWorthNow({ balance, goals, holdings, items: netWorth.items, prices: live.prices })
  const inv = n.parts.find((x) => x.key === 'investments')
  const ch = monthChange(netWorth.history, now ?? new Date())
  const history = netWorth.history.length ? netWorth.history : [{ month: '', value: n.value }]
  const canEdit = !stats.demo

  return (
    <>
      <section className={`card nw-card ${attached ? 'attached' : ''}`} style={{ '--d': '0ms' }}>
        <div className="c-head rv" style={{ '--i': 0 }}>
          <div>
            <h2 className="card-h">{t('Net worth')}</h2>
            <p className="card-sub">{t('Everything you own minus everything you owe')}</p>
          </div>
          {canEdit ? (
            <button type="button" className="btn solid" onClick={() => setEditing('new')}>
              <Icon name="plus" size={17} stroke={2} />
              {t('Add')}
            </button>
          ) : null}
        </div>
        <div className="nw-top rv" style={{ '--i': 1 }}>
          <strong className={n.value < 0 ? 'neg' : ''}>
            <CountUp value={n.value} format={(v) => money(v)} delay={lead + 150} />
          </strong>
          {inv?.live && inv.amount !== inv.cost ? (
            <span className="pill-tag" title={t('Investments at what you paid for them')}>
              {t('{amount} at cost', { amount: money(n.atCost) })}
            </span>
          ) : null}
          {ch ? (
            <span className={`pill-tag ${ch.change >= 0 ? 'green' : 'red'}`}>
              {ch.change >= 0 ? '+' : '−'}
              {money(Math.abs(ch.change))} {t('since last month')}
            </span>
          ) : null}
        </div>
        <div className="mini-stats rv" style={{ '--i': 2 }}>
          <div className="mini-stat">
            <div>
              <small>{t('You own')}</small>
              <b>{whole(n.owned)}</b>
            </div>
          </div>
          <div className="mini-stat">
            <div>
              <small>{t('You owe')}</small>
              <b>{whole(n.owed)}</b>
            </div>
          </div>
          <div className="mini-stat">
            <div>
              <small>{t('Months tracked')}</small>
              <b>{netWorth.history.length || 1}</b>
            </div>
          </div>
        </div>
        {history.length > 1 ? (
          <div className="rv" style={{ '--i': 3, marginTop: 16 }}>
            <LineChart
              labels={history.map((h) => (h.month ? tMonths(MONTHS[Number(h.month.slice(5)) - 1]) : ''))}
              series={[{ name: t('Net worth'), color: 'var(--accent)', values: history.map((h) => h.value / 1000), fill: true }]}
              height={200}
            />
          </div>
        ) : (
          <p className="tool-sum rv" style={{ '--i': 3, marginTop: 14 }}>
            {t('A snapshot is saved each month, so the trend appears here from next month.')}
          </p>
        )}
      </section>

      <div className="grid-2">
        <section className="card" style={{ '--d': '90ms' }}>
          <div className="c-head rv" style={{ '--i': 0 }}>
            <div>
              <h2 className="card-h">{t('What it’s made of')}</h2>
              <p className="card-sub">{inv?.live ? t('Investments at today’s market value') : t('Investments count at what you paid for them')}</p>
            </div>
          </div>
          {editing ? <ItemForm item={editing === 'new' ? null : editing} onDone={() => setEditing(null)} /> : null}
          <ul className="nw-list rv" style={{ '--i': 1 }}>
            {n.parts.map((x) => (
              <li key={x.key}>
                <span>
                  {t(x.name)}
                  {x.key === 'investments' && x.live ? <small>{t('{amount} paid', { amount: money(x.cost) })}</small> : null}
                </span>
                <b>{money(x.amount)}</b>
              </li>
            ))}
            {n.assets.map((x) => (
              <li key={x.id}>
                <span>{x.name}</span>
                <b>{money(x.amount)}</b>
                {canEdit ? (
                  <span className="nw-acts">
                    <button type="button" className="icon-btn soft" onClick={() => setEditing(x)} aria-label={t('Edit {name}', { name: x.name })}>
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn soft"
                      onClick={() => removeWorthItem(x.id)}
                      aria-label={t('Remove {name}', { name: x.name })}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
            {n.debts.map((x) => (
              <li key={x.id} className="debt">
                <span>
                  {x.name}
                  <small>{t('{apr}% APR · {min} a month', { apr: x.apr ?? 0, min: money(x.minPayment ?? 0) })}</small>
                </span>
                <b>−{money(x.amount)}</b>
                {canEdit ? (
                  <span className="nw-acts">
                    <button type="button" className="icon-btn soft" onClick={() => setEditing(x)} aria-label={t('Edit {name}', { name: x.name })}>
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn soft"
                      onClick={() => removeWorthItem(x.id)}
                      aria-label={t('Remove {name}', { name: x.name })}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {!netWorth.items.length && canEdit ? (
            <p className="tool-sum">{t('Add a home, a car or a pension you own, and loans or cards you owe on, so the number is complete.')}</p>
          ) : null}
        </section>
        {n.debts.length ? (
          <DebtPlanner debts={n.debts} d={150} />
        ) : (
          <section className="card dp-card" style={{ '--d': '150ms' }}>
            <div className="c-head rv" style={{ '--i': 0 }}>
              <div>
                <h2 className="card-h">{t('Debt payoff planner')}</h2>
                <p className="card-sub">{t('No debts added')}</p>
              </div>
            </div>
            <p className="tool-sum rv" style={{ '--i': 1 }}>
              {t(
                'Add what you owe (with its interest rate and minimum payment) and this shows when you’ll be debt-free, and whether paying the highest rate or the smallest balance first saves more.',
              )}
            </p>
          </section>
        )}
      </div>
    </>
  )
}
