/* ------------------------------------------------------------------
   The first-run tour: five short steps for a new account, each with a
   button that takes you to the feature. Shown once (saved with the
   account), skippable, and replayable from Settings.
   ------------------------------------------------------------------ */
import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import BuddyArt from './BuddyArt'
import { useApp } from '../lib/store'
import { ASSISTANT, BRAND } from '../config'
import { t } from '../lib/i18n'

const STEPS = [
  {
    icon: 'sparkle',
    title: 'Welcome to {brand}',
    body: 'A quick tour: five steps, about 30 seconds. You can skip it and replay it any time from Settings.',
  },
  {
    icon: 'plus',
    title: 'Add your money',
    body: 'Record income and spending, set up rent or salary to repeat, or import a statement from your bank (CSV or PDF).',
    action: 'Add a transaction',
    run: (app) => app.openModal('transaction'),
  },
  {
    icon: 'pie',
    title: 'Set budgets',
    body: 'Give each category a monthly limit. Lock one (like groceries) so its money can only go there, and let unused money roll over.',
    action: 'Open Budget',
    run: (app) => app.go('budget'),
  },
  {
    icon: 'wallet',
    title: 'Cards, pots and bills',
    body: 'Add the cards you pay with (only the last 4 digits), split your pay into pots and goals, and keep track of bills.',
    action: 'Open Wallet',
    run: (app) => app.go('wallet'),
  },
  {
    icon: 'chat',
    title: 'Meet {assistant}',
    body: 'Ask anything about your money, like “can I afford $200 this week?”, or send her a photo of a receipt. She also watches for anything unusual.',
    action: 'Say hi to {assistant}',
    run: (app, ctx) => ctx.openAssistant?.(),
  },
]

export default function Tour({ onOpenAssistant }) {
  const app = useApp()
  const [i, setI] = useState(0)
  const card = useRef(null)
  const step = STEPS[i]
  const vars = { brand: BRAND.name, assistant: ASSISTANT.name }
  const last = i === STEPS.length - 1
  const finish = () => app.setTourDone?.(true)

  useEffect(() => {
    card.current?.focus()
  }, [i])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && finish()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      <div className="tour-card" ref={card} tabIndex={-1}>
        <div className="tour-top">
          {i === 0 ? (
            <span className="tour-buddy" aria-hidden="true">
              <BuddyArt size={54} mood="happy" />
            </span>
          ) : (
            <span className="tour-ic" aria-hidden="true">
              <Icon name={step.icon} size={20} />
            </span>
          )}
          <span className="tour-count">{t('{n} of {total}', { n: i + 1, total: STEPS.length })}</span>
          <button type="button" className="icon-btn soft" onClick={finish} aria-label={t('Skip the tour')}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <h2 id="tour-title">{t(step.title, vars)}</h2>
        <p>{t(step.body, vars)}</p>
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, k) => (
            <i key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
        <div className="tour-btns">
          {step.action ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                step.run(app, { openAssistant: onOpenAssistant })
                if (last) finish()
              }}
            >
              {t(step.action, vars)}
            </button>
          ) : (
            <button type="button" className="btn" onClick={finish}>
              {t('Skip')}
            </button>
          )}
          <button type="button" className="btn solid" onClick={() => (last ? finish() : setI(i + 1))}>
            {last ? t('Done') : i === 0 ? t('Start the tour') : t('Next')}
            {last ? null : <Icon name="arrowRight" size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
