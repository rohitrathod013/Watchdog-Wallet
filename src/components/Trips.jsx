/* ------------------------------------------------------------------
   Trip budgets for a group: a total budget and (optionally) one per
   category, with a running total everyone in the group sees. A bill
   split in the group can go to a trip; the trip adds up its splits.
   ------------------------------------------------------------------ */
import { useState } from 'react'
import Icon from './Icon'
import { Modal } from './ui'
import { useApp } from '../lib/store'
import { money } from '../lib/format'
import { t } from '../lib/i18n'
import { expenseCategories } from '../lib/stats'
import { createTrip, deleteTrip } from '../lib/server'
import { useTrips } from '../lib/useTrips'

const r2 = (n) => Math.round(n * 100) / 100

function TripForm({ group, onDone }) {
  const { budgets } = useApp()
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [cats, setCats] = useState({})
  const [error, setError] = useState('')
  const options = ['Travel', 'Food & Dining', 'Transport', 'Entertainment', 'Shopping', 'Other'].filter((c) => expenseCategories(budgets).includes(c))
  const ok = name.trim() && Number(budget) > 0

  const submit = async (e) => {
    e.preventDefault()
    if (!ok) return
    const categories = Object.fromEntries(Object.entries(cats).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]))
    try {
      await createTrip({ group, name: name.trim(), budget: Number(budget), categories, starts: starts || null, ends: ends || null })
      onDone()
    } catch (err) {
      setError(err?.setup ? t('Trips aren’t set up yet: run the latest supabase/schema.sql.') : t('Couldn’t start the trip.'))
    }
  }
  return (
    <form className="form trip-form" onSubmit={submit}>
      <div className="field-row">
        <label className="field">
          <span>{t('Trip')}</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('Goa, June')} autoFocus />
        </label>
        <label className="field">
          <span>{t('Total budget')}</span>
          <div className="amount-input sm">
            <b>$</b>
            <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="2000" />
          </div>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t('From')}</span>
          <input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('To')}</span>
          <input type="date" value={ends} min={starts || undefined} onChange={(e) => setEnds(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <span>{t('By category (optional)')}</span>
        <div className="trip-cats">
          {options.map((c) => (
            <label key={c}>
              <small>{t(c)}</small>
              <div className="amount-input sm">
                <b>$</b>
                <input inputMode="decimal" value={cats[c] ?? ''} onChange={(e) => setCats((m) => ({ ...m, [c]: e.target.value.replace(/[^\d.]/g, '') }))} aria-label={t(c)} />
              </div>
            </label>
          ))}
        </div>
      </div>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-btns">
        <button type="button" className="btn sm" onClick={onDone}>
          {t('Cancel')}
        </button>
        <button type="submit" className="btn sm solid" disabled={!ok}>
          {t('Start trip')}
        </button>
      </div>
    </form>
  )
}

function TripsBody({ payload }) {
  const { social, openModal } = useApp()
  const group = payload?.group
  const { trips, spent, failed, loaded, reload } = useTrips(group)
  const [adding, setAdding] = useState(false)
  if (failed === 'setup') return <p className="muted">{t('Trips aren’t set up yet: run the latest supabase/schema.sql.')}</p>
  return (
    <div className="form trips">
      {trips.map((tr) => {
        const s = spent[tr.id] ?? { total: 0, byCat: {}, count: 0 }
        const pct = Math.min(100, (s.total / Number(tr.budget)) * 100)
        const left = r2(Number(tr.budget) - s.total)
        const cats = Object.entries(tr.categories ?? {})
        return (
          <div key={tr.id} className="trip">
            <div className="trip-head">
              <b>{tr.name}</b>
              <small>{[tr.starts, tr.ends].filter(Boolean).join(' to ')}</small>
              {tr.created_by === social.me ? (
                <button type="button" className="icon-btn soft sm" onClick={() => deleteTrip(tr.id).then(reload).catch(() => null)} aria-label={t('Remove {name}', { name: tr.name })}>
                  <Icon name="trash" size={14} />
                </button>
              ) : null}
            </div>
            <div className="bar">
              <i style={{ width: `${pct}%`, background: left < 0 ? 'var(--red)' : undefined }} />
            </div>
            <small>
              {t('{spent} of {budget} spent', { spent: money(s.total), budget: money(Number(tr.budget)) })} ·{' '}
              {left >= 0 ? t('{amount} left', { amount: money(left) }) : t('{amount} over', { amount: money(-left) })} · {t('{n} bills', { n: s.count })}
            </small>
            {cats.length ? (
              <div className="trip-catlist">
                {cats.map(([c, b]) => {
                  const used = s.byCat[c] ?? 0
                  return (
                    <span key={c} className={used > b ? 'over' : ''}>
                      {t(c)} <b>{money(used)}</b> / {money(b)}
                    </span>
                  )
                })}
              </div>
            ) : null}
            <button type="button" className="btn sm" onClick={() => openModal('split', { group, trip: tr.id })}>
              <Icon name="receipt" size={14} /> {t('Split a bill for this trip')}
            </button>
          </div>
        )
      })}
      {loaded && !trips.length && !adding ? <p className="muted">{t('No trips yet. Start one to give the group a shared budget.')}</p> : null}
      {adding ? (
        <TripForm
          group={group}
          onDone={() => {
            setAdding(false)
            reload()
          }}
        />
      ) : (
        <button type="button" className="btn solid" onClick={() => setAdding(true)}>
          <Icon name="plane" size={16} /> {t('Start a trip budget')}
        </button>
      )}
    </div>
  )
}

export function TripsModal({ open, payload, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Trips')} sub={t('A shared budget the whole group can see')} width={540}>
      {open ? <TripsBody payload={payload} /> : null}
    </Modal>
  )
}
