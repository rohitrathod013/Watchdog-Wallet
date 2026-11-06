import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { Flag, MerchantLogo, Persona } from './Brand'
import { Donut, EarningBars, Heatmap, LineChart } from './Charts'
import { Chg, CountUp, Dropdown, Popover, Ring, Segmented, Status, Toggle } from './ui'
import { useApp, useLead } from '../lib/store'
import { money, signed, stamp, whole } from '../lib/format'
import { t, tMonths, tName } from '../lib/i18n'
import { CAT_COLORS, CURRENCIES } from '../data/seed'
import { billDue } from '../lib/stats'

const sum = (list, f = (x) => x) => list.reduce((s, x) => s + f(x), 0)

/** A friendly placeholder for a card with nothing to show yet. */
export function CardEmpty({ icon = 'sparkle', title, body, action, onAction }) {
  return (
    <div className="card-empty rv" style={{ '--i': 1 }}>
      <span>
        <Icon name={icon} size={20} />
      </span>
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action ? (
        <button type="button" className="btn solid" onClick={onAction}>
          <Icon name="plus" size={16} stroke={2.2} />
          {action}
        </button>
      ) : null}
    </div>
  )
}
const slot = (d) => ({ '--d': `${d}ms` })

/* ============================================================
   Reference screen
   ============================================================ */

/* columns of the pixel tower, top → bottom; 0 = empty … 4 = accent */
const PIX = [
  [0, 0, 0, 0, 1],
  [0, 0, 0, 1, 1],
  [0, 0, 0, 1, 2],
  [0, 0, 1, 1, 2],
  [0, 0, 3, 1, 2],
  [0, 1, 1, 2, 2],
  [2, 3, 2, 3, 4],
]

export function BalanceCard({ attached = false, d = 0 }) {
  const { currency, setCurrency, balance, openModal, live, stats } = useApp()
  const [curOpen, setCurOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const amt = useRef(null)
  const first = useRef(true)
  const lead = useLead()
  const cur = CURRENCIES[currency]

  // flash the figure whenever money moves after the first paint
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = amt.current
    el?.classList.remove('tick')
    void el?.offsetWidth
    el?.classList.add('tick')
  }, [balance])

  return (
    <section className={`card balance-card ${attached ? 'attached' : ''}`} style={slot(d)}>
      <div className="bc-head rv" style={{ '--i': 0 }}>
        <span className="ic-ring">
          <Icon name="wallet" size={20} />
        </span>
        <h2 className="card-h">{t('Total Balance')}</h2>
        <div className="anchor">
          <button type="button" className={`cur-btn ${curOpen ? 'on' : ''}`} onClick={() => setCurOpen((o) => !o)} aria-label={t('Change currency')}>
            <Flag code={cur.flag} size={22} />
            {cur.code}
            <Icon name="chevDown" size={14} stroke={2} className="chev" />
          </button>
          <Popover open={curOpen} onClose={() => setCurOpen(false)} className="cur-pop">
            {Object.values(CURRENCIES).map((c, i) => (
              <button
                key={c.code}
                type="button"
                className={`cur-opt ${c.code === currency ? 'on' : ''}`}
                style={{ '--i': i }}
                onClick={() => {
                  setCurrency(c.code)
                  setCurOpen(false)
                }}
              >
                <Flag code={c.flag} size={22} />
                <span>
                  <b>{c.code}</b>
                  <small>{t(c.name)}</small>
                </span>
                {c.code === currency ? <Icon name="check" size={16} stroke={2.2} /> : null}
              </button>
            ))}
          </Popover>
        </div>
      </div>

      <div className="bal-row rv" style={{ '--i': 1 }}>
        <span ref={amt} className={`bal-amt ${hidden ? 'masked' : ''}`} aria-hidden={hidden}>
          <CountUp value={balance * cur.rate} format={(n) => money(n, cur.symbol, cur.dp)} delay={lead} duration={1700} />
        </span>
        <button
          type="button"
          className="eye-btn"
          onClick={() => setHidden((h) => !h)}
          aria-label={hidden ? t('Show balance') : t('Hide balance')}
          aria-pressed={hidden}
        >
          <Icon key={hidden ? 'off' : 'on'} name={hidden ? 'eyeOff' : 'eye'} size={19} />
        </button>
      </div>
      <Chg
        className="bal-delta rv"
        style={{ '--i': 2 }}
        value={stats.weekNet == null ? 12.4 : balance - stats.weekNet ? (stats.weekNet / Math.abs(balance - stats.weekNet)) * 100 : 0}
        note={t('vs Last Week')}
      />

      <div className={`pixels ${live ? 'live' : ''}`} aria-hidden="true">
        {PIX.map((col, c) =>
          col.map((l, r) => <i key={`${c}-${r}`} className={`l${l}`} style={{ gridColumn: c + 1, gridRow: r + 1, '--w': c + (4 - r) }} />),
        )}
      </div>

      <div className="bal-actions rv" style={{ '--i': 3 }}>
        <button type="button" className="btn solid xl" onClick={() => openModal('receive')}>
          <Icon name="receive" size={22} />
          {t('Receive Money')}
        </button>
        <button type="button" className="btn soft xl" onClick={() => openModal('send')}>
          <Icon name="send" size={20} />
          {t('Send Money')}
        </button>
        <button type="button" className="btn soft xl" onClick={() => openModal('request')}>
          <Icon name="request" size={21} />
          {t('Payment Request')}
        </button>
      </div>
    </section>
  )
}

export function EarningCard({ d = 0, className = '' }) {
  const { stats } = useApp()
  const [year, setYear] = useState(stats.earningYears[0])
  const [sel, setSel] = useState(stats.earningMonth)
  const lead = useLead()
  const e = stats.earnings[year]
  return (
    <section className={`card earn-card ${className}`} style={slot(d)}>
      <div className="ec-head rv" style={{ '--i': 0 }}>
        <h2 className="card-h">{t('Earning Overview')}</h2>
        <Dropdown
          small
          label={t('Earning period')}
          value={year}
          onChange={setYear}
          options={[
            { value: stats.earningYears[0], label: t('This Year') },
            { value: stats.earningYears[1], label: t('Last Year') },
          ]}
        />
      </div>
      <div className="ec-total rv" style={{ '--i': 1 }}>
        <strong>
          <CountUp value={e.total} format={(n) => money(n)} delay={lead + 120} duration={1600} />
        </strong>
        <Chg value={e.delta} note={t(e.vs)} size="sm" />
      </div>
      <EarningBars values={e.values} selected={sel} onSelect={setSel} />
    </section>
  )
}

export function KpiCard({ icon, label, value, delta, note, d = 0, i = 0, format = (n) => money(n), children }) {
  const lead = useLead()
  return (
    <section className="card kpi" style={slot(d)}>
      <div className="kpi-head rv" style={{ '--i': 0 }}>
        <Icon name={icon} size={24} />
        <h2 className="card-h">{t(label)}</h2>
      </div>
      <strong className="kpi-val rv" style={{ '--i': 1 }}>
        <CountUp value={value} format={format} delay={lead + 120 + i * 90} />
      </strong>
      <Chg className="rv" style={{ '--i': 2 }} value={delta} note={t(note)} size="sm" />
      {children}
    </section>
  )
}

function Split({ p }) {
  const [hover, setHover] = useState(null)
  const segs = [
    { name: 'Income', pct: p.split[0], value: p.income, c: 'var(--solid)', dark: true },
    { name: 'Expenses', pct: p.split[1], value: p.expenses, c: 'var(--accent)' },
    { name: 'Savings', pct: p.split[2], value: p.savings, c: 'var(--green)' },
  ]
  const on = hover ?? 1
  return (
    <div className="split" onMouseLeave={() => setHover(null)}>
      {segs.map((s, i) => (
        <button
          key={s.name}
          type="button"
          className={`sp ${on === i ? 'on' : ''}`}
          style={{ '--w': s.pct, '--c': s.c, '--i': i }}
          onMouseEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          aria-label={`${t(s.name)}: ${s.pct}%, ${whole(s.value)}`}
        >
          <span className="sp-label">{on === i ? <em className={s.dark ? 'dark' : ''}>{whole(s.value)}</em> : `${s.pct}%`}</span>
          <i className="sp-bar" />
          <span className="sp-legend">
            <i />
            {t(s.name)}
          </span>
        </button>
      ))}
    </div>
  )
}

export function NetProfitCard({ d = 0 }) {
  const { period, stats } = useApp()
  const p = stats.periods[period]
  return (
    <KpiCard icon="netflow" label="Net Profit" value={p.net} delta={p.netDelta} note={p.vs} d={d} i={2}>
      <Split p={p} />
    </KpiCard>
  )
}

const PAPERS = [
  { q: 'Q4 2025', title: 'Annual Performance', date: 'Jan 2026' },
  { q: 'Q3 2025', title: 'Growth Report', date: 'July 2025' },
  { q: 'Q2 2025', title: 'Expense Report', date: 'April 2025' },
]

export function ReportCard({ d = 0 }) {
  const { go, stats } = useApp()
  const lead = useLead()
  const open = () => go('dashboard', { tab: 'reports' })
  return (
    <section
      className="card report-card"
      style={slot(d)}
      role="button"
      tabIndex={0}
      aria-label={t('Open financial reports')}
      onClick={open}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
    >
      <div className="rp-papers" aria-hidden="true">
        {PAPERS.map((p, k) => (
          <div key={p.q} className={`paper p${k}`}>
            <div className="paper-in" style={{ '--k': k }}>
              <div className="paper-top">
                {p.q}
                <i />
              </div>
              <small>{t(p.title)}</small>
              <small>{tMonths(p.date)}</small>
              <b style={{ width: '88%' }} />
              <b style={{ width: '62%' }} />
              <b style={{ width: '76%' }} />
            </div>
          </div>
        ))}
      </div>
      <span className="rp-go">
        <Icon name="arrowUpRight" size={16} stroke={2} />
      </span>
      <h3 className="rp-title rv" style={{ '--i': 1 }}>
        {t('Financial')}
        <br />
        {t('Report')}
      </h3>
      <div className="rp-foot">
        <strong className="rv" style={{ '--i': 2 }}>
          {t('Total Income Overview')}
        </strong>
        <div className="rp-cols">
          {stats.incomeSources.slice(0, 3).map((s, i) => (
            <div key={s.id} className="rv" style={{ '--i': 3 + i * 0.6 }}>
              <small>{t(s.name)}</small>
              <b>
                <CountUp value={s.value} format={(n) => whole(n)} delay={lead + 400 + i * 110} />
              </b>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function SavingsCard({ d = 0 }) {
  const { goals, openModal, fundGoal, removeGoal } = useApp()
  const [open, setOpen] = useState(null)
  const lead = useLead()
  return (
    <section className="card savings-card" style={slot(d)}>
      <div className="sv-head rv" style={{ '--i': 0 }}>
        <span className="sv-ic">
          <Icon name="safe" size={21} />
        </span>
        <h2 className="card-h">{t('My Savings Goals')}</h2>
        <button type="button" className="add-goal" onClick={() => openModal('goal')}>
          <i>
            <Icon name="plus" size={16} stroke={2.2} />
          </i>
          {t('Add Goal')}
        </button>
      </div>
      <div className="goals">
        {goals.length ? null : (
          <CardEmpty
            icon="target"
            title={t('No savings goals yet')}
            body={t('Set a target for something you’re saving up for.')}
            action={t('Add Goal')}
            onAction={() => openModal('goal')}
          />
        )}
        {goals.map((g, r) => {
          const pct = Math.min(100, Math.round((g.saved / g.target) * 100))
          const isOpen = open === g.id
          const flip = () => setOpen(isOpen ? null : g.id)
          return (
            <div key={g.id} className={`goal ${isOpen ? 'open' : ''} ${pct >= 100 ? 'done' : ''}`} style={{ '--r': r }}>
              <div
                className="goal-row"
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={flip}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), flip())}
              >
                <span className="goal-name">
                  <Icon name={g.icon} size={21} />
                  <span>{t(g.name)}</span>
                </span>
                <span className="goal-pct">
                  <CountUp value={pct} format={(n) => `${Math.round(n)}%`} delay={lead + 400 + r * 110} />
                </span>
                <span className="goal-bar">
                  <i style={{ '--p': `${pct}%` }} />
                </span>
                <span className="goal-amt">
                  <CountUp value={g.saved} format={(n) => whole(n)} delay={lead + 400 + r * 110} /> / <b>{whole(g.target)}</b>
                </span>
                <span className="goal-chev">
                  <Icon name="chevDown" size={15} stroke={2} />
                </span>
              </div>
              <div className="goal-more">
                <div>
                  <div className="goal-detail">
                    <dl>
                      <dt>{t('Monthly')}</dt>
                      <dd>{whole(g.monthly)}</dd>
                    </dl>
                    <dl>
                      <dt>{t('Remaining')}</dt>
                      <dd>{whole(Math.max(0, g.target - g.saved))}</dd>
                    </dl>
                    <dl>
                      <dt>{t('Target date')}</dt>
                      <dd>{tMonths(g.due)}</dd>
                    </dl>
                    <div className="goal-add">
                      {[100, 500, 1000].map((a) => (
                        <button key={a} type="button" tabIndex={isOpen ? 0 : -1} disabled={pct >= 100} onClick={() => fundGoal(g.id, a)}>
                          +{whole(a)}
                        </button>
                      ))}
                      <button type="button" className="del" tabIndex={isOpen ? 0 : -1} onClick={() => removeGoal(g.id)}>
                        {t('Remove')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ============================================================
   Extra insights
   ============================================================ */

export function CashFlowCard({ d = 0, className = '' }) {
  const { stats } = useApp()
  const CASHFLOW = stats.cashflow
  const [range, setRange] = useState('12')
  const [show, setShow] = useState({ income: true, expenses: true })
  const lead = useLead()
  const n = Number(range)
  const inc = CASHFLOW.income.slice(-n)
  const exp = CASHFLOW.expenses.slice(-n)
  const totalIn = sum(inc) * 1000
  const totalOut = sum(exp) * 1000
  const flip = (k) =>
    setShow((s) => {
      const next = { ...s, [k]: !s[k] }
      return next.income || next.expenses ? next : s
    })

  return (
    <section className={`card cash-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Cash Flow')}</h2>
          <p className="card-sub">{t('Income vs expenses over the last {n} months', { n })}</p>
        </div>
        <div className="c-tools">
          <div className="legend">
            <button type="button" className={show.income ? '' : 'off'} onClick={() => flip('income')}>
              <i className="sw" style={{ background: 'var(--accent)' }} />
              {t('Income')}
            </button>
            <button type="button" className={show.expenses ? '' : 'off'} onClick={() => flip('expenses')}>
              <i className="sw" style={{ background: 'var(--solid)' }} />
              {t('Expenses')}
            </button>
          </div>
          <Segmented
            items={[
              { key: '6', label: t('6M') },
              { key: '12', label: t('12M') },
            ]}
            value={range}
            onChange={setRange}
          />
        </div>
      </div>
      <div className="cash-sum rv" style={{ '--i': 1 }}>
        <div>
          <small>{t('Money in')}</small>
          <b>
            <CountUp value={totalIn} format={(v) => whole(v)} delay={lead + 200} />
          </b>
        </div>
        <div>
          <small>{t('Money out')}</small>
          <b>
            <CountUp value={totalOut} format={(v) => whole(v)} delay={lead + 260} />
          </b>
        </div>
        <div>
          <small>{t('Net saved')}</small>
          <b style={{ color: 'var(--green)' }}>
            <CountUp value={totalIn - totalOut} format={(v) => whole(v)} delay={lead + 320} />
          </b>
        </div>
      </div>
      <LineChart
        key={range}
        labels={CASHFLOW.labels.slice(-n).map((m) => t(m))}
        height={250}
        series={[
          { name: t('Income'), color: 'var(--accent)', values: inc, fill: true, hidden: !show.income },
          { name: t('Expenses'), color: 'var(--solid)', values: exp, hidden: !show.expenses },
        ]}
      />
    </section>
  )
}

export function SpendingCard({ d = 0, className = '' }) {
  const { stats, openModal } = useApp()
  const CATEGORIES = stats.categories
  const [active, setActive] = useState(null)
  const lead = useLead()
  const total = sum(CATEGORIES, (c) => c.v)
  const a = active != null ? CATEGORIES[active] : null
  const pct = (v) => Math.round((v / total) * 100)
  return (
    <section className={`card spend-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Spending')}</h2>
          <p className="card-sub">{t('By category · {month}', { month: t(stats.monthLabel) })}</p>
        </div>
      </div>
      {total ? null : (
        <CardEmpty
          icon="pie"
          title={t('Nothing spent this month')}
          body={t('Add an expense and it will show up here by category.')}
          action={t('Add expense')}
          onAction={() => openModal('transaction', { type: 'expense' })}
        />
      )}
      <div className="donut-wrap rv" style={{ '--i': 1, display: total ? undefined : 'none' }}>
        <Donut data={CATEGORIES} colors={CAT_COLORS} size={190} stroke={24} active={active} onActive={setActive}>
          {a ? (
            <span key={a.id}>
              <small>{t(a.name)}</small>
              <strong>{whole(a.v)}</strong>
              <small>{t('{pct}% of spend', { pct: pct(a.v) })}</small>
            </span>
          ) : (
            <span key="all">
              <small>{t('Total spent')}</small>
              <strong>
                <CountUp value={total} format={(v) => whole(v)} delay={lead + 300} />
              </strong>
              <small>{t('of {amount} budget', { amount: whole(stats.budgetTotal) })}</small>
            </span>
          )}
        </Donut>
      </div>
      <div className="rv" style={{ '--i': 2 }}>
        <div className={`cat-list ${active != null ? 'dim' : ''}`} onMouseLeave={() => setActive(null)}>
          {CATEGORIES.map((c, i) => (
            <div key={c.id} className={`cat ${active === i ? 'on' : ''}`} onMouseEnter={() => setActive(i)}>
              <i className="sw" style={{ background: CAT_COLORS[i], borderRadius: '50%' }} />
              <span>{t(c.name)}</span>
              <em>{pct(c.v)}%</em>
              <b>{whole(c.v)}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const QUICK = [50, 100, 250, 500]

export function QuickTransferCard({ d = 0, big = false, className = '' }) {
  const { contacts, balance, sendMoney, openModal } = useApp()
  const [to, setTo] = useState(contacts[0]?.id)
  const [amount, setAmount] = useState('250')
  const [sent, setSent] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const n = Number(amount)
  const over = n > balance
  const person = contacts.find((c) => c.id === to) ?? contacts[0]

  const send = () => {
    if (!n || over || sent || !person) return
    sendMoney({ to: person.name, amount: n, note: repeat ? 'Repeats monthly' : '' })
    setSent(true)
    window.setTimeout(() => setSent(false), 1800)
  }

  return (
    <section className={`card qt-card ${big ? 'big' : ''} ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Quick Transfer')}</h2>
          <p className="card-sub">{t('Send to your favourites')}</p>
        </div>
        <span className="pill-tag">
          <Icon name="card" size={14} />
          •••• 4821
        </span>
      </div>
      {contacts.length ? null : (
        <CardEmpty
          icon="user"
          title={t('No contacts yet')}
          body={t('Add the people you pay most often.')}
          action={t('Add contact')}
          onAction={() => openModal('contact')}
        />
      )}
      <div className="people" style={contacts.length ? undefined : { display: 'none' }}>
        {contacts.map((c, i) => (
          <button key={c.id} type="button" className={`person ${person?.id === c.id ? 'on' : ''}`} style={{ '--i': i }} onClick={() => setTo(c.id)}>
            <Persona name={c.name} hue={c.hue} size={big ? 54 : 46} />
            {c.name.split(' ')[0]}
          </button>
        ))}
        {big ? (
          <button type="button" className="person add" style={{ '--i': contacts.length }} onClick={() => openModal('contact')}>
            <span className="persona" style={{ width: 54, height: 54 }}>
              <Icon name="plus" size={20} />
            </span>
            {t('New')}
          </button>
        ) : null}
      </div>
      <label className={`amount-input rv ${over ? 'bad' : ''}`} style={{ '--i': 2 }}>
        <b>$</b>
        <input inputMode="decimal" aria-label={t('Amount')} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        <em>USD</em>
      </label>
      <div className="chips rv" style={{ '--i': 3 }}>
        {QUICK.map((q) => (
          <button key={q} type="button" className={`chip ${n === q ? 'on' : ''}`} onClick={() => setAmount(String(q))}>
            ${q}
          </button>
        ))}
      </div>
      <div className="qt-meta rv" style={{ '--i': 4 }}>
        <div>
          <span>
            <Icon name="bolt" size={16} />
            {t('Arrives')}
          </span>
          <b>{t('Instantly · Free')}</b>
        </div>
        <div>
          <span>
            <Icon name="refresh" size={16} />
            {t('Repeat monthly')}
          </span>
          <Toggle on={repeat} onChange={setRepeat} label={t('Repeat monthly')} />
        </div>
      </div>
      <button type="button" className="btn solid lg block rv" style={{ '--i': 5 }} disabled={!n || over || !person} onClick={send}>
        {sent ? (
          <>
            <Icon name="check" size={18} stroke={2.2} />
            {t('Sent to {name}!', { name: person?.name.split(' ')[0] })}
          </>
        ) : (
          <>
            <Icon name="send" size={18} />
            {!person
              ? t('No contacts yet')
              : n
                ? t('Send {amount} to {name}', { amount: money(n), name: person.name.split(' ')[0] })
                : t('Enter an amount')}
          </>
        )}
      </button>
      <p className="qt-foot rv" style={{ '--i': 6 }}>
        {over ? (
          t('Not enough balance for this transfer')
        ) : (
          <>
            {t('Balance after transfer:')} <b>{money(balance - (n || 0))}</b>
          </>
        )}
      </p>
    </section>
  )
}

export function TxRow({ t: tx, r, full = false }) {
  return (
    <div className="tx-row" style={{ '--r': r }}>
      <MerchantLogo kind={tx.kind} />
      <div className="tx-main">
        <b>{tName(tx.name)}</b>
        <small>{full ? t(tx.category) : `${t(tx.category)} · ${t(tx.method)}`}</small>
      </div>
      {full ? <span className="tx-date tx-hide">{t(tx.method)}</span> : null}
      <span className="tx-date">{stamp(tx.date)}</span>
      <Status value={tx.status} />
      <strong className={`tx-amt ${tx.amount > 0 ? 'in' : ''}`}>{signed(tx.amount)}</strong>
    </div>
  )
}

export function TxCard({ d = 0, className = '', title = 'Recent Transactions', sub = 'Your latest money movements', filter, order, limit = 6 }) {
  const { transactions, go, openModal } = useApp()
  const list = filter ? transactions.filter(filter) : transactions
  const rows = (order ? [...list].sort(order) : list).slice(0, limit)
  return (
    <section className={`card tx-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t(title)}</h2>
          <p className="card-sub">{t(sub)}</p>
        </div>
        <button type="button" className="link" onClick={() => go('dashboard', { tab: 'transactions' })}>
          {t('View all')} <Icon name="arrowRight" size={15} />
        </button>
      </div>
      {rows.length ? (
        <div className="tx-list">
          {rows.map((row, r) => (
            <TxRow key={row.id} t={row} r={r} />
          ))}
        </div>
      ) : (
        <CardEmpty
          icon="receipt"
          title={t('No transactions yet')}
          body={t('Record money in or out and it will appear here.')}
          action={t('Add transaction')}
          onAction={() => openModal('transaction')}
        />
      )}
    </section>
  )
}

export function BillsCard({ d = 0, className = '' }) {
  const { bills: raw, payBill, openModal } = useApp()
  const bills = raw.map((b) => ({ ...b, ...billDue(b) }))
  const paid = bills.filter((b) => b.paid).length
  return (
    <section className={`card bills-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Upcoming Bills')}</h2>
          <p className="card-sub">{t('Due in the next 3 weeks')}</p>
        </div>
        <button type="button" className="icon-btn soft" onClick={() => openModal('bill')} aria-label={t('Add bill')} title={t('Add bill')}>
          <Icon name="plus" size={17} stroke={2.2} />
        </button>
        <div className="bills-sum" style={bills.length ? undefined : { display: 'none' }}>
          <Ring value={bills.length ? paid / bills.length : 0} size={46} stroke={5} color="var(--green)">
            <small style={{ fontSize: 11, fontWeight: 600 }}>
              {paid}/{bills.length}
            </small>
          </Ring>
        </div>
      </div>
      {bills.length ? null : (
        <CardEmpty
          icon="receipt"
          title={t('No upcoming bills')}
          body={t('Add rent, phone or subscriptions to get reminders.')}
          action={t('Add bill')}
          onAction={() => openModal('bill')}
        />
      )}
      <div className="bills">
        {bills.map((b, r) => (
          <div key={b.id} className={`bill ${b.paid ? 'paid' : ''}`} style={{ '--r': r }}>
            <MerchantLogo kind={b.kind} size={40} />
            <div className="bill-main">
              <b>{t(b.name)}</b>
              <small className={!b.paid && b.days <= 5 ? 'soon' : ''}>
                {b.paid
                  ? t('Paid · {date}', { date: tMonths(b.due) })
                  : b.days < 0
                    ? t('{date} · overdue', { date: tMonths(b.due) })
                    : b.days === 0
                      ? t('{date} · due today', { date: tMonths(b.due) })
                      : t('{date} · in {n} days', { date: tMonths(b.due), n: b.days })}
              </small>
            </div>
            <strong>{money(b.amount)}</strong>
            <button
              type="button"
              className={`pay-btn ${b.paid ? 'done' : ''}`}
              disabled={b.paid}
              onClick={() => payBill(b.id)}
              aria-label={b.paid ? t('{name} paid', { name: t(b.name) }) : t('Pay {name}', { name: t(b.name) })}
            >
              {b.paid ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5.5 12.5 4.3 4.3 8.7-9.6" />
                </svg>
              ) : (
                t('Pay')
              )}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export function HealthCard({ d = 0, className = '' }) {
  const { budgets, go, stats } = useApp()
  const lead = useLead()
  const spent = sum(budgets, (b) => b.spent)
  const limit = sum(budgets, (b) => b.limit)
  const top = [...budgets].sort((a, b) => b.spent / b.limit - a.spent / a.limit).slice(0, 4)
  return (
    <section className={`card health-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Budget Health')}</h2>
          <p className="card-sub">{t('{month} spending vs plan', { month: t(stats.monthLabel) })}</p>
        </div>
        <button type="button" className="link" onClick={() => go('budget')}>
          {t('Manage')} <Icon name="arrowRight" size={15} />
        </button>
      </div>
      <div className="health-ring rv" style={{ '--i': 1 }}>
        <Ring value={limit ? spent / limit : 0} size={168} stroke={14}>
          <small>{t('Used')}</small>
          <strong>
            <CountUp value={limit ? (spent / limit) * 100 : 0} format={(v) => `${Math.round(v)}%`} delay={lead + 300} />
          </strong>
          <small>{t('{a} of {b}', { a: whole(spent), b: whole(limit) })}</small>
        </Ring>
      </div>
      <div className="meters">
        {top.map((b, r) => {
          const p = b.spent / b.limit
          return (
            <div key={b.id} className="rv" style={{ '--i': 2 + r * 0.6 }}>
              <div className="meter-top">
                <span>{t(b.name)}</span>
                <b>
                  {whole(b.spent)} <em>/ {whole(b.limit)}</em>
                </b>
              </div>
              <div className="meter">
                <i className={p > 1 ? 'over' : p > 0.9 ? 'warn' : ''} style={{ '--p': `${Math.min(100, p * 100)}%`, '--r': r }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function HeatmapCard({ d = 0, className = '' }) {
  const lead = useLead()
  const { stats } = useApp()
  const HEAT = stats.heat
  const days = HEAT.flat().filter((x) => !x.future)
  const total = sum(days, (x) => x.amt)
  const peak = Math.max(0, ...days.map((x) => x.amt))
  const quiet = days.filter((x) => !x.amt).length
  return (
    <section className={`card heat-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Spending Activity')}</h2>
          <p className="card-sub">{t('Every day of the last 52 weeks')}</p>
        </div>
        <div className="hm-stats">
          <div>
            <small>{t('Daily average')}</small>
            <b>
              <CountUp value={days.length ? total / days.length : 0} format={(v) => money(v)} delay={lead + 300} />
            </b>
          </div>
          <div>
            <small>{t('Biggest day')}</small>
            <b>
              <CountUp value={peak} format={(v) => whole(v)} delay={lead + 360} />
            </b>
          </div>
          <div>
            <small>{t('No-spend days')}</small>
            <b>
              <CountUp value={quiet} delay={lead + 420} />
            </b>
          </div>
        </div>
      </div>
      <Heatmap weeks={HEAT} />
      <div className="hm-foot rv" style={{ '--i': 2 }}>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {t('Hover any day to see what you spent')}
        </span>
        <div className="hm-scale">
          <span>{t('Less')}</span>
          {['l0', 'l1', 'l2', 'l3', 'l4'].map((l) => (
            <i key={l} className={`hm-cell ${l}`} />
          ))}
          <span>{t('More')}</span>
        </div>
      </div>
    </section>
  )
}
