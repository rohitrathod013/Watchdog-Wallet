/* ------------------------------------------------------------------
   Planning tools on the Budget page: pause budgets for a trip, the
   emergency fund meter, sinking funds for yearly costs, a paycheque
   breakdown and savings challenges.
   ------------------------------------------------------------------ */
import { useState } from 'react'
import Icon from '../components/Icon'
import { Ring } from '../components/ui'
import { useApp } from '../lib/store'
import { isoDay, money, MONTHS } from '../lib/format'
import { t, tMonths } from '../lib/i18n'
import { expenseCategories } from '../lib/stats'
import { emergencyFund, monthsUntil, noSpend, paycheck as payBreakdown, PAY_EVERY, sinkingMonthly, weekPlan } from '../lib/planning'

const dayText = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${tMonths(MONTHS[m - 1])} ${d}, ${y}`
}

/* ---------------- pause budgets for a trip ---------------- */
function PauseCard({ d }) {
  const { budgetPause, setBudgetPause, budgets, demo } = useApp()
  const today = isoDay(new Date())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(() => {
    const x = new Date()
    x.setDate(x.getDate() + 6)
    return isoDay(x)
  })
  const [note, setNote] = useState('')
  const [only, setOnly] = useState([])
  const active = budgetPause && today >= budgetPause.from && today <= budgetPause.to
  const names = (ids) => budgets.filter((b) => ids.includes(b.id)).map((b) => t(b.name)).join(', ')
  return (
    <section className="card plan-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head">
        <div>
          <h2 className="card-h">
            <Icon name="plane" size={18} /> {t('Pause budgets')}
          </h2>
          <p className="card-sub">{t('On a trip or a holiday? Spending on those days doesn’t count against your budgets.')}</p>
        </div>
      </div>
      {budgetPause ? (
        <div className={`pause-on ${active ? 'live' : ''}`}>
          <p>
            <b>{active ? t('Paused now') : budgetPause.to < today ? t('Pause ended') : t('Pause coming up')}</b>
            {budgetPause.note ? ` · ${budgetPause.note}` : ''}
            <br />
            <small>
              {dayText(budgetPause.from)} to {dayText(budgetPause.to)} · {budgetPause.ids?.length ? names(budgetPause.ids) : t('All budgets')}
            </small>
          </p>
          <button type="button" className="btn" onClick={() => setBudgetPause(null)}>
            {active ? t('Resume budgets') : t('Remove')}
          </button>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            setBudgetPause({ from, to, note, ids: only })
          }}
        >
          <div className="field-row">
            <label className="field">
              <span>{t('From')}</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>{t('To')}</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>{t('What for (optional)')}</span>
            <input value={note} maxLength={40} onChange={(e) => setNote(e.target.value)} placeholder={t('Trip to Lisbon')} />
          </label>
          {budgets.length ? (
            <div className="chips">
              {budgets.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`chip sm ${only.includes(b.id) ? 'on' : ''}`}
                  aria-pressed={only.includes(b.id)}
                  onClick={() => setOnly((l) => (l.includes(b.id) ? l.filter((x) => x !== b.id) : [...l, b.id]))}
                >
                  {t(b.name)}
                </button>
              ))}
            </div>
          ) : null}
          <small className="muted">{only.length ? t('Only the budgets you picked are paused.') : t('Pick budgets to pause only those, or leave them all to pause every one.')}</small>
          <button type="submit" className="btn solid" disabled={demo || !from || !to || to < from}>
            <Icon name="pause" size={16} /> {t('Pause budgets')}
          </button>
        </form>
      )}
    </section>
  )
}

/* ---------------- emergency fund meter ---------------- */
function EmergencyCard({ d }) {
  const { transactions, balance, balances = {}, moneyAccounts = [], goals, stats } = useApp()
  // money you can reach quickly: every account except credit cards, plus a goal for emergencies
  const owedOnCards = moneyAccounts.filter((a) => a.type === 'credit').reduce((s, a) => s + (balances[a.id] ?? 0), 0)
  const rainyDay = goals.filter((g) => /emergenc|rainy/i.test(g.name)).reduce((s, g) => s + g.saved, 0)
  const liquid = balance - owedOnCards + rainyDay
  const e = emergencyFund({ liquid, transactions })
  const pct = e.covered == null ? 0 : Math.min(1, e.covered / 6)
  const color = e.level === 'low' ? 'var(--red)' : e.level === 'building' ? 'var(--amber)' : 'var(--green)'
  return (
    <section className="card plan-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head">
        <div>
          <h2 className="card-h">
            <Icon name="shield" size={18} /> {t('Emergency fund')}
          </h2>
          <p className="card-sub">{t('Months of spending your cash and savings would cover. Aim for 3 to 6.')}</p>
        </div>
      </div>
      {stats.demo || e.covered == null ? (
        <p className="muted">{t('Once you have a month of spending recorded, this shows how long your savings would last.')}</p>
      ) : (
        <div className="ef-row">
          <Ring value={pct} size={110} stroke={10} color={color}>
            <b>{e.covered}</b>
            <small>{t('months')}</small>
          </Ring>
          <div className="ef-text">
            <p>
              {t('{amount} you can reach quickly, against {monthly} of spending a month.', { amount: money(e.liquid), monthly: money(e.monthly) })}
            </p>
            <p>
              <b>
                {e.level === 'low'
                  ? t('Start with one month: {amount} to go.', { amount: money(Math.max(0, e.monthly - e.liquid)) })
                  : e.level === 'building'
                    ? t('{amount} more gets you to 3 months.', { amount: money(e.toThree) })
                    : e.level === 'good'
                      ? t('Solid. {amount} more gets you to 6 months.', { amount: money(e.toSix) })
                      : t('6 months or more. You’re well covered.')}
              </b>
            </p>
            <div className="ef-scale" aria-hidden="true">
              {[1, 3, 6].map((m) => (
                <span key={m} style={{ left: `${(m / 6) * 100}%` }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* ---------------- sinking funds ---------------- */
function SinkingCard({ d }) {
  const { goals, addGoal, fundGoal, paySinking, removeGoal, budgets, demo, balance } = useApp()
  const funds = goals.filter((g) => g.sinking)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState('')
  const [category, setCategory] = useState('Insurance')
  const [tomorrow] = useState(() => {
    const x = new Date()
    x.setDate(x.getDate() + 1)
    return isoDay(x)
  })
  const ok = name.trim() && Number(amount) > 0 && due >= tomorrow
  const preview = ok ? sinkingMonthly({ target: Number(amount), saved: 0, dueDate: due }) : 0

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    addGoal({ name: name.trim(), target: Number(amount), saved: 0, icon: 'calendar', monthly: preview, due: dayText(due), sinking: true, dueDate: due, category })
    setOpen(false)
    setName('')
    setAmount('')
    setDue('')
  }

  return (
    <section className="card plan-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head">
        <div>
          <h2 className="card-h">
            <Icon name="calendar" size={18} /> {t('Sinking funds')}
          </h2>
          <p className="card-sub">{t('Save a little each month for yearly costs, like insurance or car registration.')}</p>
        </div>
        {open || demo ? null : (
          <button type="button" className="btn sm" onClick={() => setOpen(true)}>
            <Icon name="plus" size={15} /> {t('Add')}
          </button>
        )}
      </div>
      {open ? (
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>{t('What is it for?')}</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('Car insurance')} autoFocus />
          </label>
          <div className="field-row">
            <label className="field">
              <span>{t('Yearly cost')}</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="1200" />
            </label>
            <label className="field">
              <span>{t('Next due')}</span>
              <input type="date" value={due} min={tomorrow} onChange={(e) => setDue(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>{t('Category')}</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {expenseCategories(budgets).map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </label>
          {ok ? <p className="sink-preview">{t('Put aside {amount} a month to have it in time.', { amount: money(preview) })}</p> : null}
          <div className="row-btns">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {t('Cancel')}
            </button>
            <button type="submit" className="btn solid" disabled={!ok}>
              {t('Add fund')}
            </button>
          </div>
        </form>
      ) : null}
      {funds.length ? (
        <div className="sink-list">
          {funds.map((g) => {
            const monthly = sinkingMonthly(g)
            const full = g.saved >= g.target
            const add = Math.min(monthly || g.target - g.saved, Math.max(0, balance))
            return (
              <div key={g.id} className="sink-row">
                <div className="sink-top">
                  <b>{g.name}</b>
                  <small>
                    {money(g.saved)} / {money(g.target)} · {t('due {date}', { date: dayText(g.dueDate) })}
                  </small>
                </div>
                <div className="bar">
                  <i style={{ width: `${Math.min(100, (g.saved / g.target) * 100)}%` }} />
                </div>
                <div className="sink-acts">
                  <small>
                    {full
                      ? t('Fully saved.')
                      : t('{amount} a month for {n} months', { amount: money(monthly), n: monthsUntil(g.dueDate) })}
                  </small>
                  {full ? null : (
                    <button type="button" className="btn sm" disabled={!(add > 0)} onClick={() => fundGoal(g.id, add)}>
                      {t('Put in {amount}', { amount: money(add) })}
                    </button>
                  )}
                  <button type="button" className="btn sm solid" onClick={() => paySinking(g.id)}>
                    {t('It’s paid')}
                  </button>
                  <button type="button" className="icon-btn soft sm" onClick={() => removeGoal(g.id)} aria-label={t('Remove {name}', { name: g.name })}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : open ? null : (
        <p className="muted">{t('No sinking funds yet.')}</p>
      )}
    </section>
  )
}

/* ---------------- paycheque breakdown ---------------- */
const PAY_FIELDS = [
  ['federal', 'Federal tax', '%'],
  ['state', 'State tax', '%'],
  ['socialSecurity', 'Social Security', '%'],
  ['medicare', 'Medicare', '%'],
  ['retirement', 'Retirement (401k)', '%'],
  ['health', 'Health insurance', '$'],
  ['other', 'Other deductions', '$'],
]
const EVERY_NAME = { weekly: 'Every week', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Every month' }

function PaycheckCard({ d }) {
  const { paycheck, setPaycheck, addTransaction, incomeSplit, openModal, demo } = useApp()
  const p = payBreakdown(paycheck)
  const set = (k) => (e) => setPaycheck((x) => ({ ...x, [k]: e.target.value.replace(/[^\d.]/g, '') }))
  const splitting = incomeSplit?.on && incomeSplit.parts?.length
  return (
    <section className="card plan-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head">
        <div>
          <h2 className="card-h">
            <Icon name="calc" size={18} /> {t('Paycheque breakdown')}
          </h2>
          <p className="card-sub">{t('From gross pay to take-home, then into your pots. Use your own rates: these are rough starting points.')}</p>
        </div>
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t('Gross pay')}</span>
          <div className="amount-input">
            <b>$</b>
            <input inputMode="decimal" placeholder="0.00" value={paycheck.gross || ''} onChange={set('gross')} />
          </div>
        </label>
        <label className="field">
          <span>{t('Paid')}</span>
          <select value={paycheck.every} onChange={(e) => setPaycheck((x) => ({ ...x, every: e.target.value }))}>
            {Object.keys(PAY_EVERY).map((k) => (
              <option key={k} value={k}>
                {t(EVERY_NAME[k])}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pay-grid">
        {PAY_FIELDS.map(([k, label, unit]) => (
          <label key={k} className="field sm">
            <span>{t(label)}</span>
            <div className="amount-input sm">
              {unit === '$' ? <b>$</b> : null}
              <input inputMode="decimal" value={paycheck[k]} onChange={set(k)} aria-label={t(label)} />
              {unit === '%' ? <em>%</em> : null}
            </div>
          </label>
        ))}
      </div>
      {p.gross > 0 ? (
        <div className="pay-out">
          <div className="pay-lines">
            {p.lines.map((l) => (
              <span key={l.key}>
                {t(l.name)} <b>−{money(l.amount)}</b>
              </span>
            ))}
          </div>
          <div className="pay-take">
            <small>{t('Take-home per paycheque')}</small>
            <strong>{money(p.takeHome)}</strong>
            <small>
              {t('{rate}% deducted · {monthly} a month · {yearly} a year', { rate: p.rate, monthly: money(p.monthly), yearly: money(p.yearly.takeHome) })}
            </small>
          </div>
          <div className="row-btns">
            <button type="button" className="btn" onClick={() => openModal('split-income')}>
              <Icon name="pie" size={15} /> {splitting ? t('Change how pay is split') : t('Split pay into pots')}
            </button>
            <button
              type="button"
              className="btn solid"
              disabled={demo || !(p.takeHome > 0)}
              onClick={() => addTransaction({ name: 'Paycheque', amount: p.takeHome, category: 'Salary', method: 'Direct deposit' })}
            >
              <Icon name="receive" size={15} /> {t('Record {amount} pay', { amount: money(p.takeHome) })}
            </button>
          </div>
          {splitting ? <small className="muted">{t('Recording it splits it into your pots and goals by your income split.')}</small> : null}
        </div>
      ) : null}
    </section>
  )
}

/* ---------------- savings challenges ---------------- */
function ChallengesCard({ d }) {
  const { challenges = [], startChallenge, stopChallenge, saveWeek, transactions, demo, balance } = useApp()
  const ns = challenges.find((c) => c.type === 'nospend')
  const wk = challenges.find((c) => c.type === 'week52')
  const n = ns ? noSpend(ns, transactions) : null
  const w = wk ? weekPlan(wk) : null
  return (
    <section className="card plan-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head">
        <div>
          <h2 className="card-h">
            <Icon name="trophy" size={18} /> {t('Savings challenges')}
          </h2>
          <p className="card-sub">{t('Small games that add up. Keep the streak going.')}</p>
        </div>
      </div>
      <div className="chal">
        <div className="chal-head">
          <b>{t('No-spend week')}</b>
          {n ? (
            <span className="streak" title={t('Streak')}>
              🔥 {n.streak}
            </span>
          ) : null}
        </div>
        {n ? (
          <>
            <div className="ns-days">
              {n.days.map((x) => (
                <span key={x.day} className={`ns-day ${x.state}`} title={`${x.day}: ${t(x.state === 'kept' ? 'Kept' : x.state === 'spent' ? 'Spent on extras' : x.state === 'today' ? 'Today' : 'Coming up')}`}>
                  {Number(x.day.slice(8))}
                </span>
              ))}
            </div>
            <small className="muted">
              {n.done
                ? n.won
                  ? t('You did it: {n} days with no extras!', { n: n.length })
                  : t('Finished: {kept} of {n} days kept.', { kept: n.kept, n: n.length })
                : t('Rent, bills, groceries and other must-haves don’t break it. Eating out and shopping do.')}
            </small>
            <button type="button" className="link" onClick={() => stopChallenge(ns.id)}>
              {n.done ? t('Clear') : t('Stop')}
            </button>
          </>
        ) : (
          <button type="button" className="btn sm" disabled={demo} onClick={() => startChallenge('nospend', { days: 7 })}>
            {t('Start a no-spend week')}
          </button>
        )}
      </div>
      <div className="chal">
        <div className="chal-head">
          <b>{t('52-week challenge')}</b>
          {w ? (
            <span className="streak" title={t('Streak')}>
              🔥 {w.streak}
            </span>
          ) : null}
        </div>
        {w ? (
          <>
            <div className="bar">
              <i style={{ width: `${Math.min(100, (w.saved / w.target) * 100)}%` }} />
            </div>
            <small>
              {t('Week {n} of 52 · {saved} of {target} saved', { n: w.week, saved: money(w.saved), target: money(w.target) })}
            </small>
            <div className="row-btns">
              {w.dueSaved ? (
                <span className="muted">
                  <Icon name="check" size={14} /> {t('This week is done.')}
                </span>
              ) : (
                <button type="button" className="btn sm solid" disabled={balance < w.due} onClick={() => saveWeek(wk.id, w.week)}>
                  {t('Put aside {amount}', { amount: money(w.due) })}
                </button>
              )}
              {w.missed.length ? (
                <button type="button" className="btn sm" disabled={balance < w.missed[0] * (wk.step || 1)} onClick={() => saveWeek(wk.id, w.missed[0])}>
                  {t('Catch up week {n}', { n: w.missed[0] })}
                </button>
              ) : null}
              <button type="button" className="link" onClick={() => stopChallenge(wk.id)}>
                {t('Stop')}
              </button>
            </div>
          </>
        ) : (
          <>
            <small className="muted">{t('Week 1 put aside $1, week 2 $2, and so on: $1,378 by the end of the year.')}</small>
            <button type="button" className="btn sm" disabled={demo} onClick={() => startChallenge('week52', { step: 1 })}>
              {t('Start the 52-week challenge')}
            </button>
          </>
        )}
      </div>
    </section>
  )
}

export default function PlanningView() {
  return (
    <div className="plan-grid">
      <EmergencyCard d={60} />
      <PauseCard d={90} />
      <SinkingCard d={120} />
      <ChallengesCard d={150} />
      <PaycheckCard d={180} />
    </div>
  )
}
