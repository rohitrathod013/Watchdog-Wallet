/* ------------------------------------------------------------------
   Editing your own profile: photo, name, email, phone and address.
   An email change is verified by Supabase Auth: the new email only
   takes effect after the link in the confirmation email is clicked.
   The phone number and address are saved on the login as they are.
   The photo sits in the public "avatars" bucket, in your own folder.
   ------------------------------------------------------------------ */
import { getSupabase, siteUrl } from './supabase'

export const AVATARS = 'avatars'

async function update(attrs, options) {
  const supabase = await getSupabase()
  const { data, error } = await supabase.auth.updateUser(attrs, options)
  if (error) throw error
  return data.user
}

/** A square, 320px JPEG from any picture, cropped from the middle. */
export async function squarePhoto(file, size = 320) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Not an image'))
      i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Upload a new profile photo, point the account at it, and tidy away the old ones. */
export async function setAvatar(me, file) {
  const supabase = await getSupabase()
  const blob = await squarePhoto(file)
  const store = supabase.storage.from(AVATARS)
  const path = `${me}/avatar-${Date.now()}.jpg`
  const { error } = await store.upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) {
    if (/bucket not found|not found/i.test(error.message ?? '')) throw Object.assign(new Error(error.message), { setup: true })
    throw error
  }
  const url = store.getPublicUrl(path).data.publicUrl
  await update({ data: { avatar_url: url } })
  await removeOldAvatars(me, path)
  return url
}

export async function clearAvatar(me) {
  await update({ data: { avatar_url: null } })
  await removeOldAvatars(me, null)
}

async function removeOldAvatars(me, keep) {
  const supabase = await getSupabase()
  const store = supabase.storage.from(AVATARS)
  const { data } = await store.list(me, { limit: 100 })
  const old = (data ?? []).map((f) => `${me}/${f.name}`).filter((p) => p !== keep)
  if (old.length) await store.remove(old).catch(() => null)
}

export const setName = (name) => update({ data: { full_name: name, name } })

/** Ask for an email change: Supabase emails a confirmation link, and nothing changes until it's clicked. */
export const changeEmail = (email) => update({ email }, { emailRedirectTo: siteUrl() })

/** Save a phone number on the profile (no SMS check), or null to remove it. */
export const setPhoneNumber = (phone) => update({ data: { phone } })

export const setAddress = (address) => update({ data: { address } })

/** "+44 7700 900123", "(555) 123-4567" with a country code… → "+447700900123", or '' if it can't be a number. */
export function normalisePhone(raw) {
  const s = String(raw).trim()
  const digits = s.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return ''
  return s.startsWith('+') || s.startsWith('00') ? `+${digits.replace(/^00/, '')}` : ''
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
