/* ------------------------------------------------------------------
   Bills and subscriptions in your calendar: download them once as an
   .ics file, or subscribe to a private feed that keeps itself up to
   date (Google Calendar, Apple Calendar, Outlook).
   ------------------------------------------------------------------ */
import { useState } from 'react'
import Icon from './Icon'
import { Modal } from './ui'
import { useApp } from '../lib/store'
import { saveFile } from '../lib/format'
import { t } from '../lib/i18n'
import { BRAND } from '../config'
import { buildIcs } from '../lib/ics'
import { calendarFeedUrl, calendarToken } from '../lib/server'

function CalendarBody() {
  const { bills, recurring = [], toast, accounts, demo } = useApp()
  const [feed, setFeed] = useState(null)
  const [error, setError] = useState('')
  const { text, count } = buildIcs({ bills, rules: recurring, name: `${BRAND.name} bills` })

  const download = () => {
    saveFile(`${BRAND.name.toLowerCase().replace(/\s+/g, '-')}-bills.ics`, text, 'text/calendar')
    toast(t('Calendar file saved'), t('Open it to add {n} bills and payments to your calendar.', { n: count }), { icon: 'calendar' })
  }
  const subscribe = async (reset = false) => {
    setError('')
    try {
      setFeed(calendarFeedUrl(await calendarToken(reset)))
    } catch (err) {
      setError(err?.setup ? t('The calendar feed isn’t set up yet: run the latest supabase/schema.sql and deploy the calendar function.') : t('Couldn’t make the link.'))
    }
  }
  const webcal = feed?.replace(/^https:/, 'webcal:')

  return (
    <div className="form sec">
      <section className="sec-block">
        <div className="sec-head">
          <span className="sec-ic">
            <Icon name="download" size={18} />
          </span>
          <div>
            <b>{t('Download once')}</b>
            <small>{count ? t('{n} bills and repeating payments, each with a reminder the day before.', { n: count }) : t('Nothing to add yet: set up a bill or a repeating payment first.')}</small>
          </div>
          <button type="button" className="btn sm solid" onClick={download} disabled={!count}>
            {t('Download .ics')}
          </button>
        </div>
      </section>
      {accounts && !demo ? (
        <section className="sec-block">
          <div className="sec-head">
            <span className="sec-ic">
              <Icon name="refresh" size={18} />
            </span>
            <div>
              <b>{t('Subscribe (stays up to date)')}</b>
              <small>{t('Your calendar checks a private link every few hours, so new bills show up by themselves. Anyone with the link can see your bills: keep it to yourself.')}</small>
            </div>
            {feed ? null : (
              <button type="button" className="btn sm solid" onClick={() => subscribe(false)}>
                {t('Get the link')}
              </button>
            )}
          </div>
          {feed ? (
            <>
              <code className="pl-url">{feed}</code>
              <div className="row-btns">
                <button type="button" className="btn sm" onClick={() => subscribe(true)}>
                  {t('Make a new link')}
                </button>
                <a className="btn sm" href={webcal}>
                  <Icon name="calendar" size={14} /> {t('Open in my calendar')}
                </a>
                <button type="button" className="btn sm solid" onClick={() => navigator.clipboard?.writeText(feed).then(() => toast(t('Link copied'), '', { icon: 'copy' }))}>
                  <Icon name="copy" size={14} /> {t('Copy')}
                </button>
              </div>
              <small className="muted">{t('Google Calendar: Other calendars › + › From URL, and paste the link.')}</small>
            </>
          ) : null}
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

export function CalendarModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Add to calendar')} sub={t('Bills and subscriptions, with reminders')} width={520}>
      {open ? <CalendarBody /> : null}
    </Modal>
  )
}
