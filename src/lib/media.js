/* ------------------------------------------------------------------
   Chat media: photos, videos, files and voice notes.
   Files go to the private "chat-media" Supabase Storage bucket under
   <sender id>/<recipient id>/, and the policies in supabase/schema.sql
   only let the two people in that chat open them. Links to a file are
   signed and expire, so a copied link stops working after an hour.
   ------------------------------------------------------------------ */
import { getSupabase } from './supabase'

export const BUCKET = 'chat-media'
export const MAX_BYTES = 10 * 1024 * 1024
export const MAX_VOICE_SECONDS = 120

/** Thrown when the chat-media bucket isn't in the Supabase project yet. */
export class MediaNotSetUp extends Error {
  setup = true
}
export class TooBig extends Error {
  tooBig = true
}
export class NotAllowed extends Error {
  notAllowed = true
}

const ALLOWED = /^(image|video|audio)\/|^application\/pdf$|^text\/plain$/

export function kindOf(mime = '') {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

export const sizeLabel = (bytes) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export const durationLabel = (seconds) => {
  const s = Math.max(0, Math.round(seconds || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Not an image'))
    }
    img.src = url
  })

/**
 * Get a picked, pasted or dropped file ready to send: big photos are
 * scaled down to 1600px JPEGs (GIFs are left alone so they keep moving).
 * Returns { blob, mime, name, size, type, width?, height? }.
 */
export async function prepareFile(file) {
  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED.test(mime)) throw new NotAllowed(mime)
  const type = kindOf(mime)
  if (type === 'image' && mime !== 'image/gif') {
    try {
      const { img, url } = await loadImage(file)
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
      let blob = file
      let outMime = mime
      if (scale < 1 || file.size > 1.5 * 1024 * 1024) {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
        outMime = 'image/jpeg'
      }
      URL.revokeObjectURL(url)
      if (blob.size > MAX_BYTES) throw new TooBig(blob.size)
      const name = outMime === mime ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg'
      return {
        blob,
        mime: outMime,
        name,
        size: blob.size,
        type,
        width: Math.round(img.naturalWidth * scale),
        height: Math.round(img.naturalHeight * scale),
      }
    } catch (err) {
      if (err?.tooBig) throw err
      // couldn't read it as a picture: send the file as it is
    }
  }
  if (file.size > MAX_BYTES) throw new TooBig(file.size)
  return { blob: file, mime, name: file.name || 'file', size: file.size, type }
}

const extFor = (mime, name) => {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(name || '')?.[1]
  if (fromName) return fromName.toLowerCase()
  return (
    { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4' }[
      mime.split(';')[0]
    ] ?? 'bin'
  )
}

/** Upload into this chat's folder; returns the media record for the message. */
export async function uploadMedia(me, friend, prepared, extra = {}) {
  const supabase = await getSupabase()
  const path = `${me}/${friend}/${crypto.randomUUID()}.${extFor(prepared.mime, prepared.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared.blob, { contentType: prepared.mime, upsert: false })
  if (error) {
    if (/bucket not found|not found/i.test(error.message ?? '') || error.statusCode === '404') throw new MediaNotSetUp(error.message)
    if (/exceeded|too large|payload/i.test(error.message ?? '')) throw new TooBig(prepared.size)
    if (/mime|type/i.test(error.message ?? '')) throw new NotAllowed(prepared.mime)
    throw error
  }
  const media = { path, type: prepared.type, mime: prepared.mime, name: prepared.name, size: prepared.size }
  if (prepared.width) Object.assign(media, { width: prepared.width, height: prepared.height })
  return { ...media, ...extra }
}

export async function removeMedia(path) {
  const supabase = await getSupabase()
  await supabase.storage.from(BUCKET).remove([path])
}

/** Delete everything this user has uploaded (before deleting the account). */
export async function removeAllMyMedia(me) {
  const supabase = await getSupabase()
  const store = supabase.storage.from(BUCKET)
  const { data: folders } = await store.list(me, { limit: 1000 })
  for (const folder of folders ?? []) {
    const { data: files } = await store.list(`${me}/${folder.name}`, { limit: 1000 })
    const paths = (files ?? []).map((f) => `${me}/${folder.name}/${f.name}`)
    if (paths.length) await store.remove(paths)
  }
}

/* signed links, cached until shortly before they expire */
const signed = new Map()
export async function mediaUrl(path, download) {
  const key = `${path}|${download ?? ''}`
  const hit = signed.get(key)
  if (hit && hit.until > Date.now()) return hit.url
  const supabase = await getSupabase()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined)
  if (error) throw error
  signed.set(key, { url: data.signedUrl, until: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}

/* ---------------- voice notes ---------------- */
export const canRecord = () =>
  typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined'

const voiceMime = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => window.MediaRecorder.isTypeSupported?.(m)) ?? ''

/**
 * Start recording from the microphone. onLevel(0..1) gets the live volume.
 * Returns { stop(): Promise<{ blob, mime, seconds, peaks }>, cancel() }.
 */
export async function startRecording(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const mime = voiceMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const levels = []
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = Ctx ? new Ctx() : null
  let raf = 0
  if (ctx) {
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += ((v - 128) / 128) ** 2
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.2)
      levels.push(level)
      onLevel?.(level)
      raf = requestAnimationFrame(tick)
    }
    tick()
  }
  const started = performance.now()
  rec.start(250)
  const finish = () => {
    cancelAnimationFrame(raf)
    stream.getTracks().forEach((t) => t.stop())
    ctx?.close().catch(() => {})
  }
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          finish()
          const type = rec.mimeType || mime || 'audio/webm'
          const blob = new Blob(chunks, { type })
          resolve({ blob, mime: type.split(';')[0], seconds: (performance.now() - started) / 1000, peaks: peaksOf(levels, 40) })
        }
        rec.stop()
      }),
    cancel: () => {
      rec.onstop = finish
      if (rec.state !== 'inactive') rec.stop()
      else finish()
    },
  }
}

/** Squash the live volume readings into `bars` heights from 1 to 9 for the waveform. */
export function peaksOf(levels, bars) {
  if (!levels.length) return Array(bars).fill(1)
  const out = []
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i / bars) * levels.length)
    const to = Math.max(from + 1, Math.floor(((i + 1) / bars) * levels.length))
    const slice = levels.slice(from, to)
    out.push(Math.max(1, Math.min(9, Math.round((Math.max(...slice) || 0) * 9))))
  }
  return out
}
