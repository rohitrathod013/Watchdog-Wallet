/* ------------------------------------------------------------------
   Payment links: ask anyone for money with a link or a QR code, even
   if they don't have an account. PayLinksCard (Transfer page) makes
   and lists them; PayPage is the public page the link opens, where
   they pay by card with Stripe.
   ------------------------------------------------------------------ */
import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import Icon from './Icon'
import { Logo } from './Brand'
import { useApp } from '../lib/store'
import { money, stamp, localIso } from '../lib/format'
import { t } from '../lib/i18n'
import { BRAND } from '../config'
import { cancelPayLink, createPayLink, payLinkCheckout, payLinkConfirm, payLinkInfo, payLinkUrl } from '../lib/server'

/** A QR code for a link, drawn as SVG (works in both themes: dark squares on a white tile). */
export function QrCode({ text, size = 168, label }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`
    return { d, n: n + 8 }
  }, [text])
  return (
    <svg className="qr-svg" width={size} height={size} viewBox={`0 0 ${path.n} ${path.n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={path.n} height={path.n} fill="#fff" rx="2" />
      <path d={path.d} fill="#111" />
    </svg>
  )
}

async function share(url, text, toast) {
  try {
    if (navigator.share) return await navigator.share({ title: BRAND.name, text, url })
    await navigator.clipboard.writeText(url)
    toast(t('Link copied'), url, { icon: 'copy' })
  } catch {
    /* cancelled */
  }
}

export function PayLinksCard({ d = 0 }) {
  const { server, toast, demo, accounts } = useApp()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState(null)
  const [error, setError] = useState('')
  if (!accounts || demo) return null
  const links = server?.payLinks ?? []
  const n = Number(amount)
  const ok = n >= 1 && n <= 10000 && !busy

  const make = async (e) => {
    e.preventDefault()
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      const id = await createPayLink(n, note.trim())
      setShown(id)
      setAmount('')
      setNote('')
      await server.refreshPayLinks()
    } catch (err) {
      setError(err?.setup ? t('Payment links aren’t set up yet: run the latest supabase/schema.sql.') : t('Couldn’t make the link. Try again in a minute.'))
    }
    setBusy(false)
  }
  const open = links.filter((l) => l.status === 'open')
  const done = links.filter((l) => l.status !== 'open').slice(0, 5)
  const showLink = links.find((l) => l.id === shown)

  return (
    <section className="card paylinks-card" style={{ '--d': `${d}ms` }}>
      <div className="c-head rv" style={{ '--i': 0 }}>
        <div>
          <h2 className="card-h">{t('Payment links')}</h2>
          <p className="card-sub">{t('Ask anyone for money, even without an account. They pay by card.')}</p>
        </div>
      </div>
      <form className="pl-form rv" style={{ '--i': 1 }} onSubmit={make}>
        <div className="amount-input sm">
          <b>$</b>
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} aria-label={t('Amount')} />
        </div>
        <input className="pl-note" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder={t('What for (dinner, tickets…)')} aria-label={t('What for')} />
        <button type="submit" className="btn solid" disabled={!ok}>
          <Icon name="qr" size={16} /> {t('Make link')}
        </button>
      </form>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {showLink ? (
        <div className="pl-show rv" style={{ '--i': 2 }}>
          <QrCode text={payLinkUrl(showLink.id)} label={t('QR code to pay {amount}', { amount: money(Number(showLink.amount)) })} />
          <div>
            <b>{money(Number(showLink.amount))}</b>
            {showLink.note ? <small>{showLink.note}</small> : null}
            <code className="pl-url">{payLinkUrl(showLink.id)}</code>
            <div className="row-btns">
              <button type="button" className="btn sm solid" onClick={() => share(payLinkUrl(showLink.id), t('Pay me {amount}', { amount: money(Number(showLink.amount)) }), toast)}>
                <Icon name="send" size={14} /> {t('Share')}
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => navigator.clipboard?.writeText(payLinkUrl(showLink.id)).then(() => toast(t('Link copied'), '', { icon: 'copy' }))}
              >
                <Icon name="copy" size={14} /> {t('Copy')}
              </button>
              <button type="button" className="btn sm" onClick={() => setShown(null)}>
                {t('Done')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {open.length || done.length ? (
        <ul className="pl-list">
          {[...open, ...done].map((l) => (
            <li key={l.id} className={l.status}>
              <button type="button" className="pl-main" onClick={() => l.status === 'open' && setShown(l.id)} disabled={l.status !== 'open'}>
                <b>{money(Number(l.amount))}</b>
                <small>
                  {l.note || t('No note')} · {stamp(localIso(new Date(l.created_at)))}
                </small>
              </button>
              {l.status === 'open' ? (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() =>
                    cancelPayLink(l.id)
                      .then(server.refreshPayLinks)
                      .catch(() => null)
                  }
                >
                  {t('Cancel')}
                </button>
              ) : (
                <em className={`pl-status ${l.status}`}>{l.status === 'paid' ? t('Paid{name}', { name: l.payer_name ? ` · ${l.payer_name}` : '' }) : t('Cancelled')}</em>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/* ---------------- the public page a link opens ---------------- */
export function PayPage({ id }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [paid, setPaid] = useState(false)
  useEffect(() => {
    let alive = true
    const q = new URLSearchParams(window.location.search)
    const session = q.get('link_paid')
    const load = async () => {
      try {
        if (session) {
          await payLinkConfirm(id, session)
          if (alive) setPaid(true)
        }
        const i = await payLinkInfo(id)
        if (alive) setInfo(i)
      } catch (err) {
        if (alive) setError(err?.status === 404 ? t('This payment link doesn’t exist.') : err?.status === 409 ? t('Stripe is still processing the payment. Refresh in a minute.') : t('Couldn’t open this payment link. Try again in a minute.'))
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [id])

  const pay = async () => {
    setBusy(true)
    setError('')
    try {
      const { url } = await payLinkCheckout(id, name.trim())
      window.location.assign(url)
    } catch (err) {
      setError(err?.message || t('Couldn’t start the payment.'))
      setBusy(false)
    }
  }

  return (
    <div className="signed-out pay-page">
      <div className="so-card">
        <Logo size={56} />
        {!info && !error ? (
          <p>{t('Loading…')}</p>
        ) : error && !info ? (
          <>
            <h2>{t('Payment link')}</h2>
            <p>{error}</p>
          </>
        ) : paid || info.status === 'paid' ? (
          <>
            <h2>{t('Paid, thank you!')}</h2>
            <p>{t('{name} has been paid {amount}.', { name: info.to, amount: money(info.amount) })}</p>
          </>
        ) : info.status === 'cancelled' ? (
          <>
            <h2>{t('Payment link')}</h2>
            <p>{t('This link was cancelled, so there’s nothing to pay.')}</p>
          </>
        ) : (
          <>
            <h2>{t('{name} asked you for {amount}', { name: info.to, amount: money(info.amount) })}</h2>
            {info.note ? <p className="pay-note-big">“{info.note}”</p> : null}
            <label className="field">
              <span>{t('Your name (so they know it was you)')}</span>
              <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="button" className="btn solid lg block" onClick={pay} disabled={busy}>
              <Icon name="card" size={18} /> {busy ? t('Opening…') : t('Pay {amount} by card', { amount: money(info.amount) })}
            </button>
            <small className="muted">
              {info.test ? t('Test mode: use card 4242 4242 4242 4242, any future date and any CVC.') : t('Card payments are handled by Stripe. No account needed.')}
            </small>
          </>
        )}
        <a className="link" href={`${import.meta.env.BASE_URL}`}>
          {t('What is {brand}?', { brand: BRAND.name })}
        </a>
      </div>
    </div>
  )
}
