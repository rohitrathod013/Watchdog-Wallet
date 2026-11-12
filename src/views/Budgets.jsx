import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { CountUp, Ring } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { whole } from '../lib/format'
import { CAT_COLORS } from '../data/seed'
import { t } from '../lib/i18n'
import { iconOfCategory, SPENDING_CATEGORIES } from '../lib/stats'

/* a new budget: any spending category without one yet, or a name of the user's own */
function AddBudget({ d }) {
  const { budgets, addBudget } = useApp()
  const taken = new Set(budgets.map((b) => b.name.toLowerCase()))
  const free = SPENDING_CATEGORIES.filter((c) => !taken.has(c.name.toLowerCase()))
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState('')
  const [own, setOwn] = useState('')
  const [limit, setLimit] = useState('300')
  const name = pick === '__own' ? own.trim() : pick || free[0]?.name || ''
  const clash = pick === '__own' && taken.has(own.trim().toLowerCase())
  const ok = name && !clash && Number(limit) > 0

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    if (addBudget({ name, limit: Number(limit) })) {
      setOpen(false)
      setPick('')
      setOwn('')
      setLimit('300')
    }
  }

  if (!open)
    return (
      <button type="button" className="card budget budget-add" style={{ '--d': `${d}ms` }} onClick={() => setOpen(true)}>
        <span className="budget-add-ic">
          <Icon name="plus" size={22} />
        </span>
        <b>{t('Add a budget')}</b>
        <small>{t('{n} more categories to choose from, or make your own', { n: free.length })}</small>
      </button>
    )

  return (
    <form className="card budget budget-form" style={{ '--d': `${d}ms` }} onSubmit={submit}>
      <div className="budget-top">
        <span className="tile-logo" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Icon name={iconOfCategory(name)} size={20} stroke={1.9} />
        </span>
        <b>{t('New budget')}</b>
      </div>
      <label className="field">
        <span>{t('Category')}</span>
        <select value={pick || free[0]?.name || '__own'} onChange={(e) => setPick(e.target.value)} autoFocus>
          {free.map((c) => (
            <option key={c.name} value={c.name}>
              {t(c.name)}
            </option>
          ))}
          <option value="__own">{t('My own category…')}</option>
        </select>
      </label>
      {pick === '__own' || !free.length ? (
        <label className="field">
          <span>{t('Category name')}</span>
          <input value={own} onChange={(e) => setOwn(e.target.value)} maxLength={40} placeholder={t('Coffee, hobbies, car repairs…')} />
          {clash ? <small className="err">{t('You already have a budget with that name.')}</small> : null}
        </label>
      ) : null}
      <label className="field">
        <span>{t('Monthly limit')}</span>
        <input type="number" inputMode="decimal" min="1" step="any" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </label>
      <div className="budget-form-btns">
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          {t('Cancel')}
        </button>
        <button type="submit" className="btn solid" disabled={!ok}>
          {t('Add budget')}
        </button>
      </div>
    </form>
  )
}

function BudgetCard({ b, i, d }) {
  const { setBudgetLimit, removeBudget } = useApp()
  const lead = useLead()
  // remove needs a second tap within a few seconds
  const [sure, setSure] = useState(false)
  useEffect(() => {
    if (!sure) return undefined
    const timer = window.setTimeout(() => setSure(false), 3000)
    return () => window.clearTimeout(timer)
  }, [sure])
  const top = Math.max(4000, Math.ceil((b.limit * 1.5) / 500) * 500)
  const p = b.spent / b.limit
  const tone = p > 1 ? 'over' : p > 0.9 ? 'warn' : ''
  const color = CAT_COLORS[i % CAT_COLORS.length]
  return (
    <section className="card budget" style={{ '--d': `${d}ms` }}>
      <div className="budget-top rv" style={{ '--i': 0 }}>
        <span className="tile-logo" style={{ background: `color-mix(in srgb, ${color} 14%, var(--card))`, color }}>
          <Icon name={b.icon} size={20} stroke={1.9} />
        </span>
        <b>{t(b.name)}</b>
        <span className={`pill-tag ${p > 1 ? 'red' : p > 0.9 ? 'amber' : 'green'}`}>
          {p > 1 ? t('Over budget') : p > 0.9 ? t('Near limit') : t('On track')}
        </span>
        {removeBudget ? (
          <button
            type="button"
            className={`budget-del ${sure ? 'sure' : ''}`}
            onClick={() => (sure ? removeBudget(b.id) : setSure(true))}
            aria-label={sure ? t('Tap again to remove {name}', { name: t(b.name) }) : t('Remove the {name} budget', { name: t(b.name) })}
            title={sure ? t('Tap again to remove') : t('Remove budget')}
          >
            {sure ? t('Remove?') : <Icon name="trash" size={15} />}
          </button>
        ) : null}
      </div>
      <div className="budget-nums rv" style={{ '--i': 1 }}>
        <strong>
          <CountUp value={b.spent} format={(n) => whole(n)} delay={lead + 200 + i * 60} />
        </strong>
        <span>{t('of {amount}', { amount: whole(b.limit) })}</span>
      </div>
      <div className="meter rv" style={{ '--i': 2 }}>
        <i className={tone} style={{ '--p': `${Math.min(100, p * 100)}%`, '--r': i }} />
      </div>
      <div className="budget-foot rv" style={{ '--i': 3 }}>
        <span>
          {p > 1 ? t('{amount} over plan', { amount: whole(b.spent - b.limit) }) : t('{amount} left to spend', { amount: whole(b.limit - b.spent) })}
        </span>
        <b>{Math.round(p * 100)}%</b>
      </div>
      <label className="range rv" style={{ '--i': 4 }}>
        <span>
          <span>{t('Monthly limit')}</span>
          <b style={{ color: 'var(--ink)' }}>{whole(b.limit)}</b>
        </span>
        <input
          type="range"
          min={100}
          max={top}
          step={50}
          value={b.limit}
          onChange={(e) => setBudgetLimit(b.id, Number(e.target.value))}
          style={{ '--fill': `${((b.limit - 100) / (top - 100)) * 100}%` }}
          aria-label={t('{name} monthly limit', { name: t(b.name) })}
        />
      </label>
    </section>
  )
}

export default function BudgetsView({ attached = true }) {
  const { budgets, stats, addBudget } = useApp()
  const now = new Date()
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
  const lead = useLead()
  const [hot, setHot] = useState(null)
  const spent = budgets.reduce((s, b) => s + b.spent, 0)
  const limit = budgets.reduce((s, b) => s + b.limit, 0)
  const over = budgets.filter((b) => b.spent > b.limit)

  return (
    <>
      <section className={`card budget-sum ${attached ? 'attached' : ''}`} style={{ '--d': '0ms' }}>
        <div className="rv" style={{ '--i': 0 }}>
          <Ring value={limit ? spent / limit : 0} size={170} stroke={16} color={spent > limit ? 'var(--red)' : 'var(--accent)'}>
            <small>{t('Used')}</small>
            <strong>
              <CountUp value={limit ? (spent / limit) * 100 : 0} format={(n) => `${Math.round(n)}%`} delay={lead + 200} />
            </strong>
            <small>{t('of budget')}</small>
          </Ring>
        </div>
        <div className="rv" style={{ '--i': 1 }}>
          <h2 className="card-h">{t('{month} Budget', { month: t(stats.monthLabel) })}</h2>
          <p className="card-sub">
            {stats.demo
              ? t('3 days left in this cycle')
              : daysLeft === 1
                ? t('1 day left in this cycle')
                : t('{n} days left in this cycle', { n: daysLeft })}
          </p>
          <div className="bs-stats" style={{ marginTop: 20 }}>
            <div>
              <small>{t('Total budget')}</small>
              <b>
                <CountUp value={limit} format={(n) => whole(n)} delay={lead + 260} />
              </b>
            </div>
            <div>
              <small>{t('Spent')}</small>
              <b>
                <CountUp value={spent} format={(n) => whole(n)} delay={lead + 320} />
              </b>
            </div>
            <div>
              <small>{spent > limit ? t('Over plan') : t('Remaining')}</small>
              <b style={{ color: spent > limit ? 'var(--red)' : 'var(--green)' }}>
                <CountUp value={Math.abs(limit - spent)} format={(n) => whole(n)} delay={lead + 380} />
              </b>
            </div>
            <div>
              <small>{t('Over budget')}</small>
              <b>{over.length === 1 ? t('1 category') : t('{n} categories', { n: over.length })}</b>
            </div>
          </div>
        </div>
        <div className="rv" style={{ '--i': 2 }}>
          <span className="card-sub">{t('Where the money went')}</span>
          <div className={`stacked ${hot != null ? 'dim' : ''}`}>
            {budgets.map((b, i) => (
              <i
                key={b.id}
                className={hot === i ? 'on' : ''}
                style={{ '--w': b.spent, '--c': CAT_COLORS[i % CAT_COLORS.length], '--i': i }}
                onMouseEnter={() => setHot(i)}
                onMouseLeave={() => setHot(null)}
              />
            ))}
          </div>
          <div className="stack-legend">
            {budgets.map((b, i) => (
              <span key={b.id} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}>
                <i className="sw" style={{ background: CAT_COLORS[i % CAT_COLORS.length], borderRadius: '50%' }} />
                {t(b.name)}
                <em>{spent ? Math.round((b.spent / spent) * 100) : 0}%</em>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid-3">
        {budgets.map((b, i) => (
          <BudgetCard key={b.id} b={b} i={i} d={120 + i * 70} />
        ))}
        {addBudget ? <AddBudget d={120 + budgets.length * 70} /> : null}
      </div>
    </>
  )
}
