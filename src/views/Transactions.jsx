import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { TxRow } from '../components/Cards'
import { CountUp, Empty, Segmented } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { money, saveFile, stamp } from '../lib/format'
import { BRAND } from '../config'
import { t, tName } from '../lib/i18n'

const FILTERS = {
  all: () => true,
  in: (t) => t.amount > 0,
  out: (t) => t.amount < 0,
  pending: (t) => t.status === 'Pending',
}

export default function TransactionsView({ attached = true }) {
  const { transactions, openModal, toast, stats } = useApp()
  const lead = useLead()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = transactions
      .filter(FILTERS[filter])
      .filter((x) => !needle || `${x.name} ${x.category} ${x.method} ${tName(x.name)} ${t(x.category)}`.toLowerCase().includes(needle))
    const k = sort.key
    const by =
      k === 'amount' ? (a, b) => a.amount - b.amount : k === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => a.date.localeCompare(b.date)
    return [...list].sort((a, b) => (sort.dir === 'asc' ? by(a, b) : by(b, a)))
  }, [transactions, filter, q, sort])

  const done = transactions.filter((t) => t.status === 'Completed')
  const moneyIn = done.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const moneyOut = -done.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  const pending = transactions.filter((t) => t.status === 'Pending').reduce((s, t) => s + Math.abs(t.amount), 0)
  const count = (k) => transactions.filter(FILTERS[k]).length

  const sortBy = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }))
  const head = (key, label) => (
    <button
      type="button"
      className={`th-sort ${sort.key === key ? 'on' : ''} ${sort.key === key && sort.dir === 'desc' ? 'desc' : ''}`}
      onClick={() => sortBy(key)}
    >
      {label}
      <Icon name="arrowUp" size={13} stroke={2} />
    </button>
  )

  const exportCsv = () => {
    const lines = [[t('Date'), t('Transaction'), t('Category'), t('Method'), t('Status'), t('Amount')].join(',')]
    rows.forEach((x) =>
      lines.push([`"${stamp(x.date)}"`, `"${tName(x.name)}"`, `"${t(x.category)}"`, `"${t(x.method)}"`, t(x.status), x.amount.toFixed(2)].join(',')),
    )
    saveFile(`${BRAND.name.toLowerCase().replace(/\s+/g, '-')}-transactions.csv`, lines.join('\n'), 'text/csv')
    toast(t('Export ready'), t('{n} transactions saved as CSV.', { n: rows.length }), { icon: 'download' })
  }

  return (
    <section className={`card tx-card tx-table ${attached ? 'attached' : ''}`} style={{ '--d': '0ms' }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('All Transactions')}</h2>
          <p className="card-sub">
            {stats.demo ? t('{n} movements in October 2026', { n: transactions.length }) : t('{n} movements', { n: transactions.length })}
          </p>
        </div>
        <div className="c-tools">
          <button type="button" className="btn" onClick={() => openModal('transaction')}>
            <Icon name="plus" size={17} stroke={2} />
            {t('Add transaction')}
          </button>
          <button type="button" className="btn" onClick={() => openModal('send')}>
            <Icon name="send" size={17} />
            {t('Send')}
          </button>
          <button type="button" className="btn solid" onClick={exportCsv}>
            <Icon name="download" size={18} />
            {t('Export CSV')}
          </button>
        </div>
      </div>

      <div className="mini-stats rv" style={{ '--i': 1 }}>
        <div className="mini-stat">
          <span className="ic-ring" style={{ color: 'var(--green)' }}>
            <Icon name="arrowDown" size={18} stroke={2} />
          </span>
          <div>
            <small>{t('Money in')}</small>
            <b>
              <CountUp value={moneyIn} format={(n) => money(n)} delay={lead + 200} />
            </b>
          </div>
        </div>
        <div className="mini-stat">
          <span className="ic-ring">
            <Icon name="arrowUpRight" size={18} stroke={2} />
          </span>
          <div>
            <small>{t('Money out')}</small>
            <b>
              <CountUp value={moneyOut} format={(n) => money(n)} delay={lead + 260} />
            </b>
          </div>
        </div>
        <div className="mini-stat">
          <span className="ic-ring" style={{ color: 'var(--amber)' }}>
            <Icon name="clock" size={18} stroke={2} />
          </span>
          <div>
            <small>{t('Pending')}</small>
            <b>
              <CountUp value={pending} format={(n) => money(n)} delay={lead + 320} />
            </b>
          </div>
        </div>
      </div>

      <div className="tx-tools rv" style={{ '--i': 2 }}>
        <label className="search-box">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search transactions')} aria-label={t('Search transactions')} />
          {q ? (
            <button type="button" onClick={() => setQ('')} aria-label={t('Clear search')}>
              <Icon name="close" size={12} stroke={2.2} />
            </button>
          ) : null}
        </label>
        <Segmented
          className="dark"
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'all', label: t('All'), count: count('all') },
            { key: 'in', label: t('Income'), count: count('in') },
            { key: 'out', label: t('Expenses'), count: count('out') },
            { key: 'pending', label: t('Pending'), count: count('pending') },
          ]}
        />
      </div>

      <div className="tx-list">
        <div className="tx-row th">
          <span />
          {head('name', t('Transaction'))}
          <span className="tx-hide">{t('Method')}</span>
          <span className="tx-date">{head('date', t('Date'))}</span>
          <span className="status">{t('Status')}</span>
          {head('amount', t('Amount'))}
        </div>
        {rows.length ? (
          rows.map((x, r) => <TxRow key={x.id} t={x} r={r} full />)
        ) : (
          <Empty title={t('No transactions found')} body={t('Try another search or filter.')} />
        )}
      </div>
    </section>
  )
}
