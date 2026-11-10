/* ------------------------------------------------------------------
   How photos, videos, files and voice notes look in a friends chat,
   plus the full-screen photo viewer. Files load through short-lived
   signed links (see lib/media.js).
   ------------------------------------------------------------------ */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { durationLabel, mediaUrl, sizeLabel } from '../lib/media'
import { t } from '../lib/i18n'

/** A signed link for a stored file; `local` (a blob: URL) wins while it's still uploading. */
function useMediaUrl(path, local) {
  const [state, setState] = useState({ for: null, url: null, failed: false })
  useEffect(() => {
    if (local || !path) return undefined
    let alive = true
    mediaUrl(path)
      .then((url) => alive && setState({ for: path, url, failed: false }))
      .catch(() => alive && setState({ for: path, url: null, failed: true }))
    return () => {
      alive = false
    }
  }, [path, local])
  if (local) return { url: local, failed: false }
  return state.for === path ? state : { url: null, failed: false }
}

/* ---------------- full-screen photo viewer ---------------- */
function Lightbox({ media, url, onClose }) {
  const [download, setDownload] = useState(null)
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    if (media.path) mediaUrl(media.path, media.name || 'photo.jpg').then(setDownload, () => null)
    return () => document.removeEventListener('keydown', key)
  }, [media, onClose])
  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('Photo')}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lb-bar">
        {download ? (
          <a className="icon-btn soft" href={download} aria-label={t('Download')}>
            <Icon name="download" size={18} />
          </a>
        ) : null}
        <button type="button" className="icon-btn soft" onClick={onClose} aria-label={t('Close')}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <img src={url} alt={media.name || t('Photo')} />
    </div>,
    document.body,
  )
}

/* ---------------- voice note player ---------------- */
function VoicePlayer({ media, url }) {
  const audio = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const length = media.duration || 0
  const peaks = media.peaks?.length ? media.peaks : Array(40).fill(3)
  const done = length ? Math.min(1, at / length) : 0

  const toggle = () => {
    const el = audio.current
    if (!el) return
    if (el.paused) {
      // only one voice note plays at a time
      document.querySelectorAll('audio[data-voice]').forEach((a) => a !== el && a.pause())
      el.play().catch(() => null)
    } else el.pause()
  }
  const seek = (e) => {
    const el = audio.current
    if (!el || !length) return
    const box = e.currentTarget.getBoundingClientRect()
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const p = Math.min(1, Math.max(0, (rtl ? box.right - e.clientX : e.clientX - box.left) / box.width))
    el.currentTime = p * length
    setAt(p * length)
  }

  return (
    <div className={`voice ${playing ? 'playing' : ''}`}>
      <button type="button" className="voice-play" onClick={toggle} disabled={!url} aria-label={playing ? t('Pause') : t('Play voice message')}>
        <Icon name={playing ? 'pause' : 'play'} size={18} stroke={2.2} />
      </button>
      <div
        className="voice-wave"
        onPointerDown={seek}
        role="slider"
        aria-label={t('Voice message')}
        aria-valuemin={0}
        aria-valuemax={Math.round(length)}
        aria-valuenow={Math.round(at)}
      >
        {peaks.map((h, i) => (
          <i key={i} className={i / peaks.length < done ? 'on' : ''} style={{ '--h': h }} />
        ))}
      </div>
      <span className="voice-time">{durationLabel(playing || at ? at : length)}</span>
      {url ? (
        <audio
          ref={audio}
          data-voice
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setAt(0)
          }}
          onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        />
      ) : null}
    </div>
  )
}

/* ---------------- one media message ---------------- */
export function MediaBubble({ media, local, caption }) {
  const { url, failed } = useMediaUrl(media.path, local)
  const [open, setOpen] = useState(false)
  const ratio = media.width && media.height ? `${media.width} / ${media.height}` : undefined

  let body
  if (failed) body = <p className="media-missing">{t('This file is no longer available.')}</p>
  else if (media.type === 'image')
    body = (
      <button type="button" className="media-photo" style={{ aspectRatio: ratio }} onClick={() => url && setOpen(true)} aria-label={t('Open photo')}>
        {url ? <img src={url} alt={caption || media.name || t('Photo')} loading="lazy" /> : <span className="media-wait" />}
      </button>
    )
  else if (media.type === 'video')
    body = (
      <div className="media-video" style={{ aspectRatio: ratio }}>
        {url ? <video src={url} controls preload="metadata" playsInline /> : <span className="media-wait" />}
      </div>
    )
  else if (media.type === 'audio') body = <VoicePlayer media={media} url={url} />
  else
    body = (
      <a className="media-file" href={url ?? undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url}>
        <span className="mf-ic">
          <Icon name="file" size={20} />
        </span>
        <span className="mf-main">
          <b>{media.name || t('File')}</b>
          <small>
            {sizeLabel(media.size || 0)} · {(media.mime || '').split('/')[1]?.toUpperCase() || t('File')}
          </small>
        </span>
        <Icon name="download" size={17} />
      </a>
    )

  return (
    <div className={`media-msg ${media.type}`}>
      {body}
      {caption ? <p className="media-caption">{caption}</p> : null}
      {open ? <Lightbox media={media} url={url} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}
