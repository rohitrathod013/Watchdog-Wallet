import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { Flag, Logo, Mastercard } from '../components/Brand'
import { BalanceCard, BillsCard, CardEmpty, PotsCard } from '../components/Cards'
import { CountUp, PageHead, Stage } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { money, whole } from '../lib/format'
import { CURRENCIES } from '../data/seed'
import { BRAND } from '../config'
import { t } from '../lib/i18n'
import { CARD_NETWORKS, CARD_SKINS, lastFour } from '../lib/stats'
import { TermsAgree, TermsLink } from '../components/Terms'
import { useTerms } from '../lib/terms'

const PIXELS = [1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1]

const NETWORK_NAME = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', rupay: 'RuPay', other: 'Card' }

function NetworkMark({ network }) {
  if (!network || network === 'mastercard') return <Mastercard />
  return <span className="bc-network">{network === 'other' ? '' : NETWORK_NAME[network]}</span>
}

function BankCard({ card, flipped, onFlip, style, onRemove }) {
  const digits = lastFour(card)
  const own = Boolean(card.last4)
  // remove needs a second tap within a few seconds
  const [sure, setSure] = useState(false)
  useEffect(() => {
    if (!sure) return undefined
    const timer = window.setTimeout(() => setSure(false), 3000)
    return () => window.clearTimeout(timer)
  }, [sure])
  return (
    <div
      className={`bank-card ${card.skin} ${flipped ? 'flipped' : ''}`}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`${t('{name} ending {digits}', { name: t(card.label), digits })}. ${flipped ? t('Showing back') : own ? t('Tap for card options') : t('Tap to see CVV')}`}
      onClick={onFlip}
      onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFlip())}
    >
      <div className="bc-inner">
        <div className="bc-face bc-front">
          <div className="bc-top">
            <Logo size={26} />
            <b>{t(card.label)}</b>
            <span className="bc-pill">{own ? (card.kind === 'credit' ? t('Credit') : t('Debit')) : t('Active')}</span>
          </div>
          <div className="bc-pixels" aria-hidden="true">
            {PIXELS.map((on, i) => (
              <i key={i} style={{ opacity: on ? 1 : 0.25 }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
            <span className="bc-chip" />
            <span className="bc-num">•••• •••• •••• {digits}</span>
          </div>
          <div className="bc-bottom">
            <div>
              <small>{t('Card holder')}</small>
              <strong>{card.holder}</strong>
            </div>
            {card.exp ? (
              <div>
                <small>{t('Expires')}</small>
                <strong>{card.exp}</strong>
              </div>
            ) : null}
            <NetworkMark network={card.network} />
          </div>
        </div>
        <div className="bc-face bc-back">
          <div className="bc-strip" />
          {own ? (
            <div className="bc-own">
              <p>{t('Only the last 4 digits of this card are saved here. Payments you record with it count against your locked budgets.')}</p>
              {onRemove ? (
                <button
                  type="button"
                  className={`btn sm ${sure ? 'danger solid' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (sure) onRemove(card.id)
                    else setSure(true)
                  }}
                >
                  <Icon name="trash" size={14} />
                  {sure ? t('Tap again to remove') : t('Remove card')}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="bc-sign">
                {card.holder}
                <b>{card.cvv}</b>
              </div>
              <p>
                {t('This card is issued by {brand} Financial. Never share your CVV. If found, please return to any {brand} partner branch.', {
                  brand: BRAND.name,
                })}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* a card of the user's own: a name, debit or credit, the network and the last 4 digits (never the full number) */
function AddCardForm({ onDone }) {
  const { addCard } = useApp()
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState('debit')
  const [network, setNetwork] = useState('visa')
  const [last4, setLast4] = useState('')
  const [exp, setExp] = useState('')
  const [skin, setSkin] = useState('onyx')
  const [err, setErr] = useState('')
  const terms = useTerms()
  const [agree, setAgree] = useState(false)
  const expOk = !exp || /^(0?[1-9]|1[0-2])\/\d{2}$/.test(exp)
  const ok = label.trim() && /^\d{4}$/.test(last4) && expOk && (terms.agreed || agree)

  const submit = (e) => {
    e.preventDefault()
    if (!ok) return
    if (!terms.agreed) terms.agree()
    if (addCard({ label, kind, network, last4, exp, skin })) onDone()
    else setErr(t('You already have that card.'))
  }

  return (
    <form className="form add-card" onSubmit={submit}>
      <div className="field-row">
        <label className="field">
          <span>{t('Card name')}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder={t('Everyday debit, travel card…')} autoFocus />
        </label>
        <label className="field">
          <span>{t('Last 4 digits')}</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t('Type')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="debit">{t('Debit')}</option>
            <option value="credit">{t('Credit')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('Network')}</span>
          <select value={network} onChange={(e) => setNetwork(e.target.value)}>
            {CARD_NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n === 'other' ? t('Other') : NETWORK_NAME[n]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>{t('Expires (optional)')}</span>
          <input value={exp} onChange={(e) => setExp(e.target.value.replace(/[^\d/]/g, '').slice(0, 5))} placeholder="MM/YY" autoComplete="off" />
          {!expOk ? <small className="err">{t('Use MM/YY, like 09/29.')}</small> : null}
        </label>
        <div className="field">
          <span>{t('Colour')}</span>
          <div className="skin-pick" role="radiogroup" aria-label={t('Colour')}>
            {CARD_SKINS.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={skin === s} aria-label={s} className={`skin-dot ${s} ${skin === s ? 'on' : ''}`} onClick={() => setSkin(s)} />
            ))}
          </div>
        </div>
      </div>
      <p className="tool-sum">{t('Only the last 4 digits are saved. Never type your full card number, PIN or CVV here.')}</p>
      <TermsAgree checked={agree} onChange={setAgree} />
      {err ? <small className="err">{err}</small> : null}
      <div className="budget-form-btns">
        <button type="button" className="btn" onClick={onDone}>
          {t('Cancel')}
        </button>
        <button type="submit" className="btn solid" disabled={!ok}>
          <Icon name="plus" size={16} stroke={2} />
          {t('Add card')}
        </button>
      </div>
    </form>
  )
}

function CardsCard({ d }) {
  const { openModal, cards: CARDS, demo, addCard, removeCard } = useApp()
  const [flipped, setFlipped] = useState(null)
  const [adding, setAdding] = useState(false)
  const canAdd = !demo && Boolean(addCard)
  return (
    <section className="card cards-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('My Cards')}</h2>
          <p className="card-sub">{CARDS.length ? t('Tap a card to flip it') : t('Add the cards you pay with')}</p>
        </div>
        <div className="c-tools">
          {canAdd && !adding ? (
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              <Icon name="plus" size={17} stroke={2} />
              {t('Add card')}
            </button>
          ) : null}
          {CARDS.length ? (
            <button type="button" className="btn" onClick={() => openModal('send')}>
              <Icon name="send" size={17} />
              {t('Pay with card')}
            </button>
          ) : null}
        </div>
      </div>
      {adding ? <AddCardForm onDone={() => setAdding(false)} /> : null}
      {CARDS.length ? (
        <div className="cards-track">
          {CARDS.map((c, k) => (
            <BankCard
              key={c.id}
              card={c}
              flipped={flipped === c.id}
              onFlip={() => setFlipped((f) => (f === c.id ? null : c.id))}
              onRemove={canAdd ? removeCard : null}
              style={{ '--k': k }}
            />
          ))}
        </div>
      ) : !adding ? (
        <div className="cards-empty">
          <CardEmpty
            icon="card"
            title={t('No cards yet')}
            body={t('Add a debit or credit card to track what you pay with it, and to use locked budgets. Only the last 4 digits are saved.')}
            action={canAdd ? t('Add card') : null}
            onAction={() => setAdding(true)}
          />
        </div>
      ) : null}
      <div className="cards-foot">
        <TermsLink />
      </div>
    </section>
  )
}

function CurrencyCard({ d }) {
  const { balance, toast, wallets: WALLETS } = useApp()
  const lead = useLead()
  const wallets = WALLETS.map((w) => (w.code === 'USD' ? { ...w, amount: balance, usd: balance } : w))
  const total = wallets.reduce((s, w) => s + w.usd, 0)
  return (
    <section className="card tx-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Currencies')}</h2>
          <p className="card-sub">
            {t('Total')} ≈ <CountUp value={total} format={(n) => whole(n)} delay={lead + 200} /> USD
          </p>
        </div>
        <button
          type="button"
          className="link"
          onClick={() => toast(t('Rates refreshed'), t('Live FX rates updated a moment ago.'), { icon: 'refresh' })}
        >
          {t('Refresh rates')} <Icon name="refresh" size={15} />
        </button>
      </div>
      <div className="wallets-list">
        {wallets.map((w, r) => {
          const c = CURRENCIES[w.code]
          return (
            <div key={w.code} className="wl" style={{ '--r': r }}>
              <Flag code={w.flag} size={34} />
              <div className="wl-name">
                <b>{w.code}</b>
                <small>{t(w.name)}</small>
              </div>
              <div className="meter">
                <i style={{ '--p': `${(w.usd / total) * 100}%`, '--r': r }} />
              </div>
              <strong>
                <CountUp value={w.amount} format={(n) => money(n, c.symbol, c.dp)} delay={lead + 300 + r * 80} />
              </strong>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function Wallet() {
  const { openModal } = useApp()
  return (
    <Stage>
      <PageHead title={t('Wallet')} sub={t('Your cards, balances and currencies in one place')}>
        <button type="button" className="btn solid lg" onClick={() => openModal('addMoney')}>
          <Icon name="plus" size={18} stroke={2} />
          {t('Add money')}
        </button>
      </PageHead>
      <div className="grid-2" style={{ marginTop: 0 }}>
        <BalanceCard d={0} />
        <PotsCard d={90} />
        <CardsCard d={140} />
        <CurrencyCard d={180} />
        <BillsCard d={270} />
      </div>
    </Stage>
  )
}
