/* ------------------------------------------------------------------
   Your profile: photo, name, email, phone and address.
   An email change only takes effect once the link emailed to the new
   address is clicked; see lib/profile.js.
   ------------------------------------------------------------------ */
import { useRef, useState } from 'react'
import Icon from './Icon'
import { Avatar } from './Brand'
import { Modal } from './ui'
import { useApp } from '../lib/store'
import { t } from '../lib/i18n'
import { changeEmail, clearAvatar, EMAIL_RE, normalisePhone, setAddress, setAvatar, setName, setPhoneNumber } from '../lib/profile'

const blankAddress = { line1: '', line2: '', city: '', region: '', postcode: '', country: '' }

/** One section of the form, with its own save button and message. */
function Section({ title, sub, children }) {
  return (
    <section className="pf-section">
      <div className="pf-head">
        <b>{title}</b>
        {sub ? <small>{sub}</small> : null}
      </div>
      {children}
    </section>
  )
}

function Note({ note }) {
  if (!note) return null
  return (
    <p className={`pf-note ${note.tone}`} role={note.tone === 'bad' ? 'alert' : 'status'}>
      {note.text}
    </p>
  )
}

const failed = (err) =>
  /rate limit|too many|seconds/i.test(err?.message ?? '')
    ? t('Too many tries. Wait a minute and try again.')
    : /already (been )?registered|already in use|exists/i.test(err?.message ?? '')
      ? t('Another account already uses that.')
      : t('Something went wrong, so nothing was changed. Try again in a minute.')

function ProfileBody() {
  const { user, demo, social } = useApp()
  const me = user.id
  const photoInput = useRef(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoNote, setPhotoNote] = useState(null)

  const [name, setNameText] = useState(user.name)
  const [nameNote, setNameNote] = useState(null)

  const [email, setEmail] = useState('')
  const [emailNote, setEmailNote] = useState(null)
  const [emailBusy, setEmailBusy] = useState(false)

  const [phone, setPhone] = useState(user.phone ? `+${user.phone.replace(/^\+/, '')}` : '')
  const [phoneNote, setPhoneNote] = useState(null)
  const [phoneBusy, setPhoneBusy] = useState(false)

  const [addr, setAddr] = useState({ ...blankAddress, ...(user.address ?? {}) })
  const [addrNote, setAddrNote] = useState(null)
  const [addrBusy, setAddrBusy] = useState(false)

  if (demo)
    return (
      <div className="form">
        <p className="form-note">
          {t('This is the demo, so there’s no profile to edit. Create an account to set your photo, email, phone and address.')}
        </p>
      </div>
    )

  const pickPhoto = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setPhotoNote({ tone: 'bad', text: t('Pick a photo (JPEG, PNG or WebP).') })
    setPhotoBusy(true)
    setPhotoNote(null)
    try {
      await setAvatar(me, file)
      setPhotoNote({ tone: 'good', text: t('Your new photo is saved.') })
      social?.refreshProfile?.()
    } catch (err) {
      setPhotoNote({
        tone: 'bad',
        text: err?.setup ? t('Profile photos need a one-time setup: run the latest supabase/schema.sql in Supabase.') : failed(err),
      })
    }
    setPhotoBusy(false)
  }
  const removePhoto = async () => {
    setPhotoBusy(true)
    try {
      await clearAvatar(me)
      setPhotoNote({ tone: 'good', text: t('Photo removed.') })
      social?.refreshProfile?.()
    } catch (err) {
      setPhotoNote({ tone: 'bad', text: failed(err) })
    }
    setPhotoBusy(false)
  }

  const saveName = async (e) => {
    e.preventDefault()
    const clean = name.trim().slice(0, 60)
    if (!clean || clean === user.name) return
    try {
      await setName(clean)
      setNameNote({ tone: 'good', text: t('Name saved.') })
      social?.refreshProfile?.(clean)
    } catch (err) {
      setNameNote({ tone: 'bad', text: failed(err) })
    }
  }

  const saveEmail = async (e) => {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!EMAIL_RE.test(clean)) return setEmailNote({ tone: 'bad', text: t('That doesn’t look like an email address.') })
    if (clean === user.email.toLowerCase()) return setEmailNote({ tone: 'info', text: t('That’s already your email.') })
    setEmailBusy(true)
    setEmailNote(null)
    try {
      await changeEmail(clean)
      setEmail('')
      setEmailNote({
        tone: 'good',
        text: t('Check {email} and click the link to confirm. Your email stays {old} until then.', { email: clean, old: user.email }),
      })
    } catch (err) {
      setEmailNote({ tone: 'bad', text: failed(err) })
    }
    setEmailBusy(false)
  }

  const savePhone = async (e) => {
    e.preventDefault()
    const number = phone.trim() ? normalisePhone(phone) : ''
    if (phone.trim() && !number) return setPhoneNote({ tone: 'bad', text: t('Enter the number with its country code, like +1 555 123 4567.') })
    setPhoneBusy(true)
    setPhoneNote(null)
    try {
      await setPhoneNumber(number || null)
      setPhoneNote({ tone: 'good', text: number ? t('Phone number saved.') : t('Phone number removed.') })
    } catch (err) {
      setPhoneNote({ tone: 'bad', text: failed(err) })
    }
    setPhoneBusy(false)
  }

  const saveAddress = async (e) => {
    e.preventDefault()
    const clean = Object.fromEntries(Object.entries(addr).map(([k, v]) => [k, String(v).trim().slice(0, 120)]))
    setAddrBusy(true)
    try {
      await setAddress(Object.values(clean).some(Boolean) ? clean : null)
      setAddrNote({ tone: 'good', text: t('Address saved.') })
    } catch (err) {
      setAddrNote({ tone: 'bad', text: failed(err) })
    }
    setAddrBusy(false)
  }
  const field = (k, label, props = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={addr[k]} onChange={(e) => setAddr((a) => ({ ...a, [k]: e.target.value }))} maxLength={120} {...props} />
    </label>
  )

  return (
    <div className="form profile-body">
      <Section title={t('Photo')}>
        <div className="pf-photo">
          <Avatar user={user} size={72} />
          <div>
            <button type="button" className="btn sm solid" disabled={photoBusy} onClick={() => photoInput.current?.click()}>
              <Icon name="upload" size={15} />
              {photoBusy ? t('Saving…') : user.avatar ? t('Change photo') : t('Add a photo')}
            </button>
            {user.avatar ? (
              <button type="button" className="btn sm" disabled={photoBusy} onClick={removePhoto}>
                {t('Remove')}
              </button>
            ) : null}
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                pickPhoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
        </div>
        <Note note={photoNote} />
      </Section>

      <Section title={t('Name')}>
        <form className="pf-row" onSubmit={saveName}>
          <input value={name} maxLength={60} onChange={(e) => setNameText(e.target.value)} aria-label={t('Name')} autoComplete="name" />
          <button type="submit" className="btn sm" disabled={!name.trim() || name.trim() === user.name}>
            {t('Save')}
          </button>
        </form>
        <Note note={nameNote} />
      </Section>

      <Section title={t('Email')} sub={user.newEmail ? t('Waiting for you to confirm {email}', { email: user.newEmail }) : user.email}>
        <form className="pf-row" onSubmit={saveEmail}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('New email address')}
            aria-label={t('New email address')}
            autoComplete="email"
          />
          <button type="submit" className="btn sm" disabled={!email.trim() || emailBusy}>
            {emailBusy ? t('Sending…') : t('Send link')}
          </button>
        </form>
        <small className="pf-hint">{t('We’ll email a link to the new address. The change happens when you click it.')}</small>
        <Note note={emailNote} />
      </Section>

      <Section title={t('Phone')} sub={user.phone ? `+${user.phone.replace(/^\+/, '')}` : t('No phone number yet')}>
        <form className="pf-row" onSubmit={savePhone}>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 123 4567"
            aria-label={t('Phone')}
            autoComplete="tel"
          />
          <button type="submit" className="btn sm" disabled={phoneBusy}>
            {phoneBusy ? t('Saving…') : t('Save')}
          </button>
        </form>
        <small className="pf-hint">{t('With the country code. Leave it empty and save to remove it.')}</small>
        <Note note={phoneNote} />
      </Section>

      <Section title={t('Address')}>
        <form className="pf-address" onSubmit={saveAddress}>
          {field('line1', t('Address line 1'), { autoComplete: 'address-line1' })}
          {field('line2', t('Address line 2 (optional)'), { autoComplete: 'address-line2' })}
          <div className="field-row">
            {field('city', t('City'), { autoComplete: 'address-level2' })}
            {field('region', t('State or region'), { autoComplete: 'address-level1' })}
          </div>
          <div className="field-row">
            {field('postcode', t('Postcode or ZIP'), { autoComplete: 'postal-code' })}
            {field('country', t('Country'), { autoComplete: 'country-name' })}
          </div>
          <button type="submit" className="btn solid" disabled={addrBusy}>
            {addrBusy ? t('Saving…') : t('Save address')}
          </button>
        </form>
        <Note note={addrNote} />
      </Section>
    </div>
  )
}

export function ProfileModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={t('Your profile')} sub={t('Photo, name, email, phone and address')} width={540}>
      {open ? <ProfileBody /> : null}
    </Modal>
  )
}
