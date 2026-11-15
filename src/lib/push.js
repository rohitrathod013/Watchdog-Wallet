/* ------------------------------------------------------------------
   Push notifications on this device: new messages, friend requests,
   money requests, payments received and bills due tomorrow, even when
   the app is closed. The browser gives a push address for this device;
   it's saved to the account (push_subscriptions) so the push Edge
   Function can reach it. Needs the service worker (the installed or
   published site) and the public VAPID key in PUSH.publicKey.
   ------------------------------------------------------------------ */
import { PUSH } from '../config'
import { getSupabase } from './supabase'

/** Can this browser do push at all, and is the app set up for it? */
export const pushSupported = () =>
  Boolean(PUSH.publicKey) && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const keyBytes = (base64url) => {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0))
}

async function registration() {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('no service worker')), 5000))])
  return reg
}

/** Is push on for this device right now? */
export async function pushIsOn() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  try {
    return Boolean(await (await registration()).pushManager.getSubscription())
  } catch {
    return false
  }
}

/** Turn push on for this device. Returns 'on' | 'denied' | 'unsupported' | 'error'. */
export async function enablePush(userId) {
  if (!pushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  try {
    const reg = await registration()
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH.publicKey) }))
    const json = sub.toJSON()
    const supabase = await getSupabase()
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ endpoint: json.endpoint, user_id: userId, p256dh: json.keys.p256dh, auth: json.keys.auth }, { onConflict: 'endpoint' })
    if (error) throw error
    return 'on'
  } catch {
    return 'error'
  }
}

/** Turn push off for this device (and forget its address). */
export async function disablePush() {
  try {
    const sub = await (await registration()).pushManager.getSubscription()
    if (!sub) return
    const supabase = await getSupabase()
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch {
    /* already off */
  }
}
