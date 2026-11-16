/* ------------------------------------------------------------------
   Unlock with a passkey: the device's fingerprint, face or PIN instead
   of typing the password after Grace locks the app. It's a passkey
   made on this device only (WebAuthn, platform authenticator, user
   verification required); its id is kept in this browser. The lock
   only covers a session that's already signed in, so a successful
   check on this device is what's needed to open it again.
   ------------------------------------------------------------------ */
const KEY = (userId) => `ww-passkey-${userId}`
const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const random = (n) => crypto.getRandomValues(new Uint8Array(n))

/** Can this device do it? (a fingerprint reader, face unlock or Windows Hello) */
export async function passkeyAvailable() {
  try {
    return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()))
  } catch {
    return false
  }
}

export function hasPasskey(userId) {
  try {
    return Boolean(userId && localStorage.getItem(KEY(userId)))
  } catch {
    return false
  }
}

/** Make the passkey (the device asks for the fingerprint, face or PIN). */
export async function addPasskey(user, appName) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: appName },
      user: { id: random(16), name: user.email || user.name || 'me', displayName: user.name || user.email || 'me' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  })
  if (!cred) throw new Error('No passkey was made')
  localStorage.setItem(KEY(user.id), b64u(cred.rawId))
}

export function removePasskey(userId) {
  try {
    localStorage.removeItem(KEY(userId))
  } catch {
    /* nothing kept */
  }
}

/** Ask the device to check it's them. Resolves true, or throws if they cancel or it fails. */
export async function checkPasskey(userId) {
  const id = localStorage.getItem(KEY(userId))
  if (!id) throw new Error('No passkey on this device')
  const got = await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      allowCredentials: [{ type: 'public-key', id: fromB64u(id), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  })
  // the device only returns it after the fingerprint, face or PIN matched (user verification)
  const flags = got ? new Uint8Array(got.response.authenticatorData)[32] : 0
  if (!got || !(flags & 0x04)) throw new Error('Not verified')
  return true
}
