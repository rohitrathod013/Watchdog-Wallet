import Icon from '../components/Icon'
import { Sparkline } from '../components/Charts'
import { Chg, CountUp } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { saveFile, whole } from '../lib/format'
import { BRAND } from '../config'
import { t, tMonths } from '../lib/i18n'
import { CardEmpty } from '../components/Cards'
import { useState } from 'react'
import { money, MONTHS } from '../lib/format'
import { statementFor, statementHtml, statementMonths } from '../lib/statement'

/* the month's statement as a page to save as PDF (the browser's print window does the PDF) */
function StatementCard({ d }) {
  const { transactions, balance, budgets, user, stats } = useApp()
  const months = statementMonths(transactions)
  const [month, setMonth] = useState(months[0] ?? '')
  const label = (m) => `${tMonths(MONTHS[Number(m.slice(5, 7)) - 1])} ${m.slice(0, 4)}`
  const open = () => {
    if (!month) return
    const st = statementFor({ transactions, balance, budgets }, month)
    const html = statementHtml(st, { t, money, who: user?.name ?? '', brand: BRAND.name, monthName: label(month) })
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    window.open(url, '_blank', 'noopener')
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  return (
    <section className="card statement-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Monthly statement')}</h2>
          <p className="card-sub">{t('Balances, money in and out, budgets and every transaction, as a PDF')}</p>
        </div>
      </div>
      {months.length && !stats.demo ? (
        <div className="statement-row rv" style={{ '--i': 1 }}>
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('Month')}>
            {months.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
          <button type="button" className="btn solid" onClick={open}>
            <Icon name="download" size={16} />
            {t('Download PDF')}
          </button>
        </div>
      ) : (
        <p className="tool-sum rv" style={{ '--i': 1 }}>
          {stats.demo
            ? t('Statements are made from your own account’s transactions.')
            : t('Add some transactions and your first statement appears here.')}
        </p>
      )}
      <p className="tool-sum rv" style={{ '--i': 2 }}>
        {t('It opens ready to print: choose “Save as PDF” as the printer.')}
      </p>
    </section>
  )
}

const SRC_COLORS = ['var(--solid)', 'var(--green)', 'var(--accent)']

export default function ReportsView({ attached = true }) {
  const { toast, stats } = useApp()
  const INCOME_SOURCES = stats.incomeSources
  const REPORTS = stats.reports
  const lead = useLead()
  const total = INCOME_SOURCES.reduce((s, x) => s + x.value, 0)

  const download = (r) => {
    const lines = [`${BRAND.name}: ${t(r.title)} (${r.q})`, `${t('Generated')},${tMonths(r.date)}`, '', `${t('Period')},${t('Index')}`]
    r.bars.forEach((v, i) => lines.push(`P${i + 1},${v}`))
    saveFile(
      `${BRAND.name.toLowerCase().replace(/\s+/g, '-')}-${r.q.toLowerCase().replace(/\s+/g, '-')}-${r.title.toLowerCase().replace(/\s+/g, '-')}.csv`,
      lines.join('\n'),
      'text/csv',
    )
    toast(t('Report downloaded'), t('{name} saved to your device.', { name: `${r.q} ${t(r.title)}` }), { icon: 'download' })
  }

  return (
    <>
      <StatementCard d={0} />
      <section className={`card income-src ${attached ? 'attached' : ''}`} style={{ '--d': '0ms' }}>
        <div className="c-head rv" style={{ '--i': 0 }}>
          <div>
            <h2 className="card-h">{t('Total Income Overview')}</h2>
            <p className="card-sub">{t('Year to date, across every income stream')}</p>
          </div>
          <Chg value={18.6} note={t('vs 2025')} />
        </div>
        <div className="src-total rv" style={{ '--i': 1 }}>
          <strong>
            <CountUp value={total} format={(n) => whole(n)} delay={lead + 150} duration={1700} />
          </strong>
          <span className="muted">{t('earned in 2026')}</span>
        </div>
        <div className="stacked rv" style={{ '--i': 2, height: 16, marginTop: 18 }}>
          {INCOME_SOURCES.map((s, i) => (
            <i key={s.id} style={{ '--w': s.value, '--c': SRC_COLORS[i], '--i': i }} />
          ))}
        </div>
        <div className="src-tiles">
          {INCOME_SOURCES.map((s, i) => (
            <div key={s.id} className="src-tile" style={{ '--i': i }}>
              <small>
                <i className="sw" style={{ background: SRC_COLORS[i], borderRadius: '50%' }} />
                {t(s.name)}
              </small>
              <b>
                <CountUp value={s.value} format={(n) => whole(n)} delay={lead + 300 + i * 100} />
              </b>
              <em>{t('{pct}% of income', { pct: total ? Math.round((s.value / total) * 100) : 0 })}</em>
              <Sparkline values={s.trend} color={SRC_COLORS[i]} />
            </div>
          ))}
        </div>
      </section>

      {REPORTS.length ? null : (
        <section className="card" style={{ '--d': '120ms' }}>
          <CardEmpty
            icon="receipt"
            title={t('No reports yet')}
            body={t('Monthly statements will appear here once you have a full month of activity.')}
          />
        </section>
      )}
      <div className="grid-3">
        {REPORTS.map((r, i) => (
          <section key={r.id} className={`card report ${i % 3 === 1 ? 'dark' : ''}`} style={{ '--d': `${120 + i * 70}ms` }}>
            <div className="report-paper rv" style={{ '--i': 0 }}>
              <div className="paper-top">
                <span>{r.q}</span>
                <i />
              </div>
              <small>{t(r.title)}</small>
              <div className="mini-bars">
                {r.bars.map((h, j) => (
                  <i key={j} style={{ '--h': `${h}%`, '--i': j }} />
                ))}
              </div>
            </div>
            <div className="report-meta rv" style={{ '--i': 1 }}>
              <div>
                <b>{t(r.title)}</b>
                <small>
                  {tMonths(r.date)} · {r.size}
                </small>
              </div>
              <button type="button" className="btn tiny" onClick={() => download(r)}>
                <Icon name="download" size={15} />
                CSV
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
