/* ------------------------------------------------------------------
   Bank and card terms: what the Wallet's cards, card top-ups, transfers
   and locked budgets are (and aren't). Shown from My Cards and the card
   top-up; agreeing is needed before adding a card or paying by card,
   and the agreement (with the version) is saved with the account.
   The terms are in English; the buttons around them are translated.
   ------------------------------------------------------------------ */
import Icon from './Icon'
import { Modal } from './ui'
import { useApp } from '../lib/store'
import { MAX_TOPUP, MIN_TOPUP } from '../lib/payments'
import { money } from '../lib/format'
import { ASSISTANT, BRAND, COPYRIGHT } from '../config'
import { t } from '../lib/i18n'
import { TERMS_UPDATED, useTerms } from '../lib/terms'


const SECTIONS = (brand, assistant) => [
  {
    h: '1. What this service is',
    p: [
      `${brand} is a personal money tracker. It is not a bank, does not hold your money and does not issue cards. Balances, pots, budgets and transactions in ${brand} are figures that you enter, import or that the app works out from them; they are not a bank account statement.`,
      `${brand} does not give financial, tax or legal advice. ${assistant}, the assistant, answers from your own figures and can be wrong. Check anything important before you act on it.`,
    ],
  },
  {
    h: '2. Cards you add',
    p: [
      'You can add the debit and credit cards you pay with, so you can record which card a payment was made with. Only a name you choose, the card type, the card network, an optional expiry date and the last 4 digits are saved. Never enter a full card number, PIN, CVV or security code anywhere in the app.',
      'Only add cards that are yours or that you are allowed to use. Removing a card from the app does not cancel it; contact your bank to do that.',
    ],
  },
  {
    h: '3. Locked budgets and declined payments',
    p: [
      `Locked budgets and "declined" payments are checks inside ${brand} on the payments you record in it. They do not block, approve or decline anything at your bank or on your real card. Your bank decides whether a real card payment goes through.`,
    ],
  },
  {
    h: '4. Adding money by card (Stripe)',
    p: [
      `Card top-ups are processed by Stripe, Inc. You pay on Stripe's own secure page; ${brand} never sees or stores your card number. Stripe's terms and privacy policy apply to that payment.`,
      `A top-up can be from ${money(MIN_TOPUP, '$', 0)} to ${money(MAX_TOPUP, '$', 0)}. When it succeeds, the amount is added to your balance in ${brand}. ${brand} charges no fees of its own; your bank or card issuer may charge theirs. In test mode no real money moves.`,
      'For a charge you do not recognise, a refund or a dispute, contact your card issuer. Refunds of a real top-up are made back to the same card through Stripe.',
    ],
  },
  {
    h: '5. Money between friends',
    p: [
      `Sending money, requests, split bills and settling up between friends move amounts between ${brand} balances and keep a record for both people. They are not bank transfers. Only send money to people you know and trust, and check a payee before you pay: payments recorded in the app cannot be pulled back by ${brand}.`,
    ],
  },
  {
    h: '6. Keeping your account safe',
    p: [
      `Keep your password private and lock the app when you step away. If you think someone else has used your account, change your password straight away. ${brand} will never ask for your password, a one-time code or card details by message, email or phone.`,
      `For anything that involves a real bank account or card, such as fraud, a lost card or a payment you did not make, contact your bank or card issuer directly; ${brand} cannot freeze cards or reverse bank payments.`,
    ],
  },
  {
    h: '7. Your data',
    p: [
      `Your figures are saved in your ${brand} account so they follow you between devices, and a copy is kept on each device you use so the app can open without a connection. Signing out removes that copy from the device. You can download all your data or delete your account at any time from your account settings; deleting removes your data for good.`,
    ],
  },
  {
    h: '8. Availability and changes',
    p: [
      `${brand} is provided as is. It may sometimes be unavailable, and features may change. If these terms change, you will be asked to agree to the new version before adding another card or paying by card.`,
      `${brand} is run by ${COPYRIGHT.owner}. If you have a question about these terms, contact ${COPYRIGHT.owner}.`,
    ],
  },
]

export function TermsText() {
  return (
    <div className="terms-text">
      <p className="terms-meta">
        {t('Last updated {date}', { date: TERMS_UPDATED })} · {t('These terms are in English.')}
      </p>
      {SECTIONS(BRAND.name, ASSISTANT.name).map((s) => (
        <section key={s.h}>
          <h3>{s.h}</h3>
          {s.p.map((x) => (
            <p key={x.slice(0, 40)}>{x}</p>
          ))}
        </section>
      ))}
    </div>
  )
}

/** The "I agree" line for a form: a checkbox plus a link to the terms. Shows nothing once agreed. */
export function TermsAgree({ checked, onChange }) {
  const { openModal } = useApp()
  const { agreed } = useTerms()
  if (agreed) return null
  return (
    <label className="terms-agree">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {t('I agree to the')}{' '}
        <button
          type="button"
          className="link"
          onClick={(e) => {
            e.preventDefault()
            openModal('terms')
          }}
        >
          {t('Bank and card terms')}
        </button>
      </span>
    </label>
  )
}

export function TermsLink({ className = 'link terms-link' }) {
  const { openModal } = useApp()
  return (
    <button type="button" className={className} onClick={() => openModal('terms')}>
      <Icon name="note" size={14} />
      {t('Bank and card terms')}
    </button>
  )
}

export function TermsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Bank and card terms')} sub={t('Cards, card top-ups, money between friends and locked budgets')} width={620}>
      {open ? <TermsText /> : null}
    </Modal>
  )
}
