import { useState } from 'react'
import Icon from '../components/Icon'
import { Flag, Logo, Mastercard } from '../components/Brand'
import { BalanceCard, BillsCard } from '../components/Cards'
import { CountUp, PageHead, Stage } from '../components/ui'
import { useApp, useLead } from '../lib/store'
import { money, whole } from '../lib/format'
import { CARDS, CURRENCIES, WALLETS } from '../data/seed'
import { BRAND } from '../config'
import { t } from '../lib/i18n'

const PIXELS = [1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1]

function BankCard({ card, flipped, onFlip, style }) {
  return (
    <div
      className={`bank-card ${card.skin} ${flipped ? 'flipped' : ''}`}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`${t('{name} ending {digits}', { name: t(card.label), digits: card.number.slice(-4) })}. ${flipped ? t('Showing back') : t('Tap to see CVV')}`}
      onClick={onFlip}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFlip())}
    >
      <div className="bc-inner">
        <div className="bc-face bc-front">
          <div className="bc-top">
            <Logo size={26} />
            <b>{t(card.label)}</b>
            <span className="bc-pill">{t('Active')}</span>
          </div>
          <div className="bc-pixels" aria-hidden="true">
            {PIXELS.map((on, i) => (
              <i key={i} style={{ opacity: on ? 1 : 0.25 }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
            <span className="bc-chip" />
            <span className="bc-num">•••• •••• •••• {card.number.slice(-4)}</span>
          </div>
          <div className="bc-bottom">
            <div>
              <small>{t('Card holder')}</small>
              <strong>{card.holder}</strong>
            </div>
            <div>
              <small>{t('Expires')}</small>
              <strong>{card.exp}</strong>
            </div>
            <Mastercard />
          </div>
        </div>
        <div className="bc-face bc-back">
          <div className="bc-strip" />
          <div className="bc-sign">
            {card.holder}
            <b>{card.cvv}</b>
          </div>
          <p>
            {t('This card is issued by {brand} Financial. Never share your CVV. If found, please return to any {brand} partner branch.', {
              brand: BRAND.name,
            })}
          </p>
        </div>
      </div>
    </div>
  )
}

function CardsCard({ d }) {
  const { openModal } = useApp()
  const [flipped, setFlipped] = useState(null)
  return (
    <section className="card cards-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('My Cards')}</h2>
          <p className="card-sub">{t('Tap a card to flip it')}</p>
        </div>
        <button type="button" className="btn" onClick={() => openModal('send')}>
          <Icon name="send" size={17} />
          {t('Pay with card')}
        </button>
      </div>
      <div className="cards-track">
        {CARDS.map((c, k) => (
          <BankCard
            key={c.id}
            card={c}
            flipped={flipped === c.id}
            onFlip={() => setFlipped((f) => (f === c.id ? null : c.id))}
            style={{ '--k': k }}
          />
        ))}
      </div>
    </section>
  )
}

function CurrencyCard({ d }) {
  const { balance, toast } = useApp()
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
        <button type="button" className="btn solid lg" onClick={() => openModal('receive')}>
          <Icon name="plus" size={18} stroke={2} />
          {t('Add money')}
        </button>
      </PageHead>
      <div className="grid-2" style={{ marginTop: 0 }}>
        <BalanceCard d={0} />
        <CardsCard d={90} />
        <CurrencyCard d={180} />
        <BillsCard d={270} />
      </div>
    </Stage>
  )
}
