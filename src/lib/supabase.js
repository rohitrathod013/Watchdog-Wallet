import { SUPABASE } from '../config'

/** True when a Supabase project is configured; otherwise the app runs as a no-login demo. */
export const accountsEnabled = Boolean(SUPABASE.url && SUPABASE.anonKey)

/* The Supabase library is only downloaded when accounts are switched on. */
let client = null
export const getSupabase = () =>
  (client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE.url, SUPABASE.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  ))

/** Where Supabase sends people back to after confirming email or resetting a password. */
export const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`

/* ---------------- per-user dashboard data ---------------- */

/** The parts of the app state that belong to an account and are saved for it. */
export const SAVED_KEYS = [
  'balance',
  'transactions',
  'goals',
  'budgets',
  'bills',
  'notifications',
  'contacts',
  'pots',
  'activity',
  'watchlist',
  'holdings',
  'guard',
  'socialSince',
]

/** Load this user's saved dashboard, or null if they have none yet. */
export async function loadUserState(userId) {
  const supabase = await getSupabase()
  const { data, error } = await supabase.from('user_state').select('data').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.data ?? null
}

/** Save (create or replace) this user's dashboard. */
export async function saveUserState(userId, state) {
  const supabase = await getSupabase()
  const { error } = await supabase.from('user_state').upsert({ user_id: userId, data: state, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Thrown when the delete_my_account SQL function hasn't been added to the project yet. */
export class DeletionNotSetUp extends Error {
  setup = true
}

/** Check the password of the signed-in user again, before something that can't be undone. */
export async function confirmPassword(email, password) {
  const supabase = await getSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Delete the signed-in user's login and saved data for good (see supabase/schema.sql). */
export async function deleteMyAccount() {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('delete_my_account')
  if (error) {
    // PGRST202: no such function, i.e. the SQL hasn't been run yet
    if (error.code === 'PGRST202' || /function .*delete_my_account/i.test(error.message ?? '')) throw new DeletionNotSetUp(error.message)
    throw error
  }
  // the session belonged to a user that no longer exists; drop it locally
  await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
}

/** Display profile for a signed-in Supabase user. */
export function profileOf(user) {
  const meta = user?.user_metadata ?? {}
  const email = user?.email ?? ''
  const name = (meta.full_name || meta.name || email.split('@')[0] || '').trim()
  return {
    id: user.id,
    name,
    first: name.split(' ')[0] || name,
    email,
    avatar: meta.avatar_url || null,
    phone: meta.phone || user?.phone || '',
    newEmail: user?.new_email || null,
    address: meta.address || null,
  }
}
