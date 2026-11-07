/* ------------------------------------------------------------------
   Grace on guard duty.

   - LockScreen: covers the app after a stretch of inactivity (or "lock
     now"); unlocking a real account needs its password again.
   - GuardModal: the guard settings and a protection score.
   - useGuardCheck: the extra step a payment window shows for large
     amounts and first payments to someone.
   The settings live in the account's saved data (see `guard` in App.jsx).
   ------------------------------------------------------------------ */
import { useState } from 'react'
import Icon from './Icon'
import BuddyArt from './BuddyArt'
import { Modal, Toggle } from './ui'
import { useApp } from '../lib/store'
import { t } from '../lib/i18n'
import { ASSISTANT } from '../config'
import { DEFAULT_GUARD, guardState, LOCK_CHOICES } from '../lib/guard'

/** What's switched on, for the score. */
const guardChecks = (guard) => guardState(guard)

/* ---------------- the lock screen ---------------- */
export function LockScreen({ user, demo, reason, onUnlock, onSignOut }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (demo) return onUnlock()
    if (!password) return setError(t('Enter your password.'))
    setBusy(true)
    setError('')
    try {
      const { getSupabase } = await import('../lib/supabase')
      const supabase = await getSupabase()
      const { error: err } = await supabase.auth.signInWithPassword({ email: user.email, password })
      if (err) throw err
      setPassword('')
      onUnlock()
    } catch {
      setError(t('That password didn’t work. Try again, or log out and use Forgot password.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label={t('Locked by {name}', { name: ASSISTANT.name })}>
      <form className="lock-card" onSubmit={submit}>
        <BuddyArt size={128} mood="idle" />
        <h2>{t('Locked by {name}', { name: ASSISTANT.name })}</h2>
        <p>
          {reason === 'idle'
            ? t('I locked the app because nobody was using it, so your money stays private.')
            : t('The app is locked, so your money stays private.')}{' '}
          {demo ? t('This is the demo, so no password is needed.') : t('Enter the password for {email} to come back in.', { email: user.email })}
        </p>
        {demo ? null : (
          <label className="field">
            <span>{t('Password')}</span>
            <div className="pw-input">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
              <button type="button" className="pw-eye" onClick={() => setShow((s) => !s)} aria-label={show ? t('Hide password') : t('Show password')}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>
          </label>
        )}
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn solid lg block" disabled={busy}>
          <Icon name="lock" size={17} />
          {busy ? t('Checking…') : t('Unlock')}
        </button>
        <button type="button" className="link" onClick={onSignOut}>
          {demo ? t('Leave demo') : t('Log out instead')}
        </button>
      </form>
    </div>
  )
}

/* ---------------- guard settings ---------------- */
function GuardBody({ onClose }) {
  const { guard = DEFAULT_GUARD, setGuard, lockNow, demo } = useApp()
  const [limit, setLimit] = useState(String(guard.limit || 500))
  const checks = guardChecks(guard)
  const score = checks.filter((c) => c.on).length

  return (
    <div className="form guard-body">
      <div className={`guard-score ${score === checks.length ? 'full' : ''}`}>
        <BuddyArt size={64} mood={score === checks.length ? 'happy' : 'idle'} />
        <div>
          <b>{t('{n} of {total} protections on', { n: score, total: checks.length })}</b>
          <small>
            {score === checks.length
              ? t('Everything is guarded. Woof!')
              : t('Turn on the rest and {name} guards everything.', { name: ASSISTANT.name })}
          </small>
        </div>
      </div>

      <div className="guard-row">
        <span className="guard-ic">
          <Icon name="lock" size={18} />
        </span>
        <div>
          <b>{t('Auto-lock')}</b>
          <small>{t('Locks the app after a while with no activity. Unlocking needs your password.')}</small>
        </div>
        <select value={guard.lock} onChange={(e) => setGuard({ lock: Number(e.target.value) })} aria-label={t('Auto-lock')}>
          {LOCK_CHOICES.map((m) => (
            <option key={m} value={m}>
              {m ? t('After {n} min', { n: m }) : t('Off')}
            </option>
          ))}
        </select>
      </div>

      <div className="guard-row">
        <span className="guard-ic">
          <Icon name="shield" size={18} />
        </span>
        <div>
          <b>{t('Large payment guard')}</b>
          <small>{t('Payments at or above this amount need an extra confirm.')}</small>
          {guard.limit > 0 ? (
            <span className="guard-limit">
              <b>$</b>
              <input
                inputMode="decimal"
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))}
                onBlur={() => Number(limit) > 0 && setGuard({ limit: Number(limit) })}
                aria-label={t('Guard limit')}
              />
            </span>
          ) : null}
        </div>
        <Toggle on={guard.limit > 0} onChange={(on) => setGuard({ limit: on ? Number(limit) || 500 : 0 })} label={t('Large payment guard')} />
      </div>

      <div className="guard-row">
        <span className="guard-ic">
          <Icon name="users" size={18} />
        </span>
        <div>
          <b>{t('First payment warning')}</b>
          <small>{t('Reminds you to double-check before paying someone for the first time.')}</small>
        </div>
        <Toggle on={Boolean(guard.newPayee)} onChange={(on) => setGuard({ newPayee: on })} label={t('First payment warning')} />
      </div>

      <div className="guard-row">
        <span className="guard-ic">
          <Icon name="eyeOff" size={18} />
        </span>
        <div>
          <b>{t('Privacy blur')}</b>
          <small>{t('Blurs your numbers when you switch to another tab or app, for screen sharing and shoulder surfers.')}</small>
        </div>
        <Toggle on={Boolean(guard.privacy)} onChange={(on) => setGuard({ privacy: on })} label={t('Privacy blur')} />
      </div>

      <ul className="guard-tips">
        <li>{t('{name} never asks for your password, PIN or one-time codes.', { name: ASSISTANT.name })}</li>
        <li>{t('Every change {name} makes is listed in {name}’s activity.', { name: ASSISTANT.name })}</li>
        <li>{t('Your data is private to your account, protected by row level security.')}</li>
      </ul>

      <button
        type="button"
        className="btn lg block"
        onClick={() => {
          onClose()
          lockNow('manual')
        }}
      >
        <Icon name="lock" size={17} />
        {demo ? t('Try the lock screen') : t('Lock now')}
      </button>
    </div>
  )
}

export function GuardModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('{name}’s guard', { name: ASSISTANT.name })}
      sub={t('How {name} protects your account and your money', { name: ASSISTANT.name })}
      width={520}
    >
      {open ? <GuardBody onClose={onClose} /> : null}
    </Modal>
  )
}
