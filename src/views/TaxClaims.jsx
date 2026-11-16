/* ------------------------------------------------------------------
   On the Reports tab: the year-end tax summary (income, tax already
   paid, tax-deductible spending, investment gains and dividends) and
   money to claim back from work or friends.
   ------------------------------------------------------------------ */
import { useState } from 'react'
import Icon from '../components/Icon'
import { useApp } from '../lib/store'
import { csvCell, money, saveFile, stamp } from '../lib/format'
import { t, tName } from '../lib/i18n'
import { claims, DEDUCTIBLE, taxSummary, yearsOf } from '../lib/ledger'
import { investIncome } from '../lib/lots'
import { BRAND } from '../config'

export function TaxCard({ d = 0 }) {
  const { transactions, investLog, toast, stats } = useApp()
  const years = yearsOf(transactions)
  const [year, setYear] = useState(years[0])
  const s = taxSummary(transactions, year)
  const inv = investIncome(investLog, year)

  const exportCsv = () => {
    const rows = [
      [t('Tax summary'), String(year)],
      [],
      [t('Income'), ''],
      ...s.income.map((x) => [t(x.category), x.amount.toFixed(2)]),
      [t('Total income'), s.incomeTotal.toFixed(2)],
      [],
      [t('Tax already paid'), s.taxPaid.toFixed(2)],
      [t('Realised gains'), inv.gains.toFixed(2)],
      [t('Short term'), inv.shortTerm.toFixed(2)],
      [t('Long term'), inv.longTerm.toFixed(2)],
      [t('Dividends'), inv.dividendTotal.toFixed(2)],
      [],
      [t('Tax deductible'), ''],
      ...s.deductible.map((x) => [t(x.category), x.amount.toFixed(2)]),
      [t('Total deductible'), s.deductibleTotal.toFixed(2)],
      [],
      [t('Date'), t('Transaction'), t('Category'), t('Amount'), t('Note')],
      ...s.items.map((x) => [stamp(x.date), tName(x.name), t(x.category), Math.abs(x.amount).toFixed(2), x.note ?? '']),
    ]
    saveFile(`${BRAND.name.toLowerCase().replace(/\s+/g, '-')}-tax-${year}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv')
    toast(t('Export ready'), t('Your {year} tax summary is saved as CSV.', { year }), { icon: 'download' })
  }

  return (
    <section className="card tax-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Year-end tax summary')}</h2>
          <p className="card-sub">{t('Tag spending as tax deductible (open a transaction) and it adds up here. Not tax advice.')}</p>
        </div>
        <div className="c-tools">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t('Year')}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button type="button" className="btn solid" onClick={exportCsv} disabled={stats.demo}>
            <Icon name="download" size={16} /> {t('Export CSV')}
          </button>
        </div>
      </div>
      <div className="tax-tiles rv" style={{ '--i': 1 }}>
        <div>
          <small>{t('Income')}</small>
          <b>{money(s.incomeTotal)}</b>
        </div>
        <div>
          <small>{t('Tax already paid')}</small>
          <b>{money(s.taxPaid)}</b>
        </div>
        <div>
          <small>{t('Tax deductible')}</small>
          <b>{money(s.deductibleTotal)}</b>
        </div>
        <div>
          <small>{t('Realised gains')}</small>
          <b className={inv.gains < 0 ? 'neg' : ''}>{money(inv.gains)}</b>
        </div>
        <div>
          <small>{t('Dividends')}</small>
          <b>{money(inv.dividendTotal)}</b>
        </div>
      </div>
      {s.deductible.length ? (
        <div className="tax-cats rv" style={{ '--i': 2 }}>
          {s.deductible.map((x) => (
            <span key={x.category}>
              {t(x.category)} <b>{money(x.amount)}</b>
            </span>
          ))}
        </div>
      ) : (
        <p className="muted rv" style={{ '--i': 2 }}>
          {t('Nothing tagged #{tag} in {year} yet.', { tag: DEDUCTIBLE, year })}
        </p>
      )}
    </section>
  )
}

export function ClaimsCard({ d = 0 }) {
  const { transactions, openModal, claimPaid } = useApp()
  const c = claims(transactions)
  if (!c.open.length && !c.paid.length) return null
  return (
    <section className="card claims-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('To claim back')}</h2>
          <p className="card-sub">
            {t('{open} still owed to you · {paid} paid back', { open: money(c.openTotal), paid: money(c.paidTotal) })}
          </p>
        </div>
      </div>
      <div className="claim-list">
        {c.open.map((x, i) => (
          <div key={x.id} className="claim-row rv" style={{ '--i': 1 + i * 0.3 }}>
            <button type="button" className="claim-name" onClick={() => openModal('txDetail', { id: x.id })}>
              <b>{tName(x.name)}</b>
              <small>
                {stamp(x.date)}
                {x.claim.from ? ` · ${t('from {name}', { name: x.claim.from })}` : ''}
              </small>
            </button>
            <strong>{money(Math.abs(x.claim.amount ?? x.amount))}</strong>
            <button type="button" className="btn sm solid" onClick={() => claimPaid(x.id)}>
              {t('Paid back')}
            </button>
          </div>
        ))}
        {c.open.length ? null : <p className="muted">{t('Everything’s been paid back.')}</p>}
      </div>
    </section>
  )
}
