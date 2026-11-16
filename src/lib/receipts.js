/* ------------------------------------------------------------------
   Receipt photos on transactions. A private Supabase Storage bucket
   ("receipts"); each person's files sit in a folder named after their
   user id, and only they can add, open or delete them (see the policies
   in supabase/schema.sql). Links are signed and expire after an hour.
   ------------------------------------------------------------------ */
import { getSupabase } from './supabase'
import { MediaNotSetUp, NotAllowed, prepareFile } from './media'

export const RECEIPTS = 'receipts'

/** Upload a photo or PDF of a receipt; returns its path, to keep on the transaction. */
export async function uploadReceipt(me, file) {
  const prepared = await prepareFile(file)
  if (!/^image\/|^application\/pdf$/.test(prepared.mime)) throw new NotAllowed(prepared.mime)
  const ext = prepared.mime === 'application/pdf' ? 'pdf' : prepared.mime === 'image/png' ? 'png' : prepared.mime === 'image/webp' ? 'webp' : 'jpg'
  const path = `${me}/${crypto.randomUUID()}.${ext}`
  const supabase = await getSupabase()
  const { error } = await supabase.storage.from(RECEIPTS).upload(path, prepared.blob, { contentType: prepared.mime, upsert: false })
  if (error) {
    if (/bucket not found|not found/i.test(error.message ?? '') || error.statusCode === '404') throw new MediaNotSetUp(error.message)
    throw error
  }
  return { path, mime: prepared.mime }
}

const cache = new Map()
/** A link to look at a receipt (signed for an hour). */
export async function receiptUrl(path) {
  const hit = cache.get(path)
  if (hit && hit.until > Date.now()) return hit.url
  const supabase = await getSupabase()
  const { data, error } = await supabase.storage.from(RECEIPTS).createSignedUrl(path, 3600)
  if (error) throw error
  cache.set(path, { url: data.signedUrl, until: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}

export async function removeReceipt(path) {
  const supabase = await getSupabase()
  await supabase.storage.from(RECEIPTS).remove([path])
  cache.delete(path)
}

/** Delete every receipt this person uploaded (before deleting the account). */
export async function removeAllReceipts(me) {
  const supabase = await getSupabase()
  const store = supabase.storage.from(RECEIPTS)
  const { data: files } = await store.list(me, { limit: 1000 })
  const paths = (files ?? []).map((f) => `${me}/${f.name}`)
  if (paths.length) await store.remove(paths)
}
