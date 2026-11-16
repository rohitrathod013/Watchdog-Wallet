import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { TxRow } from '../components/Cards'
import { CountUp, Empty, Segmented } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { money, saveFile, stamp, csvCell } from '../lib/format'
import { BRAND } from '../config'
import { t, tName } from '../lib/i18n'
import { allTags, matches } from '../lib/ledger'
import { PendingReceipts } from '../components/Inbox'

const FILTERS = {
  all: () => true,
  in: (t) => t.amount > 0,
  out: (t) => t.amount < 0,
  pending: (t) => t.status === 'Pending',
}

export default function TransactionsView({ attached = true }) {
  const { transactions, openModal, toast, stats, savedSearches = [], saveSearch, removeSearch, demo, accounts } = useApp()
  const lead = useLead()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [tag, setTag] = useState('')
  const [naming, setNaming] = useState(null)
  const tags = useMemo(() => allTags(transactions), [transactions])
  const searching = Boolean(q.trim() || tag || filter !== 'all')
  const applySearch = (s) => {
    setQ(s.q)
    setFilter(s.filter)
    setTag(s.tag)
  }
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })

  const rows = useMemo(() => {
    // words, #tags and over:50 / under:20 (see matches in lib/ledger.js)
    const list = transactions
      .filter(FILTERS[filter])
      .filter((x) => !tag || (x.tags ?? []).includes(tag))
      .filter((x) => matches(x, q, `${tName(x.name)} ${t(x.category)}`))
    const k = sort.key
    const by =
      k === 'amount' ? (a, b) => a.amount - b.amount : k === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => a.date.localeCompare(b.date)
    return [...list].sort((a, b) => (sort.dir === 'asc' ? by(a, b) : by(b, a)))
  }, [transactions, filter, q, sort, tag])

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
    const lines = [[t('Date'), t('Transaction'), t('Category'), t('Method'), t('Status'), t('Amount'), t('Tags'), t('Note')].map(csvCell).join(',')]
    // every cell made safe: an imported name like "=HYPERLINK(...)" must never run as a formula in a spreadsheet
    rows.forEach((x) =>
      lines.push([stamp(x.date), tName(x.name), t(x.category), t(x.method), t(x.status), x.amount.toFixed(2), (x.tags ?? []).join(' '), x.note ?? ''].map(csvCell).join(',')),
    )
    saveFile(`${BRAND.name.toLowerCase().replace(/\s+/g, '-')}-transactions.csv`, lines.join('\n'), 'text/csv')
    toast(t('Export ready'), t('{n} transactions saved as CSV.', { n: rows.length }), { icon: 'download' })
  }

  return (
    <>
    <PendingReceipts />
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
          {stats.demo ? null : (
            <>
              <button type="button" className="btn" onClick={() => openModal('recurring')}>
                <Icon name="replay" size={17} />
                {t('Repeating')}
              </button>
              <button type="button" className="btn" onClick={() => openModal('import')}>
                <Icon name="upload" size={17} />
                {t('Import')}
              </button>
              {accounts ? (
                <button type="button" className="btn" onClick={() => openModal('inbox')}>
                  <Icon name="mail" size={17} />
                  {t('Receipts inbox')}
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => openModal('deleteRange')}>
                <Icon name="trash" size={17} />
                {t('Delete by date')}
              </button>
            </>
          )}
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search, #tag, over:50')} aria-label={t('Search transactions')} />
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

      {tags.length || savedSearches.length || searching ? (
        <div className="tx-saved rv" style={{ '--i': 2.5 }}>
          {savedSearches.map((s) => (
            <span key={s.id} className="saved-chip">
              <button type="button" className="chip sm" onClick={() => applySearch(s)}>
                <Icon name="search" size={12} /> {s.name}
              </button>
              <button type="button" className="saved-x" onClick={() => removeSearch(s.id)} aria-label={t('Remove saved search {name}', { name: s.name })}>
                <Icon name="close" size={10} stroke={2.2} />
              </button>
            </span>
          ))}
          {tags.slice(0, 12).map((x) => (
            <button key={x} type="button" className={`chip sm tag ${tag === x ? 'on' : ''}`} aria-pressed={tag === x} onClick={() => setTag(tag === x ? '' : x)}>
              #{x}
            </button>
          ))}
          {searching && !demo ? (
            naming == null ? (
              <button type="button" className="link" onClick={() => setNaming('')}>
                <Icon name="plus" size={13} /> {t('Save this search')}
              </button>
            ) : (
              <form
                className="save-search"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (saveSearch({ name: naming, q, filter, tag })) setNaming(null)
                }}
              >
                <input value={naming} autoFocus maxLength={30} onChange={(e) => setNaming(e.target.value)} placeholder={t('Name it')} aria-label={t('Name for this search')} />
                <button type="submit" className="btn sm solid" disabled={!naming.trim()}>
                  {t('Save')}
                </button>
              </form>
            )
          ) : null}
        </div>
      ) : null}

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
          rows.map((x, r) => <TxRow key={x.id} t={x} r={r} full onOpen={(tx) => openModal('txDetail', { id: tx.id })} />)
        ) : (
          <Empty title={t('No transactions found')} body={t('Try another search or filter.')} />
        )}
      </div>
    </section>
    </>
  )
}
