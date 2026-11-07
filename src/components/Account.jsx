/* ------------------------------------------------------------------
   Account settings: download a copy of your data, deactivate the
   account (paused, data kept, reactivate by logging in) or delete it
   for good (password and typing DELETE, then the delete_my_account
   SQL function in supabase/schema.sql removes the login and the data).
   ------------------------------------------------------------------ */
import { useState } from 'react'
import Icon from './Icon'
import { Modal } from './ui'
import { useApp } from '../lib/store'
import { t } from '../lib/i18n'
import { BRAND } from '../config'

function AccountBody() {
  const { user, demo, exportData, deactivateAccount, deleteAccount } = useApp()
  const [step, setStep] = useState(null) // null | 'deactivate' | 'delete'
  const [typed, setTyped] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const word = t('DELETE')
  // the confirm word in the current language, or DELETE in English
  const canDelete = [word.toUpperCase(), 'DELETE'].includes(typed.trim().toUpperCase()) && password.length > 0 && !busy

  const run = async (work) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (err) {
      setError(
        err?.setup
          ? t('Deleting accounts needs a one-time setup in Supabase: run the latest supabase/schema.sql. Nothing was deleted.')
          : err?.status === 400 || /invalid/i.test(err?.message ?? '')
            ? t('That password didn’t work, so nothing was changed.')
            : t('Something went wrong, so nothing was changed. Try again in a minute.'),
      )
      setBusy(false)
    }
  }

  if (demo)
    return (
      <div className="form account-body">
        <p className="form-note">{t('This is the demo, so there’s no account to deactivate or delete. Create an account to manage it here.')}</p>
      </div>
    )

  return (
    <div className="form account-body">
      <div className="invest-head">
        <b>{user.name}</b>
        <small>{user.email}</small>
      </div>

      <section className="acct-row">
        <span className="guard-ic">
          <Icon name="download" size={18} />
        </span>
        <div>
          <b>{t('Download my data')}</b>
          <small>{t('A copy of everything in your account as a JSON file.')}</small>
        </div>
        <button type="button" className="btn sm" onClick={exportData}>
          {t('Download')}
        </button>
      </section>

      <section className="acct-row">
        <span className="guard-ic">
          <Icon name="clock" size={18} />
        </span>
        <div>
          <b>{t('Deactivate account')}</b>
          <small>{t('Pauses your account and logs you out. Your data is kept, and logging in again lets you reactivate it.')}</small>
        </div>
        {step === 'deactivate' ? null : (
          <button type="button" className="btn sm" onClick={() => (setStep('deactivate'), setError(''))}>
            {t('Deactivate')}
          </button>
        )}
      </section>
      {step === 'deactivate' ? (
        <div className="acct-confirm">
          <p>{t('Deactivate your account now? You’ll be logged out straight away.')}</p>
          <div>
            <button type="button" className="btn solid" disabled={busy} onClick={() => run(deactivateAccount)}>
              {busy ? t('Working…') : t('Yes, deactivate')}
            </button>
            <button type="button" className="btn" onClick={() => setStep(null)}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <section className="acct-row danger">
        <span className="guard-ic">
          <Icon name="trash" size={18} />
        </span>
        <div>
          <b>{t('Delete account')}</b>
          <small>{t('Deletes your login and everything in {brand} for good. This can’t be undone.', { brand: BRAND.name })}</small>
        </div>
        {step === 'delete' ? null : (
          <button type="button" className="btn sm danger" onClick={() => (setStep('delete'), setError(''))}>
            {t('Delete')}
          </button>
        )}
      </section>
      {step === 'delete' ? (
        <form
          className="acct-confirm danger"
          onSubmit={(e) => {
            e.preventDefault()
            if (canDelete) run(() => deleteAccount(password))
          }}
        >
          <p>
            {t(
              'This deletes your balance, transactions, pots, goals, bills, contacts, investments and settings. Download your data first if you want a copy.',
            )}
          </p>
          <label className="field">
            <span>{t('Type {word} to confirm', { word })}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </label>
          <label className="field">
            <span>{t('Your password')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <div>
            <button type="submit" className="btn solid danger" disabled={!canDelete}>
              {busy ? t('Deleting…') : t('Delete my account')}
            </button>
            <button type="button" className="btn" onClick={() => setStep(null)}>
              {t('Cancel')}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function AccountModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Account settings')} sub={t('Your data, and deactivating or deleting your account')} width={520}>
      {open ? <AccountBody /> : null}
    </Modal>
  )
}
