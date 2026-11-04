import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { Flag, MerchantLogo, Persona } from './Brand'
import { Donut, EarningBars, Heatmap, LineChart } from './Charts'
import { Chg, CountUp, Dropdown, Popover, Ring, Segmented, Status, Toggle } from './ui'
import { useApp, useLead } from '../lib/store'
import { money, signed, stamp, whole } from '../lib/format'
import { CASHFLOW, CAT_COLORS, CATEGORIES, CURRENCIES, EARNINGS, HEAT, INCOME_SOURCES, PERIODS } from '../data/seed'

const sum = (list, f = (x) => x) => list.reduce((s, x) => s + f(x), 0)
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
  const { currency, setCurrency, balance, openModal, live } = useApp()
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
        <h2 className="card-h">Total Balance</h2>
        <div className="anchor">
          <button type="button" className={`cur-btn ${curOpen ? 'on' : ''}`} onClick={() => setCurOpen((o) => !o)} aria-label="Change currency">
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
                  <small>{c.name}</small>
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
          aria-label={hidden ? 'Show balance' : 'Hide balance'}
          aria-pressed={hidden}
        >
          <Icon key={hidden ? 'off' : 'on'} name={hidden ? 'eyeOff' : 'eye'} size={19} />
        </button>
      </div>
      <Chg className="bal-delta rv" style={{ '--i': 2 }} value={12.4} note="vs Last Week" />

      <div className={`pixels ${live ? 'live' : ''}`} aria-hidden="true">
        {PIX.map((col, c) =>
          col.map((l, r) => <i key={`${c}-${r}`} className={`l${l}`} style={{ gridColumn: c + 1, gridRow: r + 1, '--w': c + (4 - r) }} />),
        )}
      </div>

      <div className="bal-actions rv" style={{ '--i': 3 }}>
        <button type="button" className="btn solid xl" onClick={() => openModal('receive')}>
          <Icon name="receive" size={22} />
          Receive Money
        </button>
        <button type="button" className="btn soft xl" onClick={() => openModal('send')}>
          <Icon name="send" size={20} />
          Send Money
        </button>
        <button type="button" className="btn soft xl" onClick={() => openModal('request')}>
          <Icon name="request" size={21} />
          Payment Request
        </button>
      </div>
    </section>
  )
}

export function EarningCard({ d = 0, className = '' }) {
  const [year, setYear] = useState('2026')
  const [sel, setSel] = useState(6)
  const lead = useLead()
  const e = EARNINGS[year]
  return (
    <section className={`card earn-card ${className}`} style={slot(d)}>
      <div className="ec-head rv" style={{ '--i': 0 }}>
        <h2 className="card-h">Earning Overview</h2>
        <Dropdown
          small
          label="Earning period"
          value={year}
          onChange={setYear}
          options={[
            { value: '2026', label: 'This Year' },
            { value: '2025', label: 'Last Year' },
          ]}
        />
      </div>
      <div className="ec-total rv" style={{ '--i': 1 }}>
        <strong>
          <CountUp value={e.total} format={(n) => money(n)} delay={lead + 120} duration={1600} />
        </strong>
        <Chg value={e.delta} note={e.vs} size="sm" />
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
        <h2 className="card-h">{label}</h2>
      </div>
      <strong className="kpi-val rv" style={{ '--i': 1 }}>
        <CountUp value={value} format={format} delay={lead + 120 + i * 90} />
      </strong>
      <Chg className="rv" style={{ '--i': 2 }} value={delta} note={note} size="sm" />
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
          aria-label={`${s.name}: ${s.pct}%, ${whole(s.value)}`}
        >
          <span className="sp-label">{on === i ? <em className={s.dark ? 'dark' : ''}>{whole(s.value)}</em> : `${s.pct}%`}</span>
          <i className="sp-bar" />
          <span className="sp-legend">
            <i />
            {s.name}
          </span>
        </button>
      ))}
    </div>
  )
}

export function NetProfitCard({ d = 0 }) {
  const { period } = useApp()
  const p = PERIODS[period]
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
  const { go } = useApp()
  const lead = useLead()
  const open = () => go('dashboard', { tab: 'reports' })
  return (
    <section
      className="card report-card"
      style={slot(d)}
      role="button"
      tabIndex={0}
      aria-label="Open financial reports"
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
              <small>{p.title}</small>
              <small>{p.date}</small>
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
        Financial
        <br />
        Report
      </h3>
      <div className="rp-foot">
        <strong className="rv" style={{ '--i': 2 }}>
          Total Income Overview
        </strong>
        <div className="rp-cols">
          {INCOME_SOURCES.map((s, i) => (
            <div key={s.id} className="rv" style={{ '--i': 3 + i * 0.6 }}>
              <small>{s.name}</small>
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
        <h2 className="card-h">My Savings Goals</h2>
        <button type="button" className="add-goal" onClick={() => openModal('goal')}>
          <i>
            <Icon name="plus" size={16} stroke={2.2} />
          </i>
          Add Goal
        </button>
      </div>
      <div className="goals">
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
                  <span>{g.name}</span>
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
                      <dt>Monthly</dt>
                      <dd>{whole(g.monthly)}</dd>
                    </dl>
                    <dl>
                      <dt>Remaining</dt>
                      <dd>{whole(Math.max(0, g.target - g.saved))}</dd>
                    </dl>
                    <dl>
                      <dt>Target date</dt>
                      <dd>{g.due}</dd>
                    </dl>
                    <div className="goal-add">
                      {[100, 500, 1000].map((a) => (
                        <button key={a} type="button" tabIndex={isOpen ? 0 : -1} disabled={pct >= 100} onClick={() => fundGoal(g.id, a)}>
                          +{whole(a)}
                        </button>
                      ))}
                      <button type="button" className="del" tabIndex={isOpen ? 0 : -1} onClick={() => removeGoal(g.id)}>
                        Remove
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
          <h2 className="card-h">Cash Flow</h2>
          <p className="card-sub">Income vs expenses over the last {n} months</p>
        </div>
        <div className="c-tools">
          <div className="legend">
            <button type="button" className={show.income ? '' : 'off'} onClick={() => flip('income')}>
              <i className="sw" style={{ background: 'var(--accent)' }} />
              Income
            </button>
            <button type="button" className={show.expenses ? '' : 'off'} onClick={() => flip('expenses')}>
              <i className="sw" style={{ background: 'var(--solid)' }} />
              Expenses
            </button>
          </div>
          <Segmented
            items={[
              { key: '6', label: '6M' },
              { key: '12', label: '12M' },
            ]}
            value={range}
            onChange={setRange}
          />
        </div>
      </div>
      <div className="cash-sum rv" style={{ '--i': 1 }}>
        <div>
          <small>Money in</small>
          <b>
            <CountUp value={totalIn} format={(v) => whole(v)} delay={lead + 200} />
          </b>
        </div>
        <div>
          <small>Money out</small>
          <b>
            <CountUp value={totalOut} format={(v) => whole(v)} delay={lead + 260} />
          </b>
        </div>
        <div>
          <small>Net saved</small>
          <b style={{ color: 'var(--green)' }}>
            <CountUp value={totalIn - totalOut} format={(v) => whole(v)} delay={lead + 320} />
          </b>
        </div>
      </div>
      <LineChart
        key={range}
        labels={CASHFLOW.labels.slice(-n)}
        height={250}
        series={[
          { name: 'Income', color: 'var(--accent)', values: inc, fill: true, hidden: !show.income },
          { name: 'Expenses', color: 'var(--solid)', values: exp, hidden: !show.expenses },
        ]}
      />
    </section>
  )
}

export function SpendingCard({ d = 0, className = '' }) {
  const [active, setActive] = useState(null)
  const lead = useLead()
  const total = sum(CATEGORIES, (c) => c.v)
  const a = active != null ? CATEGORIES[active] : null
  const pct = (v) => Math.round((v / total) * 100)
  return (
    <section className={`card spend-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">Spending</h2>
          <p className="card-sub">By category · October</p>
        </div>
      </div>
      <div className="donut-wrap rv" style={{ '--i': 1 }}>
        <Donut data={CATEGORIES} colors={CAT_COLORS} size={190} stroke={24} active={active} onActive={setActive}>
          {a ? (
            <span key={a.id}>
              <small>{a.name}</small>
              <strong>{whole(a.v)}</strong>
              <small>{pct(a.v)}% of spend</small>
            </span>
          ) : (
            <span key="all">
              <small>Total spent</small>
              <strong>
                <CountUp value={total} format={(v) => whole(v)} delay={lead + 300} />
              </strong>
              <small>of $5,500 budget</small>
            </span>
          )}
        </Donut>
      </div>
      <div className="rv" style={{ '--i': 2 }}>
        <div className={`cat-list ${active != null ? 'dim' : ''}`} onMouseLeave={() => setActive(null)}>
          {CATEGORIES.map((c, i) => (
            <div key={c.id} className={`cat ${active === i ? 'on' : ''}`} onMouseEnter={() => setActive(i)}>
              <i className="sw" style={{ background: CAT_COLORS[i], borderRadius: '50%' }} />
              <span>{c.name}</span>
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
  const [to, setTo] = useState(contacts[0].id)
  const [amount, setAmount] = useState('250')
  const [sent, setSent] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const n = Number(amount)
  const over = n > balance
  const person = contacts.find((c) => c.id === to)

  const send = () => {
    if (!n || over || sent) return
    sendMoney({ to: person.name, amount: n, note: repeat ? 'Repeats monthly' : '' })
    setSent(true)
    window.setTimeout(() => setSent(false), 1800)
  }

  return (
    <section className={`card qt-card ${big ? 'big' : ''} ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">Quick Transfer</h2>
          <p className="card-sub">Send to your favourites</p>
        </div>
        <span className="pill-tag">
          <Icon name="card" size={14} />
          •••• 4821
        </span>
      </div>
      <div className="people">
        {contacts.map((c, i) => (
          <button key={c.id} type="button" className={`person ${to === c.id ? 'on' : ''}`} style={{ '--i': i }} onClick={() => setTo(c.id)}>
            <Persona name={c.name} hue={c.hue} size={big ? 54 : 46} />
            {c.name.split(' ')[0]}
          </button>
        ))}
        {big ? (
          <button type="button" className="person add" style={{ '--i': contacts.length }} onClick={() => openModal('send')}>
            <span className="persona" style={{ width: 54, height: 54 }}>
              <Icon name="plus" size={20} />
            </span>
            New
          </button>
        ) : null}
      </div>
      <label className={`amount-input rv ${over ? 'bad' : ''}`} style={{ '--i': 2 }}>
        <b>$</b>
        <input inputMode="decimal" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
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
            Arrives
          </span>
          <b>Instantly · Free</b>
        </div>
        <div>
          <span>
            <Icon name="refresh" size={16} />
            Repeat monthly
          </span>
          <Toggle on={repeat} onChange={setRepeat} label="Repeat monthly" />
        </div>
      </div>
      <button type="button" className="btn solid lg block rv" style={{ '--i': 5 }} disabled={!n || over} onClick={send}>
        {sent ? (
          <>
            <Icon name="check" size={18} stroke={2.2} />
            Sent to {person.name.split(' ')[0]}!
          </>
        ) : (
          <>
            <Icon name="send" size={18} />
            {n ? `Send ${money(n)} to ${person.name.split(' ')[0]}` : 'Enter an amount'}
          </>
        )}
      </button>
      <p className="qt-foot rv" style={{ '--i': 6 }}>
        {over ? (
          'Not enough balance for this transfer'
        ) : (
          <>
            Balance after transfer: <b>{money(balance - (n || 0))}</b>
          </>
        )}
      </p>
    </section>
  )
}

export function TxRow({ t, r, full = false }) {
  return (
    <div className="tx-row" style={{ '--r': r }}>
      <MerchantLogo kind={t.kind} />
      <div className="tx-main">
        <b>{t.name}</b>
        <small>{full ? t.category : `${t.category} · ${t.method}`}</small>
      </div>
      {full ? <span className="tx-date tx-hide">{t.method}</span> : null}
      <span className="tx-date">{stamp(t.date)}</span>
      <Status value={t.status} />
      <strong className={`tx-amt ${t.amount > 0 ? 'in' : ''}`}>{signed(t.amount)}</strong>
    </div>
  )
}

export function TxCard({ d = 0, className = '', title = 'Recent Transactions', sub = 'Your latest money movements', filter, order, limit = 6 }) {
  const { transactions, go } = useApp()
  const list = filter ? transactions.filter(filter) : transactions
  const rows = (order ? [...list].sort(order) : list).slice(0, limit)
  return (
    <section className={`card tx-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{title}</h2>
          <p className="card-sub">{sub}</p>
        </div>
        <button type="button" className="link" onClick={() => go('dashboard', { tab: 'transactions' })}>
          View all <Icon name="arrowRight" size={15} />
        </button>
      </div>
      <div className="tx-list">
        {rows.map((t, r) => (
          <TxRow key={t.id} t={t} r={r} />
        ))}
      </div>
    </section>
  )
}

export function BillsCard({ d = 0, className = '' }) {
  const { bills, payBill } = useApp()
  const paid = bills.filter((b) => b.paid).length
  return (
    <section className={`card bills-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">Upcoming Bills</h2>
          <p className="card-sub">Due in the next 3 weeks</p>
        </div>
        <div className="bills-sum">
          <Ring value={paid / bills.length} size={46} stroke={5} color="var(--green)">
            <small style={{ fontSize: 11, fontWeight: 600 }}>
              {paid}/{bills.length}
            </small>
          </Ring>
        </div>
      </div>
      <div className="bills">
        {bills.map((b, r) => (
          <div key={b.id} className={`bill ${b.paid ? 'paid' : ''}`} style={{ '--r': r }}>
            <MerchantLogo kind={b.kind} size={40} />
            <div className="bill-main">
              <b>{b.name}</b>
              <small className={!b.paid && b.days <= 5 ? 'soon' : ''}>{b.paid ? `Paid · ${b.due}` : `${b.due} · in ${b.days} days`}</small>
            </div>
            <strong>{money(b.amount)}</strong>
            <button
              type="button"
              className={`pay-btn ${b.paid ? 'done' : ''}`}
              disabled={b.paid}
              onClick={() => payBill(b.id)}
              aria-label={b.paid ? `${b.name} paid` : `Pay ${b.name}`}
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
                'Pay'
              )}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export function HealthCard({ d = 0, className = '' }) {
  const { budgets, go } = useApp()
  const lead = useLead()
  const spent = sum(budgets, (b) => b.spent)
  const limit = sum(budgets, (b) => b.limit)
  const top = [...budgets].sort((a, b) => b.spent / b.limit - a.spent / a.limit).slice(0, 4)
  return (
    <section className={`card health-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">Budget Health</h2>
          <p className="card-sub">October spending vs plan</p>
        </div>
        <button type="button" className="link" onClick={() => go('budget')}>
          Manage <Icon name="arrowRight" size={15} />
        </button>
      </div>
      <div className="health-ring rv" style={{ '--i': 1 }}>
        <Ring value={spent / limit} size={168} stroke={14}>
          <small>Used</small>
          <strong>
            <CountUp value={(spent / limit) * 100} format={(v) => `${Math.round(v)}%`} delay={lead + 300} />
          </strong>
          <small>
            {whole(spent)} of {whole(limit)}
          </small>
        </Ring>
      </div>
      <div className="meters">
        {top.map((b, r) => {
          const p = b.spent / b.limit
          return (
            <div key={b.id} className="rv" style={{ '--i': 2 + r * 0.6 }}>
              <div className="meter-top">
                <span>{b.name}</span>
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
  const days = HEAT.flat().filter((x) => !x.future)
  const total = sum(days, (x) => x.amt)
  const peak = Math.max(...days.map((x) => x.amt))
  const quiet = days.filter((x) => !x.amt).length
  return (
    <section className={`card heat-card ${className}`} style={slot(d)}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">Spending Activity</h2>
          <p className="card-sub">Every day of the last 52 weeks</p>
        </div>
        <div className="hm-stats">
          <div>
            <small>Daily average</small>
            <b>
              <CountUp value={total / days.length} format={(v) => money(v)} delay={lead + 300} />
            </b>
          </div>
          <div>
            <small>Biggest day</small>
            <b>
              <CountUp value={peak} format={(v) => whole(v)} delay={lead + 360} />
            </b>
          </div>
          <div>
            <small>No-spend days</small>
            <b>
              <CountUp value={quiet} delay={lead + 420} />
            </b>
          </div>
        </div>
      </div>
      <Heatmap weeks={HEAT} />
      <div className="hm-foot rv" style={{ '--i': 2 }}>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Hover any day to see what you spent
        </span>
        <div className="hm-scale">
          <span>Less</span>
          {['l0', 'l1', 'l2', 'l3', 'l4'].map((l) => (
            <i key={l} className={`hm-cell ${l}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </section>
  )
}
