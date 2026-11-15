/* ------------------------------------------------------------------
   Everything paid for on repeat, in one place: the repeating
   transactions you set up, plus repeat charges spotted in your history.
   Monthly and yearly cost, next charge, price rises, and a reminder
   to cancel a couple of days before the next charge.
   ------------------------------------------------------------------ */
import { useMemo } from 'react'
import Icon from '../components/Icon'
import { MerchantLogo } from '../components/Brand'
import { CountUp } from '../components/ui'
import { CardEmpty } from '../components/Cards'
import { useApp, useLead } from '../lib/store'
import { money, shortDate, whole } from '../lib/format'
import { KIND_FOR } from '../lib/stats'
import { EVERY_LABEL, nextRun } from '../lib/recurring'
import { dayOf, subscriptionList } from '../lib/upcoming'
import { ASSISTANT } from '../config'
import { t, tName } from '../lib/i18n'

const REMIND_BEFORE = 2 // days before the next charge
const remindDay = (next, today) => {
  const [y, m, d] = next.split('-').map(Number)
  const day = dayOf(new Date(y, m - 1, d - REMIND_BEFORE))
  return day < today ? today : day
}

export default function SubscriptionsView({ attached = true }) {
  const { transactions, bills, recurring = [], stats, now, openModal, addRecurring, toggleRecurring, reminders = [], addReminder, removeReminder } = useApp()
  const lead = useLead()
  const today = dayOf(now ?? new Date())
  const list = useMemo(() => subscriptionList({ transactions, bills, rules: recurring, now: now ?? new Date() }), [transactions, bills, recurring, now])
  const rises = list.items.filter((i) => i.rise)
  const soon = list.items.filter((i) => i.active && i.next).sort((a, b) => a.next.localeCompare(b.next))[0]
  const reminderFor = (i) => reminders.find((r) => r.key === i.key && !r.done)
  const canAct = !stats.demo

  return (
    <section className={`card subs-card ${attached ? 'attached' : ''}`} style={{ '--d': '0ms' }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Subscriptions')}</h2>
          <p className="card-sub">{t('Everything you pay for on repeat')}</p>
        </div>
        {canAct ? (
          <div className="c-tools">
            <button type="button" className="btn" onClick={() => openModal('recurring')}>
              <Icon name="replay" size={17} />
              {t('Repeating')}
            </button>
          </div>
        ) : null}
      </div>

      {!list.items.length ? (
        <CardEmpty
          icon="replay"
          title={t('Nothing on repeat yet')}
          body={t('Set up rent, salary or a subscription once, or add a few months of transactions and {name} will spot the repeat charges.', { name: ASSISTANT.name })}
          action={canAct ? t('Add a repeating transaction') : null}
          onAction={() => openModal('recurring')}
        />
      ) : (
        <>
          <div className="mini-stats rv" style={{ '--i': 1 }}>
            <div className="mini-stat">
              <span className="ic-ring" style={{ color: 'var(--accent)' }}>
                <Icon name="replay" size={18} stroke={2} />
              </span>
              <div>
                <small>{t('A month')}</small>
                <b>
                  <CountUp value={list.monthly} format={(n) => money(n)} delay={lead + 200} />
                </b>
              </div>
            </div>
            <div className="mini-stat">
              <span className="ic-ring">
                <Icon name="calendar" size={18} stroke={2} />
              </span>
              <div>
                <small>{t('A year')}</small>
                <b>
                  <CountUp value={list.yearly} format={(n) => whole(n)} delay={lead + 260} />
                </b>
              </div>
            </div>
            <div className="mini-stat">
              <span className="ic-ring" style={{ color: rises.length ? 'var(--red)' : 'var(--green)' }}>
                <Icon name={rises.length ? 'trendUp' : 'check'} size={18} stroke={2} />
              </span>
              <div>
                <small>{soon ? t('Next charge') : t('Price rises')}</small>
                <b>{soon ? `${tName(soon.name)} · ${shortDate(`${soon.next}T12:00`)}` : rises.length}</b>
              </div>
            </div>
          </div>

          {rises.length ? (
            <p className="subs-alert rv" style={{ '--i': 2 }} role="note">
              <Icon name="alert" size={15} />
              {rises.length === 1
                ? t('{name} went up from {from} to {to}.', { name: tName(rises[0].name), from: money(rises[0].rise.from), to: money(rises[0].rise.to) })
                : t('{n} went up in price: {names}.', { n: rises.length, names: rises.map((r) => tName(r.name)).join(', ') })}
            </p>
          ) : null}

          <ul className="subs-list rv" style={{ '--i': 3 }}>
            {list.items.map((i) => {
              const reminder = reminderFor(i)
              const rule = i.ruleId ? recurring.find((r) => r.id === i.ruleId) : null
              return (
                <li key={i.key} className={i.active ? '' : 'paused'}>
                  <MerchantLogo kind={KIND_FOR[i.category] ?? 'stream'} size={40} />
                  <div className="subs-main">
                    <b>{tName(i.name)}</b>
                    <small>
                      {t(EVERY_LABEL[i.every])} · {t(i.category)}
                      {i.active && i.next ? ` · ${t('next on {date}', { date: shortDate(`${i.next}T12:00`) })}` : ''}
                      {!i.active ? ` · ${t('Paused')}` : ''}
                    </small>
                    <span className="subs-tags">
                      {i.source === 'spotted' ? <em className="tag-soft">{t('Spotted by {name}', { name: ASSISTANT.name })}</em> : null}
                      {i.source === 'bill' ? <em className="tag-soft">{t('Bill')}</em> : null}
                      {i.rise ? <em className="tag-red">{t('Up from {from}', { from: money(i.rise.from) })}</em> : null}
                      {reminder ? (
                        <em className="tag-accent">
                          <Icon name="bell" size={11} /> {t('Reminder on {date}', { date: shortDate(`${reminder.day}T12:00`) })}
                        </em>
                      ) : null}
                    </span>
                  </div>
                  <div className="subs-cost">
                    <strong>{money(i.amount)}</strong>
                    <small>{i.every === 'monthly' ? t('{amount} a year', { amount: whole(i.yearly) }) : t('{amount} a month', { amount: money(i.monthly) })}</small>
                  </div>
                  {canAct ? (
                    <div className="subs-acts">
                      {i.source === 'spotted' && addRecurring ? (
                        <button
                          type="button"
                          className="btn sm"
                          title={t('Add it by itself every month, so the forecast and {name} count it', { name: ASSISTANT.name })}
                          onClick={() =>
                            addRecurring({
                              name: i.name,
                              amount: -i.amount,
                              category: i.category,
                              every: 'monthly',
                              start: i.next && i.next > today ? i.next : nextRun(today, 'monthly'),
                            })
                          }
                        >
                          <Icon name="replay" size={14} />
                          {t('Make it repeating')}
                        </button>
                      ) : null}
                      {rule ? (
                        <button type="button" className="btn sm" onClick={() => toggleRecurring(rule.id)}>
                          {rule.active ? t('Pause') : t('Resume')}
                        </button>
                      ) : null}
                      {i.active && i.next && addReminder ? (
                        reminder ? (
                          <button type="button" className="btn sm" onClick={() => removeReminder(reminder.id)}>
                            {t('Cancel reminder')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn sm"
                            title={t('I’ll remind you {n} days before the next charge', { n: REMIND_BEFORE })}
                            onClick={() => addReminder({ key: i.key, name: i.name, day: remindDay(i.next, today), charge: i.next, amount: i.amount })}
                          >
                            <Icon name="bell" size={14} />
                            {t('Remind me to cancel')}
                          </button>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <p className="subs-note rv" style={{ '--i': 4 }}>
            {t('{name} can’t cancel subscriptions for you. Cancel with the company directly, then pause or remove it here.', { name: ASSISTANT.name })}
          </p>
        </>
      )}
    </section>
  )
}
