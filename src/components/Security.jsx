/* ------------------------------------------------------------------
   Security: two-step login (an authenticator app), unlocking with a
   passkey (fingerprint, face or PIN on this device), and the devices
   you're signed in on, with "sign out everywhere". Also the screen
   that asks for the 6-digit code after the password.
   ------------------------------------------------------------------ */
import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Logo } from './Brand'
import { Modal } from './ui'
import { useApp } from '../lib/store'
import { t } from '../lib/i18n'
import { BRAND } from '../config'
import { stamp, localIso } from '../lib/format'
import { deviceName, endSession, mfaEnroll, mfaFactors, mfaRemove, mfaVerify, mySessions, signOutScope } from '../lib/server'
import { addPasskey, hasPasskey, passkeyAvailable, removePasskey } from '../lib/passkey'

const codeOk = (c) => /^\d{6}$/.test(String(c).replace(/\s/g, ''))

/** Six digits from the authenticator app; calls onDone once it's right. */
export function CodeForm({ onDone, autoFocus = true }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    if (!codeOk(code)) return setError(t('Enter the 6-digit code from your authenticator app.'))
    setBusy(true)
    setError('')
    try {
      const [f] = await mfaFactors()
      if (!f) throw new Error('none')
      await mfaVerify(f.id, code)
      onDone()
    } catch {
      setError(t('That code didn’t work. Codes change every 30 seconds: try the newest one.'))
      setCode('')
    }
    setBusy(false)
  }
  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('6-digit code')}</span>
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
          autoFocus={autoFocus}
          placeholder="123 456"
        />
      </label>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn solid lg block" disabled={busy || !codeOk(code)}>
        <Icon name="shield" size={17} /> {busy ? t('Checking…') : t('Continue')}
      </button>
    </form>
  )
}

/** After the password, before the app opens: the second step. */
export function CodeScreen({ email, onDone, onSignOut }) {
  return (
    <div className="signed-out">
      <div className="so-card">
        <Logo size={56} />
        <h2>{t('Two-step login')}</h2>
        <p>{t('Open your authenticator app and enter the code for {brand} ({email}).', { brand: BRAND.name, email })}</p>
        <CodeForm onDone={onDone} />
        <button type="button" className="link" onClick={onSignOut}>
          {t('Log out')}
        </button>
      </div>
    </div>
  )
}

/* ---------------- two-step login ---------------- */
function TwoStep() {
  const { toast } = useApp()
  const [factors, setFactors] = useState(null)
  const [setup, setSetup] = useState(null) // { id, qr, secret } while turning it on
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sure, setSure] = useState(false)
  useEffect(() => {
    let alive = true
    mfaFactors()
      .then((f) => alive && setFactors(f))
      .catch(() => alive && setFactors([]))
    return () => {
      alive = false
    }
  }, [])
  const on = factors?.length > 0

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      setSetup(await mfaEnroll())
    } catch (err) {
      setError(/disabled|not enabled/i.test(err?.message ?? '') ? t('Two-step login is turned off for this project (Supabase > Authentication > Multi-factor).') : t('Couldn’t start it. Try again in a minute.'))
    }
    setBusy(false)
  }
  const finish = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await mfaVerify(setup.id, code)
      setSetup(null)
      setCode('')
      setFactors(await mfaFactors())
      toast(t('Two-step login is on'), t('Next time you log in, you’ll also enter a code from your app.'), { icon: 'shield', ms: 6000 })
    } catch {
      setError(t('That code didn’t work. Codes change every 30 seconds: try the newest one.'))
    }
    setBusy(false)
  }
  const turnOff = async () => {
    setBusy(true)
    try {
      for (const f of factors) await mfaRemove(f.id)
      setFactors([])
      setSure(false)
      toast(t('Two-step login is off'), t('Logging in needs only your password again.'), { icon: 'shield' })
    } catch {
      setError(t('Couldn’t turn it off. Log out, log in again with your code, then try.'))
    }
    setBusy(false)
  }

  return (
    <section className="sec-block">
      <div className="sec-head">
        <span className={`sec-ic ${on ? 'on' : ''}`}>
          <Icon name="shield" size={18} />
        </span>
        <div>
          <b>{t('Two-step login')}</b>
          <small>{on ? t('On: logging in needs your password and a code from your authenticator app.') : t('Add a code from an authenticator app (Google Authenticator, 1Password, Authy) to your password.')}</small>
        </div>
        {factors == null ? null : on ? (
          sure ? null : (
            <button type="button" className="btn sm" onClick={() => setSure(true)}>
              {t('Turn off')}
            </button>
          )
        ) : setup ? null : (
          <button type="button" className="btn sm solid" onClick={start} disabled={busy}>
            {t('Turn on')}
          </button>
        )}
      </div>
      {sure ? (
        <div className="row-btns">
          <button type="button" className="btn sm" onClick={() => setSure(false)}>
            {t('Keep it on')}
          </button>
          <button type="button" className="btn sm danger" onClick={turnOff} disabled={busy}>
            {t('Turn off two-step login')}
          </button>
        </div>
      ) : null}
      {setup ? (
        <form className="mfa-setup" onSubmit={finish}>
          <ol>
            <li>{t('Open your authenticator app and scan this code.')}</li>
            <li>{t('Type the 6-digit code it shows.')}</li>
          </ol>
          <img src={setup.qr} alt={t('QR code for your authenticator app')} width="176" height="176" />
          <small className="muted">
            {t('Can’t scan? Enter this key in the app:')} <code>{setup.secret}</code>
          </small>
          <input
            className="code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
            placeholder="123 456"
            aria-label={t('6-digit code')}
          />
          <div className="row-btns">
            <button type="button" className="btn sm" onClick={() => setSetup(null)}>
              {t('Cancel')}
            </button>
            <button type="submit" className="btn sm solid" disabled={busy || !codeOk(code)}>
              {t('Turn on')}
            </button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

/* ---------------- passkey unlock ---------------- */
function PasskeyUnlock() {
  const { user, toast } = useApp()
  const [can, setCan] = useState(null)
  const [has, setHas] = useState(() => hasPasskey(user.id))
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    passkeyAvailable().then((x) => alive && setCan(x))
    return () => {
      alive = false
    }
  }, [])
  const add = async () => {
    setError('')
    try {
      await addPasskey(user, BRAND.name)
      setHas(true)
      toast(t('Passkey added'), t('When the app locks, unlock it with your fingerprint, face or PIN.'), { icon: 'key' })
    } catch (err) {
      if (err?.name !== 'NotAllowedError') setError(t('This device couldn’t make a passkey.'))
    }
  }
  return (
    <section className="sec-block">
      <div className="sec-head">
        <span className={`sec-ic ${has ? 'on' : ''}`}>
          <Icon name="key" size={18} />
        </span>
        <div>
          <b>{t('Unlock with a passkey')}</b>
          <small>
            {can === false
              ? t('This device has no fingerprint, face or PIN unlock that the browser can use.')
              : has
                ? t('On for this device: unlock the app with your fingerprint, face or PIN.')
                : t('Use your fingerprint, face or PIN instead of your password when the app is locked. Only on this device.')}
          </small>
        </div>
        {can ? (
          has ? (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                removePasskey(user.id)
                setHas(false)
              }}
            >
              {t('Remove')}
            </button>
          ) : (
            <button type="button" className="btn sm solid" onClick={add}>
              {t('Add passkey')}
            </button>
          )
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

/* ---------------- signed-in devices ---------------- */
function Sessions() {
  const { signOut, toast } = useApp()
  const [list, setList] = useState(null)
  const [failed, setFailed] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () =>
    mySessions()
      .then((rows) => {
        setList(Array.isArray(rows) ? rows : [])
        setFailed('')
      })
      .catch((err) => setFailed(err?.setup ? t('Run the latest supabase/schema.sql to see your devices here.') : t('Couldn’t load your devices.')))
  useEffect(() => {
    let alive = true
    mySessions()
      .then((rows) => alive && setList(Array.isArray(rows) ? rows : []))
      .catch((err) => alive && setFailed(err?.setup ? t('Run the latest supabase/schema.sql to see your devices here.') : t('Couldn’t load your devices.')))
    return () => {
      alive = false
    }
  }, [])
  const end = async (id) => {
    setBusy(true)
    await endSession(id).catch(() => null)
    await load()
    setBusy(false)
  }
  const others = async () => {
    setBusy(true)
    try {
      await signOutScope('others')
      toast(t('Signed out of other devices'), t('Only this device is still signed in.'), { icon: 'logout' })
      await load()
    } catch {
      toast(t('Couldn’t sign out the other devices'), t('Try again in a minute.'), { icon: 'info' })
    }
    setBusy(false)
  }
  const everywhere = async () => {
    setBusy(true)
    await signOutScope('global').catch(() => null)
    signOut()
  }
  return (
    <section className="sec-block">
      <div className="sec-head">
        <span className="sec-ic">
          <Icon name="laptop" size={18} />
        </span>
        <div>
          <b>{t('Where you’re signed in')}</b>
          <small>{t('Sign out a device you don’t recognise, or every device at once.')}</small>
        </div>
      </div>
      {failed ? <p className="muted">{failed}</p> : null}
      {list ? (
        <ul className="sess-list">
          {list.map((s) => (
            <li key={s.id} className={s.current ? 'here' : ''}>
              <span>
                <b>
                  {deviceName(s.user_agent ?? '')}
                  {s.current ? <em>{t('This device')}</em> : null}
                </b>
                <small>
                  {t('Last used {when}', { when: stamp(localIso(new Date(s.last_used ?? s.created_at))) })}
                  {s.ip ? ` · ${s.ip}` : ''}
                  {s.aal === 'aal2' ? ` · ${t('with a code')}` : ''}
                </small>
              </span>
              {s.current ? null : (
                <button type="button" className="btn sm" disabled={busy} onClick={() => end(s.id)}>
                  {t('Sign out')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : failed ? null : (
        <p className="muted">{t('Loading…')}</p>
      )}
      <div className="row-btns">
        <button type="button" className="btn sm" disabled={busy} onClick={others}>
          {t('Sign out of other devices')}
        </button>
        <button type="button" className="btn sm danger" disabled={busy} onClick={everywhere}>
          <Icon name="logout" size={14} /> {t('Sign out everywhere')}
        </button>
      </div>
      <small className="muted">{t('A device that’s signed out may keep working for up to an hour, until its login expires.')}</small>
    </section>
  )
}

export function SecurityModal({ open, onClose }) {
  const { demo } = useApp()
  return (
    <Modal open={open} onClose={onClose} title={t('Security')} sub={t('Two-step login, passkeys and your devices')} width={540}>
      {open ? (
        demo ? (
          <p className="muted">{t('Security settings are for real accounts. Create one to turn them on.')}</p>
        ) : (
          <div className="form sec">
            <TwoStep />
            <PasskeyUnlock />
            <Sessions />
          </div>
        )
      ) : null}
    </Modal>
  )
}
