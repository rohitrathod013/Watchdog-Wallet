import { useState } from 'react'
import Icon from './Icon'
import BuddyArt from './BuddyArt'
import { Logo } from './Brand'
import { getSupabase, siteUrl } from '../lib/supabase'
import { t } from '../lib/i18n'
import { LANGUAGES } from '../data/seed'
import { ASSISTANT, BRAND } from '../config'

/* Supabase error text → something friendly in the current language */
const friendly = (error) => {
  const m = (error?.message ?? '').toLowerCase()
  if (m.includes('invalid login')) return t('Wrong email or password.')
  if (m.includes('already registered') || m.includes('already exists')) return t('An account with this email already exists. Try logging in.')
  if (m.includes('not confirmed')) return t('Please confirm your email first. Check your inbox for the link.')
  if (m.includes('password') && (m.includes('6') || m.includes('short') || m.includes('weak'))) return t('Use a password with at least 8 characters.')
  if (m.includes('rate') || m.includes('too many')) return t('Too many attempts. Please wait a minute and try again.')
  if (m.includes('fetch') || m.includes('network')) return t('Can’t reach the server. Check your connection and try again.')
  return error?.message || t('Something went wrong. Please try again.')
}

function Field({ label, type = 'text', value, onChange, autoComplete, autoFocus, hint }) {
  const [show, setShow] = useState(false)
  const isPw = type === 'password'
  return (
    <label className="field">
      <span>{label}</span>
      <div className={isPw ? 'pw-input' : undefined}>
        <input
          type={isPw && show ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
        />
        {isPw ? (
          <button type="button" className="pw-eye" onClick={() => setShow((s) => !s)} aria-label={show ? t('Hide password') : t('Show password')}>
            <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
          </button>
        ) : null}
      </div>
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

/**
 * The signed-out experience: log in, sign up, forgot password, and (after
 * following a reset link) choose a new password.
 */
export default function Auth({ initialMode = 'login', lang, setLang, onPasswordUpdated }) {
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null) // 'confirm' | 'reset'

  const go = (m) => {
    setMode(m)
    setError('')
    setSent(null)
    setPassword('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setError('')
    if ((mode === 'signup' || mode === 'reset') && password.length < 8) {
      setError(t('Use a password with at least 8 characters.'))
      return
    }
    setBusy(true)
    try {
      const supabase = await getSupabase()
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (err) throw err
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: siteUrl() },
        })
        if (err) throw err
        // with email confirmation on, there is no session until the link is clicked
        if (!data.session) setSent('confirm')
      } else if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() })
        if (err) throw err
        setSent('reset')
      } else if (mode === 'reset') {
        const { error: err } = await supabase.auth.updateUser({ password })
        if (err) throw err
        onPasswordUpdated?.()
      }
    } catch (err) {
      setError(friendly(err))
    } finally {
      setBusy(false)
    }
  }

  const titles = {
    login: [t('Welcome back'), t('Log in to see your money at a glance.')],
    signup: [t('Create your account'), t('Start tracking your money with {brand} in a minute.', { brand: BRAND.name })],
    forgot: [t('Reset your password'), t('Enter your email and we’ll send you a link to choose a new password.')],
    reset: [t('Choose a new password'), t('Pick something you haven’t used before.')],
  }
  const [title, sub] = titles[mode]
  const action = { login: t('Log in'), signup: t('Create account'), forgot: t('Send reset link'), reset: t('Save new password') }[mode]

  return (
    <div className="auth">
      <div className="auth-langs" role="group" aria-label={t('Language')}>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            className={lang === l.code ? 'on' : ''}
            onClick={() => setLang(l.code)}
            aria-pressed={lang === l.code}
            title={l.name}
          >
            {l.code}
          </button>
        ))}
      </div>

      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={40} />
          <strong>{BRAND.name}</strong>
        </div>
        <div className="auth-buddy" aria-hidden="true">
          <BuddyArt size={92} mood={sent ? 'happy' : busy ? 'think' : 'idle'} />
        </div>

        {sent ? (
          <div className="auth-sent">
            <span className="auth-sent-ic">
              <Icon name="check" size={22} stroke={2.4} />
            </span>
            <h2>{t('Check your email')}</h2>
            <p>
              {sent === 'confirm'
                ? t('We sent a confirmation link to {email}. Open it to activate your account, then log in.', { email: email.trim() })
                : t('If an account exists for {email}, a reset link is on its way.', { email: email.trim() })}
            </p>
            <button type="button" className="btn solid lg block" onClick={() => go('login')}>
              {t('Back to log in')}
            </button>
          </div>
        ) : (
          <>
            <h2>{title}</h2>
            <p className="auth-sub">{sub}</p>

            {mode === 'login' || mode === 'signup' ? (
              <div className="auth-switch" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={mode === 'login' ? 'on' : ''}
                  onClick={() => go('login')}
                >
                  {t('Log in')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={mode === 'signup' ? 'on' : ''}
                  onClick={() => go('signup')}
                >
                  {t('Sign up')}
                </button>
              </div>
            ) : null}

            <form className="form auth-form" onSubmit={submit} noValidate={false}>
              {mode === 'signup' ? <Field label={t('Full name')} value={name} onChange={setName} autoComplete="name" autoFocus /> : null}
              {mode !== 'reset' ? (
                <Field label={t('Email')} type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus={mode !== 'signup'} />
              ) : null}
              {mode !== 'forgot' ? (
                <Field
                  label={mode === 'reset' ? t('New password') : t('Password')}
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  autoFocus={mode === 'reset'}
                  hint={mode === 'login' ? null : t('At least 8 characters.')}
                />
              ) : null}

              {mode === 'login' ? (
                <button type="button" className="link auth-forgot" onClick={() => go('forgot')}>
                  {t('Forgot password?')}
                </button>
              ) : null}

              {error ? (
                <p className="auth-error" role="alert">
                  <Icon name="alert" size={16} />
                  {error}
                </p>
              ) : null}

              <button type="submit" className="btn solid lg block" disabled={busy}>
                {busy ? t('Please wait…') : action}
              </button>
            </form>

            {mode === 'forgot' ? (
              <button type="button" className="link auth-back" onClick={() => go('login')}>
                <Icon name="arrowRight" size={14} className="flip" /> {t('Back to log in')}
              </button>
            ) : null}
          </>
        )}
      </div>

      <p className="auth-foot">{t('{name} keeps an eye on your money. Your data is private to your account.', { name: ASSISTANT.name })}</p>
    </div>
  )
}
