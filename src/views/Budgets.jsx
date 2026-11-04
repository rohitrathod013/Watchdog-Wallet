import { useState } from 'react'
import Icon from '../components/Icon'
import { CountUp, Ring } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { whole } from '../lib/format'
import { CAT_COLORS } from '../data/seed'
import { t } from '../lib/i18n'

function BudgetCard({ b, i, d }) {
  const { setBudgetLimit } = useApp()
  const lead = useLead()
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
          max={4000}
          step={50}
          value={b.limit}
          onChange={(e) => setBudgetLimit(b.id, Number(e.target.value))}
          style={{ '--fill': `${((b.limit - 100) / 3900) * 100}%` }}
          aria-label={t('{name} monthly limit', { name: t(b.name) })}
        />
      </label>
    </section>
  )
}

export default function BudgetsView({ attached = true }) {
  const { budgets } = useApp()
  const lead = useLead()
  const [hot, setHot] = useState(null)
  const spent = budgets.reduce((s, b) => s + b.spent, 0)
  const limit = budgets.reduce((s, b) => s + b.limit, 0)
  const over = budgets.filter((b) => b.spent > b.limit)

  return (
    <>
      <section className={`card budget-sum ${attached ? 'attached' : ''}`} style={{ '--d': '0ms' }}>
        <div className="rv" style={{ '--i': 0 }}>
          <Ring value={spent / limit} size={170} stroke={16} color={spent > limit ? 'var(--red)' : 'var(--accent)'}>
            <small>{t('Used')}</small>
            <strong>
              <CountUp value={(spent / limit) * 100} format={(n) => `${Math.round(n)}%`} delay={lead + 200} />
            </strong>
            <small>{t('of budget')}</small>
          </Ring>
        </div>
        <div className="rv" style={{ '--i': 1 }}>
          <h2 className="card-h">{t('October Budget')}</h2>
          <p className="card-sub">{t('3 days left in this cycle')}</p>
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
                <em>{Math.round((b.spent / spent) * 100)}%</em>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid-3">
        {budgets.map((b, i) => (
          <BudgetCard key={b.id} b={b} i={i} d={120 + i * 70} />
        ))}
      </div>
    </>
  )
}
