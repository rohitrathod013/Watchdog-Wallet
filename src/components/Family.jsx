/* ------------------------------------------------------------------
   Family on the Friends page. A parent links a friend's account as
   their child: an allowance is paid in on a schedule, and (with
   approval on) the child's spending waits for the parent to approve.
   A child sees who their parent is, the allowance, and what's waiting.
   ------------------------------------------------------------------ */
import { useState } from 'react'
import Icon from './Icon'
import { Persona } from './Brand'
import { useApp } from '../lib/store'
import { money, stamp, localIso } from '../lib/format'
import { t } from '../lib/i18n'
import { acceptFamily, decideSpend, inviteChild, leaveFamily, setFamily } from '../lib/server'

const EVERY = { weekly: 'Every week', monthly: 'Every month' }

function ChildRow({ f }) {
  const { social, server } = useApp()
  const [edit, setEdit] = useState(false)
  const [allowance, setAllowance] = useState(String(Number(f.allowance)))
  const [every, setEvery] = useState(f.every)
  const [approve, setApprove] = useState(f.approve)
  const save = async () => {
    await setFamily({ id: f.id, allowance: Number(allowance) || 0, every, approve }).catch(() => null)
    setEdit(false)
    server.refreshFamily()
  }
  const friend = social.friends.find((x) => x.id === f.child)
  return (
    <li className="fam-row">
      <Persona name={social.nameOf(f.child)} hue={friend?.hue} src={friend?.avatar} size={36} />
      <span>
        <b>{social.nameOf(f.child).split(' ')[0]}</b>
        <small>
          {f.status === 'pending'
            ? t('Invite sent, waiting for them to accept')
            : Number(f.allowance) > 0
              ? t('{amount} {every} · next {date}', { amount: money(Number(f.allowance)), every: t(EVERY[f.every]).toLowerCase(), date: f.next_allowance ?? '' })
              : t('No allowance')}
          {f.approve ? ` · ${t('approves spending')}` : ''}
        </small>
      </span>
      <button type="button" className="icon-btn soft sm" onClick={() => setEdit((v) => !v)} aria-label={t('Edit')} aria-expanded={edit}>
        <Icon name="edit" size={14} />
      </button>
      {edit ? (
        <div className="fam-edit">
          <div className="field-row">
            <label className="field">
              <span>{t('Allowance')}</span>
              <div className="amount-input sm">
                <b>$</b>
                <input inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
            </label>
            <label className="field">
              <span>{t('How often')}</span>
              <select value={every} onChange={(e) => setEvery(e.target.value)}>
                {Object.entries(EVERY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
            {t('I approve their spending first')}
          </label>
          <div className="row-btns">
            <button type="button" className="link danger" onClick={() => leaveFamily(f.id).then(server.refreshFamily).catch(() => null)}>
              {t('Unlink')}
            </button>
            <button type="button" className="btn sm solid" onClick={save}>
              {t('Save')}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

export function FamilyCard() {
  const { social, server, user, toast } = useApp()
  const [adding, setAdding] = useState(false)
  const [child, setChild] = useState('')
  const [allowance, setAllowance] = useState('10')
  const [every, setEvery] = useState('weekly')
  const [approve, setApprove] = useState(true)
  const [error, setError] = useState('')
  if (!server || !server.setup) return null
  const me = user.id
  const { links, requests } = server.family
  const kids = links.filter((f) => f.parent === me)
  const mine = links.find((f) => f.child === me)
  const waiting = requests.filter((r) => r.parent === me && r.status === 'pending')
  const myAsks = requests.filter((r) => r.child === me).slice(0, 5)
  const friends = social.friends.filter((f) => f.status === 'friend' && !links.some((l) => l.child === f.id))

  const invite = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await inviteChild({ child, allowance: Number(allowance) || 0, every, approve })
      setAdding(false)
      server.refreshFamily()
      toast(t('Invite sent'), t('{name} needs to accept it on their account.', { name: social.nameOf(child).split(' ')[0] }), { icon: 'users' })
    } catch (err) {
      setError(/already linked/i.test(err?.message ?? '') ? t('They’re already linked to a family.') : /child account/i.test(err?.message ?? '') ? t('A child account can’t add children.') : t('Couldn’t send the invite.'))
    }
  }

  if (!kids.length && !mine && !friends.length) return null
  return (
    <section className="card family-card rv" style={{ '--i': 2 }}>
      <div className="c-head">
        <h2 className="card-h">{t('Family')}</h2>
        {!mine && friends.length && !adding ? (
          <button type="button" className="btn sm" onClick={() => (setAdding(true), setChild(friends[0].id))}>
            <Icon name="plus" size={14} /> {t('Add a child')}
          </button>
        ) : null}
      </div>

      {mine ? (
        mine.status === 'pending' ? (
          <div className="fam-invite">
            <p>{t('{name} wants to link your account as their child: they’d send you an allowance and approve what you spend.', { name: social.nameOf(mine.parent).split(' ')[0] })}</p>
            <div className="row-btns">
              <button type="button" className="btn sm" onClick={() => leaveFamily(mine.id).then(server.refreshFamily).catch(() => null)}>
                {t('No thanks')}
              </button>
              <button type="button" className="btn sm solid" onClick={() => acceptFamily(mine.id).then(server.refreshFamily).catch(() => null)}>
                {t('Accept')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="muted">
              {t('Linked to {name}.', { name: social.nameOf(mine.parent).split(' ')[0] })}{' '}
              {Number(mine.allowance) > 0 ? t('Allowance: {amount} {every}.', { amount: money(Number(mine.allowance)), every: t(EVERY[mine.every]).toLowerCase() }) : ''}{' '}
              {mine.approve ? t('Your spending is approved first.') : ''}
            </p>
            {myAsks.length ? (
              <ul className="fam-asks">
                {myAsks.map((r) => (
                  <li key={r.id}>
                    <span>
                      {r.name} <small>{stamp(localIso(new Date(r.created_at)))}</small>
                    </span>
                    <b>{money(Number(r.amount))}</b>
                    <em className={`ask-${r.status}`}>{t(r.status === 'pending' ? 'Waiting' : r.status === 'approved' ? 'Approved' : 'Declined')}</em>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )
      ) : null}

      {waiting.length ? (
        <div className="fam-waiting">
          <b>{t('Waiting for your OK')}</b>
          {waiting.map((r) => (
            <div key={r.id} className="fam-ask">
              <span>
                <b>{social.nameOf(r.child).split(' ')[0]}</b> · {r.name}
                <small>
                  {t(r.category)} · {stamp(localIso(new Date(r.created_at)))}
                </small>
              </span>
              <strong>{money(Number(r.amount))}</strong>
              <div className="row-btns">
                <button type="button" className="btn sm" onClick={() => decideSpend(r.id, false).then(server.refreshFamily).catch(() => null)}>
                  {t('Decline')}
                </button>
                <button type="button" className="btn sm solid" onClick={() => decideSpend(r.id, true).then(server.refreshFamily).catch(() => null)}>
                  {t('Approve')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {kids.length ? (
        <ul className="fam-list">
          {kids.map((f) => (
            <ChildRow key={f.id} f={f} />
          ))}
        </ul>
      ) : null}

      {adding ? (
        <form className="form fam-form" onSubmit={invite}>
          <label className="field">
            <span>{t('Your child (already your friend here)')}</span>
            <select value={child} onChange={(e) => setChild(e.target.value)}>
              {friends.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>{t('Allowance')}</span>
              <div className="amount-input sm">
                <b>$</b>
                <input inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
            </label>
            <label className="field">
              <span>{t('How often')}</span>
              <select value={every} onChange={(e) => setEvery(e.target.value)}>
                {Object.entries(EVERY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
            {t('I approve their spending first')}
          </label>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row-btns">
            <button type="button" className="btn sm" onClick={() => setAdding(false)}>
              {t('Cancel')}
            </button>
            <button type="submit" className="btn sm solid" disabled={!child}>
              {t('Send invite')}
            </button>
          </div>
          <small className="muted">{t('The allowance is sent from your balance on schedule, while your app is open.')}</small>
        </form>
      ) : !kids.length && !mine ? (
        <p className="muted">{t('Link a teen’s or kid’s account: send an allowance and approve what they spend.')}</p>
      ) : null}
    </section>
  )
}
