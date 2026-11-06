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
export const SAVED_KEYS = ['balance', 'transactions', 'goals', 'budgets', 'bills', 'notifications', 'contacts']

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

/** Display profile for a signed-in Supabase user. */
export function profileOf(user) {
  const meta = user?.user_metadata ?? {}
  const email = user?.email ?? ''
  const name = (meta.full_name || meta.name || email.split('@')[0] || '').trim()
  return { id: user.id, name, first: name.split(' ')[0] || name, email, avatar: meta.avatar_url || null }
}
