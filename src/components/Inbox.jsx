/* ------------------------------------------------------------------
   The receipts inbox. Receipts emailed to your private address, or
   found in Gmail, wait here as pending expenses: Add opens them in the
   Add transaction window (to check the category), Dismiss drops them.
   InboxModal shows the address and connects Gmail.
   ------------------------------------------------------------------ */
import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Modal } from './ui'
import { useApp } from '../lib/store'
import { money, stamp, localIso } from '../lib/format'
import { t } from '../lib/i18n'
import { INBOX } from '../config'
import { dismissPending, gmailConnect, gmailDisconnect, gmailScan, gmailStatus, inboxAddress, inboxToken } from '../lib/server'

export function PendingReceipts() {
  const { server, openModal } = useApp()
  const list = server?.pending ?? []
  if (!list.length) return null
  const drop = async (id) => {
    server.setPending((l) => l.filter((x) => x.id !== id))
    await dismissPending(id).catch(() => null)
  }
  return (
    <section className="card pending-card" style={{ '--d': '0ms' }}>
      <div className="c-head">
        <div>
          <h2 className="card-h">
            <Icon name="mail" size={18} /> {t('Receipts to check')}
          </h2>
          <p className="card-sub">{t('Found in your email. Add the ones that are real, dismiss the rest.')}</p>
        </div>
      </div>
      <ul className="pend-list">
        {list.map((x) => (
          <li key={x.id}>
            <span>
              <b>{x.merchant || t('Receipt')}</b>
              <small>
                {x.subject ? `${x.subject} · ` : ''}
                {x.spent_on ?? stamp(localIso(new Date(x.created_at)))} · {x.source === 'gmail' ? 'Gmail' : t('Email')}
              </small>
            </span>
            <strong>{x.amount ? money(Number(x.amount)) : t('No amount found')}</strong>
            <span className="row-btns">
              <button type="button" className="btn sm" onClick={() => drop(x.id)}>
                {t('Dismiss')}
              </button>
              <button
                type="button"
                className="btn sm solid"
                onClick={() => openModal('transaction', { type: 'expense', name: x.merchant, amount: x.amount ? Number(x.amount) : '', date: x.spent_on, pending: x.id })}
              >
                {t('Add')}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function EmailAddress() {
  const { toast } = useApp()
  const [token, setToken] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    inboxToken()
      .then((x) => alive && setToken(x))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])
  const address = inboxAddress(INBOX.address, token)
  return (
    <section className="sec-block">
      <div className="sec-head">
        <span className="sec-ic">
          <Icon name="mail" size={18} />
        </span>
        <div>
          <b>{t('Your receipts address')}</b>
          <small>{t('Forward a receipt here and it shows up to check. Keep it private: anything sent to it lands in your inbox here.')}</small>
        </div>
      </div>
      {failed ? (
        <p className="muted">{t('The receipts inbox isn’t set up yet: run the latest supabase/schema.sql.')}</p>
      ) : !INBOX.address ? (
        <p className="muted">{t('Email receipts need an inbound address (see the setup notes).')}</p>
      ) : address ? (
        <>
          <code className="pl-url">{address}</code>
          <div className="row-btns">
            <button type="button" className="btn sm" onClick={() => inboxToken(true).then(setToken).catch(() => null)}>
              {t('Make a new address')}
            </button>
            <button type="button" className="btn sm solid" onClick={() => navigator.clipboard?.writeText(address).then(() => toast(t('Address copied'), '', { icon: 'copy' }))}>
              <Icon name="copy" size={14} /> {t('Copy')}
            </button>
          </div>
          <small className="muted">{t('Tip: in Gmail, make a filter for emails with “receipt” or “order” and forward them here automatically.')}</small>
        </>
      ) : (
        <p className="muted">{t('Loading…')}</p>
      )}
    </section>
  )
}

function Gmail() {
  const { toast, server } = useApp()
  const [status, setStatus] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    gmailStatus()
      .then((x) => alive && setStatus(x))
      .catch(() => alive && setStatus(null))
    return () => {
      alive = false
    }
  }, [])
  const connect = async () => {
    setBusy(true)
    setError('')
    try {
      const { url } = await gmailConnect()
      window.location.assign(url)
    } catch (err) {
      setError(err?.setup ? t('Gmail isn’t set up for this app yet (see the setup notes).') : t('Couldn’t open Google sign-in.'))
      setBusy(false)
    }
  }
  const scan = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await gmailScan()
      await server.refreshPending()
      setStatus(await gmailStatus().catch(() => status))
      toast(t('Gmail checked'), r.added ? t('{n} receipts to check.', { n: r.added }) : t('No new receipts in the last 30 days.'), { icon: 'mail' })
    } catch {
      setError(t('Couldn’t check Gmail. Try connecting again.'))
    }
    setBusy(false)
  }
  const disconnect = async () => {
    setBusy(true)
    await gmailDisconnect().catch(() => null)
    setStatus(null)
    setBusy(false)
  }
  return (
    <section className="sec-block">
      <div className="sec-head">
        <span className={`sec-ic ${status ? 'on' : ''}`}>
          <Icon name="mail" size={18} />
        </span>
        <div>
          <b>Gmail</b>
          <small>
            {status
              ? t('Connected as {email}. Last checked {when}.', { email: status.email, when: status.last_scan ? stamp(localIso(new Date(status.last_scan))) : t('never') })
              : t('Optional: let the app read Gmail (read only) to find receipts and bills from the last 30 days. Only the amount, shop, date and subject are kept.')}
          </small>
        </div>
      </div>
      <div className="row-btns">
        {status ? (
          <>
            <button type="button" className="btn sm" onClick={disconnect} disabled={busy}>
              {t('Disconnect')}
            </button>
            <button type="button" className="btn sm solid" onClick={scan} disabled={busy}>
              <Icon name="refresh" size={14} /> {busy ? t('Checking…') : t('Check Gmail now')}
            </button>
          </>
        ) : status === null ? (
          <button type="button" className="btn sm solid" onClick={connect} disabled={busy}>
            {t('Connect Gmail')}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

export function InboxModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Receipts inbox')} sub={t('Receipts from your email become expenses to check')} width={520}>
      {open ? (
        <div className="form sec">
          <EmailAddress />
          <Gmail />
        </div>
      ) : null}
    </Modal>
  )
}
