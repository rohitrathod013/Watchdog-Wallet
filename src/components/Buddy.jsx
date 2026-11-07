import { useEffect, useRef, useState } from 'react'
import { useAnimate } from 'framer-motion'
import BuddyArt from './BuddyArt'
import { useApp } from '../lib/store'
import { ASSISTANT, BRAND } from '../config'
import { t } from '../lib/i18n'

const W = 220
const H = 250
const JUMP = 64
const BURST = ['💛', '✨', '🧡', '⭐', '💖', '✨', '🧡', '💛', '✨', '⭐', '💖', '✨']

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced'

/* centre-stage and corner positions for the current viewport (the wrapper scales from its centre) */
const metrics = () => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const small = vw < 640
  const cs = small ? 0.56 : 0.66
  const s = small ? 0.34 : 0.44
  const right = small ? 12 : 22
  const bottom = small ? 12 : 18
  const cx = vw / 2 - W / 2
  const cy = vh / 2 - H / 2 + 30
  return {
    vw,
    vh,
    cs,
    s,
    cx,
    cy,
    dx: vw - right - (W * s) / 2 - W / 2,
    dy: vh - bottom - (H * s) / 2 - H / 2,
    headTop: cy + H / 2 - (H * cs) / 2 + 16 * cs,
  }
}

const springy = (stiffness, damping) => ({ type: 'spring', stiffness, damping, restDelta: 0.5, restSpeed: 4 })
const launch = [0.2, 0.75, 0.35, 1]
const fall = [0.55, 0, 0.85, 0.4]

/**
 * Grace's entrance, driven by Framer Motion: an arcing flight from the top-right
 * to the middle, one happy hop with squash & stretch, then a hop over to the
 * bottom-right corner where he idles, blinks, follows the pointer and waves.
 */
export default function Buddy({ hidden, onOpen }) {
  const { user } = useApp()
  const [scope, animate] = useAnimate()
  const rig = useRef(null)
  const armL = useRef(null)
  const armR = useRef(null)
  const shadow = useRef(null)
  const [phase, setPhase] = useState('enter')
  const [stage, setStage] = useState(null)
  const [note, setNote] = useState(null)
  const [waving, setWaving] = useState(false)
  const [hover, setHover] = useState(false)

  /* ---------- the whole entrance as one async sequence ---------- */
  useEffect(() => {
    const wrap = scope.current
    const running = []
    let dead = false
    const go = (el, keyframes, options) => {
      const c = animate(el, keyframes, options)
      running.push(c)
      return c
    }
    const wait = (ms) => new Promise((r) => window.setTimeout(r, ms))
    const m = metrics()

    const land = async () => {
      await go(rig.current, { scaleX: 1.12, scaleY: 0.86 }, { duration: 0.09, ease: 'easeOut' })
      go(rig.current, { scaleX: 1, scaleY: 1 }, { type: 'spring', stiffness: 380, damping: 11 })
    }

    const run = async () => {
      if (reducedMotion() || !ASSISTANT.intro) {
        go(wrap, { x: m.dx, y: m.dy, scale: m.s, opacity: 1 }, { duration: 0 })
        setPhase('idle')
        return
      }

      /* 1 · fly in: x and y ride different springs, which draws a soft arc.
             y lands on time (no bounce) so the hops start the moment he touches down */
      go(wrap, { x: m.vw + 40, y: -H - 90, scale: m.cs * 0.55, rotate: 32, opacity: 1 }, { duration: 0 })
      await wait(500)
      if (dead) return
      go(wrap, { x: m.cx }, { type: 'spring', duration: 1, bounce: 0.12 })
      go(wrap, { scale: m.cs, rotate: 0 }, { type: 'spring', duration: 0.9, bounce: 0.25 })
      await go(wrap, { y: m.cy }, { duration: 0.95, ease: [0.3, 0.6, 0.45, 1] })
      if (dead) return

      /* 2 · celebrate: a single happy hop */
      setPhase('happy')
      setStage({ x: m.cx + W / 2, y: m.headTop - JUMP * m.cs - 18, by: m.cy + H / 2 - 12 })
      for (let i = 0; i < 1; i++) {
        await go(rig.current, { scaleX: 1.1, scaleY: 0.88 }, { duration: 0.13, ease: 'easeOut' })
        if (dead) return
        go(shadow.current, { scale: 0.58, opacity: 0.45 }, { duration: 0.3, ease: launch })
        go(armL.current, { rotate: 150 }, { type: 'spring', stiffness: 210, damping: 13 })
        go(armR.current, { rotate: -150 }, { type: 'spring', stiffness: 210, damping: 13 })
        await go(rig.current, { y: -JUMP, scaleX: 0.95, scaleY: 1.07 }, { duration: 0.3, ease: launch })
        if (dead) return
        go(shadow.current, { scale: 1, opacity: 1 }, { duration: 0.27, ease: fall })
        await go(rig.current, { y: 0, scaleX: 0.97, scaleY: 1.04 }, { duration: 0.27, ease: fall })
        if (dead) return
        go(armL.current, { rotate: 20 }, { type: 'spring', stiffness: 190, damping: 11 })
        go(armR.current, { rotate: -20 }, { type: 'spring', stiffness: 190, damping: 11 })
        await land()
        await wait(i === 0 ? 60 : 80)
        if (dead) return
      }
      go(armL.current, { rotate: 0 }, { type: 'spring', stiffness: 160, damping: 12 })
      go(armR.current, { rotate: 0 }, { type: 'spring', stiffness: 160, damping: 12 })
      await wait(200)
      if (dead) return
      setStage((st) => (st ? { ...st, out: true } : st))
      await wait(80)
      if (dead) return

      /* 3 · hop over to the corner */
      setPhase('dock')
      await go(rig.current, { scaleX: 1.08, scaleY: 0.9 }, { duration: 0.12, ease: 'easeOut' })
      go(rig.current, { scaleX: 0.96, scaleY: 1.05 }, { duration: 0.3 })
      go(wrap, { x: m.dx }, springy(50, 13))
      go(wrap, { rotate: [0, 14, -4, 0] }, { duration: 1.15, ease: 'easeInOut' })
      go(wrap, { scale: m.s }, { duration: 1.05, ease: [0.4, 0, 0.2, 1] })
      await go(wrap, { y: [m.cy, m.cy - 150, m.dy] }, { duration: 1.1, times: [0, 0.38, 1], ease: ['easeOut', fall] })
      if (dead) return
      setStage(null)
      await land()
      setPhase('idle')
    }

    run()
    return () => {
      dead = true
      running.forEach((c) => c.stop())
    }
  }, [animate, scope])

  /* ---------- keep the corner position on resize ---------- */
  useEffect(() => {
    if (phase !== 'idle') return undefined
    const place = () => {
      const m = metrics()
      animate(scope.current, { x: m.dx, y: m.dy, scale: m.s, rotate: 0 }, { duration: 0 })
    }
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [phase, animate, scope])

  /* ---------- idle life: hello note, waves, eyes on the pointer ---------- */
  useEffect(() => {
    if (phase !== 'idle') return undefined
    const timers = [
      window.setTimeout(() => setWaving(true), 350),
      window.setTimeout(() => setWaving(false), 2200),
      window.setTimeout(() => setNote('in'), 650),
      window.setTimeout(() => setNote('out'), 6400),
      window.setTimeout(() => setNote(null), 6700),
    ]
    const every = window.setInterval(() => {
      setWaving(true)
      window.setTimeout(() => setWaving(false), 1900)
    }, 11000)
    return () => {
      timers.forEach(window.clearTimeout)
      window.clearInterval(every)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'idle') return undefined
    const el = scope.current
    let raf = 0
    const move = (e) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height * 0.32)
        const d = Math.hypot(dx, dy) || 1
        const k = Math.min(1, d / 260) * 3.4
        el.style.setProperty('--lx', `${(dx / d) * k}px`)
        el.style.setProperty('--ly', `${(dy / d) * k}px`)
      })
    }
    window.addEventListener('pointermove', move)
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [phase, scope])

  const open = () => {
    if (phase !== 'idle') return
    setNote(null)
    onOpen()
  }

  const mood = phase === 'happy' || phase === 'dock' || (phase === 'idle' && hover) ? 'happy' : 'idle'

  return (
    <>
      <div
        ref={scope}
        className={`buddy ${phase} ${waving ? 'waving' : ''} ${hidden ? 'away' : ''}`}
        role={phase === 'idle' ? 'button' : undefined}
        tabIndex={phase === 'idle' && !hidden ? 0 : -1}
        aria-label={t('Chat with {name}, your {brand} assistant', { name: ASSISTANT.name, brand: BRAND.name })}
        aria-hidden={phase !== 'idle'}
        onClick={open}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="buddy-hover">
          {phase === 'idle' ? <i className="buddy-ring" /> : null}
          <BuddyArt mood={mood} rigRef={rig} armLRef={armL} armRRef={armR} shadowRef={shadow} />
        </div>
      </div>

      {stage ? (
        <>
          <div className="buddy-stage" style={{ left: stage.x, top: stage.y }}>
            <div className={`buddy-hi ${stage.out ? 'out' : ''}`}>
              {t('Hi {name}! 👋 I’m {assistant}', { name: user.first, assistant: ASSISTANT.name })}
            </div>
          </div>
          <div className="buddy-stage" style={{ left: stage.x, top: stage.by }} aria-hidden="true">
            <div className="buddy-burst">
              {BURST.map((e, k) => (
                <i
                  key={k}
                  style={{
                    '--a': `${(k / BURST.length) * 360 + (k % 2) * 14}deg`,
                    '--r': `${96 + (k % 3) * 30}px`,
                    '--k': k % 6,
                    '--fs': `${15 + (k % 3) * 5}px`,
                    '--wave': `${k >= 6 ? 800 : 0}ms`,
                  }}
                >
                  {e}
                </i>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {note && !hidden ? (
        <div className={`buddy-note ${note === 'out' ? 'out' : ''}`} onClick={open} role="presentation">
          <b>{t('Need a hand, {name}?', { name: user.first })}</b> {t('Ask me anything about your money 💬')}
        </div>
      ) : null}
    </>
  )
}
