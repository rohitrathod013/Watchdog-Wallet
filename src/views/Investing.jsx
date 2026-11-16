/* ------------------------------------------------------------------
   Investing in detail, next to My Investments: allocation, how the
   portfolio compares with the S&P 500, realised gains, dividends and
   each holding's lots (cost basis).
   ------------------------------------------------------------------ */
import { useState } from 'react'
import Icon from '../components/Icon'
import { CAT_COLORS } from '../data/seed'
import { useApp } from '../lib/store'
import { isoDay, money, stamp } from '../lib/format'
import { t } from '../lib/i18n'
import { allocation, investIncome, lotsOf, vsSp500 } from '../lib/lots'
import { useHoldingPrices } from '../lib/useHoldingPrices'

const qtyText = (n) => (n >= 1 ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : n.toLocaleString(undefined, { maximumSignificantDigits: 4 }))

function Donut({ rows }) {
  const r = 42
  const c = 2 * Math.PI * r
  // where each slice starts: the slices before it, added up
  const starts = rows.map((_, i) => rows.slice(0, i).reduce((s, x) => s + (x.pct / 100) * c, 0))
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={rows.map((x) => `${x.symbol} ${x.pct}%`).join(', ')}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--soft)" strokeWidth="16" />
      {rows.map((x, i) => {
        const len = (x.pct / 100) * c
        const el = (
          <circle
            key={x.id}
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={CAT_COLORS[i % CAT_COLORS.length]}
            strokeWidth="16"
            strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
            strokeDashoffset={-starts[i]}
            transform="rotate(-90 60 60)"
          />
        )
        return el
      })}
    </svg>
  )
}

function DividendForm({ holdings, onDone }) {
  const { addDividend } = useApp()
  const [id, setId] = useState(holdings[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(isoDay(new Date()))
  const h = holdings.find((x) => x.id === id)
  return (
    <form
      className="div-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (addDividend({ holding: h, amount, date })) onDone()
      }}
    >
      <select value={id} onChange={(e) => setId(e.target.value)} aria-label={t('Holding')}>
        {holdings.map((x) => (
          <option key={x.id} value={x.id}>
            {x.symbol}
          </option>
        ))}
      </select>
      <div className="amount-input sm">
        <b>$</b>
        <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} aria-label={t('Amount')} autoFocus />
      </div>
      <input type="date" value={date} max={isoDay(new Date())} onChange={(e) => setDate(e.target.value)} aria-label={t('Date')} />
      <button type="submit" className="btn sm solid" disabled={!(Number(amount) > 0) || !h}>
        {t('Add')}
      </button>
      <button type="button" className="btn sm" onClick={onDone}>
        {t('Cancel')}
      </button>
    </form>
  )
}

export default function InvestingCard({ d = 0, className = '' }) {
  const { holdings = [], investLog, demo } = useApp()
  const live = useHoldingPrices(holdings, { spy: true })
  const [tab, setTab] = useState('mix')
  const [adding, setAdding] = useState(false)
  if (!holdings.length && !(investLog?.realised?.length || investLog?.dividends?.length)) return null
  const mix = allocation(holdings, live.prices)
  const cmp = vsSp500(holdings, live.prices, live.spy)
  const all = investIncome(investLog)
  const year = investIncome(investLog, new Date().getFullYear())

  return (
    <section className={`card invest-card ${className}`} style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Investing in detail')}</h2>
          <p className="card-sub">{t('Allocation, the S&P 500, gains, dividends and what each lot cost')}</p>
        </div>
        <div className="seg-mini" role="tablist">
          {[
            ['mix', 'Allocation'],
            ['gains', 'Gains'],
            ['lots', 'Lots'],
          ].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'mix' ? (
        <>
          <div className="alloc rv" style={{ '--i': 1 }}>
            <Donut rows={mix.rows} />
            <div className="alloc-list">
              {mix.rows.map((x, i) => (
                <span key={x.id}>
                  <i className="sw" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                  {x.symbol} <b>{x.pct}%</b> <small>{money(x.value)}</small>
                </span>
              ))}
              <small className="muted">
                {mix.byKind.map((k) => `${k.kind === 'crypto' ? t('Crypto') : t('Stocks')} ${k.pct}%`).join(' · ')}
              </small>
            </div>
          </div>
          <div className="vs-spy rv" style={{ '--i': 2 }}>
            <b>{t('vs the S&P 500')}</b>
            {cmp ? (
              <>
                <div className="spy-bars">
                  <span>
                    {t('Your picks')} <b className={cmp.minePct < 0 ? 'neg' : ''}>{cmp.minePct >= 0 ? '+' : ''}{cmp.minePct}%</b>
                  </span>
                  <span>
                    {t('S&P 500 (SPY)')} <b className={cmp.spyPct < 0 ? 'neg' : ''}>{cmp.spyPct >= 0 ? '+' : ''}{cmp.spyPct}%</b>
                  </span>
                </div>
                <small className="muted">
                  {cmp.ahead >= 0
                    ? t('{amount} ahead of putting the same money in the S&P 500 on the same days.', { amount: money(cmp.ahead) })
                    : t('{amount} behind putting the same money in the S&P 500 on the same days.', { amount: money(-cmp.ahead) })}
                </small>
              </>
            ) : (
              <small className="muted">
                {live.ready && !live.spy
                  ? t('The S&P 500 price isn’t available right now.')
                  : t('Buys from now on remember the S&P 500’s price that day, so they can be compared.')}
              </small>
            )}
          </div>
        </>
      ) : tab === 'gains' ? (
        <div className="gains rv" style={{ '--i': 1 }}>
          <div className="tax-tiles">
            <div>
              <small>{t('Realised this year')}</small>
              <b className={year.gains < 0 ? 'neg' : ''}>{money(year.gains)}</b>
            </div>
            <div>
              <small>{t('Dividends this year')}</small>
              <b>{money(year.dividendTotal)}</b>
            </div>
            <div>
              <small>{t('Realised all time')}</small>
              <b className={all.gains < 0 ? 'neg' : ''}>{money(all.gains)}</b>
            </div>
          </div>
          <div className="gain-list">
            {[...all.realised.map((x) => ({ ...x, k: 'sale' })), ...all.dividends.map((x) => ({ ...x, k: 'div' }))]
              .sort((a, b) => String(b.at).localeCompare(String(a.at)))
              .slice(0, 12)
              .map((x) => (
                <span key={x.id}>
                  <small>{stamp(x.at)}</small>
                  {x.k === 'sale' ? (
                    <>
                      {t('Sold {qty} {symbol}', { qty: qtyText(x.qty), symbol: x.symbol })}
                      {x.longTerm ? <em className="lt">{t('long term')}</em> : null}
                      <b className={x.gain < 0 ? 'neg' : 'pos'}>
                        {x.gain >= 0 ? '+' : '−'}
                        {money(Math.abs(x.gain))}
                      </b>
                    </>
                  ) : (
                    <>
                      {t('Dividend from {symbol}', { symbol: x.symbol })}
                      <b className="pos">+{money(x.amount)}</b>
                    </>
                  )}
                </span>
              ))}
          </div>
          {holdings.length && !demo ? (
            adding ? (
              <DividendForm holdings={holdings} onDone={() => setAdding(false)} />
            ) : (
              <button type="button" className="btn sm" onClick={() => setAdding(true)}>
                <Icon name="plus" size={14} /> {t('Record a dividend')}
              </button>
            )
          ) : null}
        </div>
      ) : (
        <div className="lots rv" style={{ '--i': 1 }}>
          {holdings.map((h) => {
            const price = live.prices[`${h.kind}:${h.asset}`]
            return (
              <div key={h.id} className="lot-group">
                <b>
                  {h.name} <small>{t('cost basis {amount}', { amount: money(h.cost) })}</small>
                </b>
                {lotsOf(h).map((l, i) => {
                  const value = price ? l.qty * price : null
                  return (
                    <span key={l.id ?? i}>
                      <small>{l.at ? stamp(l.at) : t('Earlier')}</small>
                      {qtyText(l.qty)} {h.symbol} {t('for {amount}', { amount: money(l.cost) })}
                      {value != null ? (
                        <b className={value - l.cost < 0 ? 'neg' : 'pos'}>
                          {value - l.cost >= 0 ? '+' : '−'}
                          {money(Math.abs(value - l.cost))}
                        </b>
                      ) : null}
                    </span>
                  )
                })}
              </div>
            )
          })}
          <small className="muted">{t('When you sell, the oldest lots go first (FIFO).')}</small>
        </div>
      )}
    </section>
  )
}
