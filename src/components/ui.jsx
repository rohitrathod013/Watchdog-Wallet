import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { RevealContext, StageContext, useApp, useStageBase } from '../lib/store'
import { t } from '../lib/i18n'

/* ---------------- Stage ----------------
   One entrance choreography. Captures the intro offset when it mounts and
   marks itself "settled" once its entrance has played, so content added
   later animates in quickly. */
export function Stage({ children, className = '' }) {
  const { booting } = useApp()
  const [base] = useState(() => (booting ? 520 : 0))
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), base ? 3000 : 1700)
    return () => window.clearTimeout(t)
  }, [base])
  return (
    <StageContext.Provider value={base}>
      <div className={`stage ${className} ${settled ? 'settled' : ''}`} style={{ '--base': `${base}ms` }}>
        {children}
      </div>
    </StageContext.Provider>
  )
}

/* ---------------- Reveal ----------------
   Holds its entrance until it scrolls into view. If it is already on
   screen at mount it simply joins the stage's choreography, a beat later. */
export function Reveal({ children, className = '', after = 450 }) {
  const stageBase = useStageBase()
  const ref = useRef(null)
  const [state, setState] = useState('wait')
  useEffect(() => {
    let first = true
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setState(first ? 'now' : 'scroll')
          io.disconnect()
        }
        first = false
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  const base = state === 'now' ? stageBase + after : 0
  return (
    <StageContext.Provider value={state === 'scroll' ? 0 : stageBase}>
      <RevealContext.Provider value={state !== 'wait'}>
        <div ref={ref} className={`reveal ${className} ${state === 'wait' ? 'wait' : ''}`} style={{ '--base': `${base}ms` }}>
          {children}
        </div>
      </RevealContext.Provider>
    </StageContext.Provider>
  )
}

/* ---------------- CountUp ----------------
   Writes straight into the DOM on every frame so a counting number never
   re-renders the page. Re-targets smoothly when `value` changes. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US'), duration = 1400, delay = 0, className }) {
  const ref = useRef(null)
  const shown = useRef(null)
  const fmt = useRef(format)
  const go = useContext(RevealContext)

  useLayoutEffect(() => {
    fmt.current = format
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (!go) {
      el.textContent = fmt.current(0)
      return undefined
    }
    const from = shown.current ?? 0
    const to = value
    const wait = shown.current == null ? delay : 0
    let raf = 0
    let start = 0
    const ease = (t) => 1 - Math.pow(1 - t, 4)
    const tick = (now) => {
      if (!start) start = now
      const t = Math.min(1, (now - start - wait) / duration)
      if (t < 0) {
        raf = requestAnimationFrame(tick)
        return
      }
      const v = from + (to - from) * ease(t)
      shown.current = v
      el.textContent = fmt.current(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    el.textContent = fmt.current(from)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, delay, go])

  return <span ref={ref} className={className} />
}

/* ---------------- Change pill: (↗) +12.4% vs Last Week ---------------- */
export function Chg({ value, note, size, className = '', style }) {
  const up = value >= 0
  return (
    <span className={`chg ${up ? 'up' : 'down'} ${size ?? ''} ${className}`} style={style}>
      <i>
        <Icon name={up ? 'trendUp' : 'trendDown'} size={size === 'sm' ? 11 : 12} stroke={2.4} />
      </i>
      <b>
        {up ? '+' : '-'}
        {Math.abs(value).toFixed(1)}%
      </b>
      {note ? <span>{note}</span> : null}
    </span>
  )
}

const STATUS_TONE = { Completed: 'green', Pending: 'amber', Failed: 'red' }

export function Status({ value }) {
  return (
    <span className={`status ${STATUS_TONE[value] ?? ''}`}>
      <i />
      {t(value)}
    </span>
  )
}

export function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!on)
      }}
    >
      <i />
    </button>
  )
}

/* ---------------- Segmented control with a sliding thumb ---------------- */
export function Segmented({ items, value, onChange, className = '' }) {
  const wrap = useRef(null)
  const thumb = useRef(null)

  useLayoutEffect(() => {
    const place = () => {
      const btn = wrap.current?.querySelector(`[data-key="${CSS.escape(String(value))}"]`)
      if (!btn || !thumb.current) return
      thumb.current.style.width = `${btn.offsetWidth}px`
      thumb.current.style.transform = `translateX(${btn.offsetLeft}px)`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [value, items])

  return (
    <div className={`seg ${className}`} ref={wrap} role="tablist">
      <span className="seg-thumb" ref={thumb} />
      {items.map((it) => {
        const key = typeof it === 'string' ? it : it.key
        const label = typeof it === 'string' ? it : it.label
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={value === key}
            data-key={key}
            className={value === key ? 'on' : ''}
            onClick={() => onChange(key)}
          >
            {label}
            {typeof it === 'object' && it.count != null ? <em>{it.count}</em> : null}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Popover ---------------- */
export function Popover({ open, onClose, anchor = 'right', className = '', children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const down = (e) => {
      if (ref.current && !ref.current.parentElement.contains(e.target)) onClose()
    }
    const key = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open, onClose])
  // on narrow screens the button can sit at either edge: slide the menu back inside the window
  useLayoutEffect(() => {
    const el = ref.current
    if (!open || !el) return
    el.style.translate = ''
    const gap = 12
    // the opening animation scales from the anchored corner, so measure from that edge
    const box = el.getBoundingClientRect()
    const left = anchor === 'left' ? box.left : box.right - el.offsetWidth
    const right = left + el.offsetWidth
    const vw = document.documentElement.clientWidth
    const shift = left < gap ? gap - left : right > vw - gap ? vw - gap - right : 0
    if (shift) el.style.translate = `${Math.round(shift)}px 0`
  }, [open, anchor])
  if (!open) return null
  return (
    <div ref={ref} className={`pop ${anchor} ${className}`} role="menu">
      {children}
    </div>
  )
}

export function MenuItem({ icon, children, onClick, tone, on = false, i = 0 }) {
  return (
    <button type="button" role="menuitem" className={`menu-item ${tone ?? ''} ${on ? 'on' : ''}`} style={{ '--i': i }} onClick={onClick}>
      {icon ? <Icon name={icon} size={17} /> : null}
      <span>{children}</span>
      {on ? <Icon name="check" size={16} stroke={2.2} /> : null}
    </button>
  )
}

/* ---------------- Dropdown: a pill that opens a short option list ---------------- */
export function Dropdown({ value, options, onChange, icon, small = false, anchor = 'right', label }) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <div className="anchor">
      <button
        type="button"
        className={`drop-btn ${small ? 'sm' : ''} ${open ? 'on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        {icon ? <Icon name={icon} size={18} /> : null}
        {current?.label}
        <Icon name="chevDown" size={15} stroke={2} className="chev" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} className="opt-pop">
        {options.map((o, i) => (
          <MenuItem
            key={o.value}
            i={i}
            on={o.value === value}
            onClick={() => {
              onChange(o.value)
              setOpen(false)
            }}
          >
            {o.label}
          </MenuItem>
        ))}
      </Popover>
    </div>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, sub, width = 460, children, footer }) {
  useEffect(() => {
    if (!open) return undefined
    const key = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-veil" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h3>{title}</h3>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className="icon-btn soft" onClick={onClose} aria-label={t('Close')}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}

/** The drawn ring + tick shown after a money action goes through. */
export function Success({ title, body }) {
  return (
    <div className="success">
      <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r="34" fill="none" stroke="var(--green)" strokeWidth="4" strokeLinecap="round" />
        <path d="m25 39 9 9 17-19" fill="none" stroke="var(--green)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h4>{title}</h4>
      <p>{body}</p>
    </div>
  )
}

/* ---------------- Progress ring ---------------- */
export function Ring({ value, size = 96, stroke = 9, color = 'var(--accent)', track = 'var(--soft)', children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ '--c': c }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-body">{children}</div>
    </div>
  )
}

/* ---------------- Page header: words blur up one by one ---------------- */
export function PageHead({ title, sub, children }) {
  const words = title.split(' ')
  return (
    <header className="page-head">
      <div>
        <h1 aria-label={title}>
          {words.map((w, i) => (
            <span key={`${w}-${i}`} className="word" style={{ '--i': i }} aria-hidden="true">
              {w}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </h1>
        <p className="rv" style={{ '--i': words.length }}>
          {sub}
        </p>
      </div>
      {children ? (
        <div className="page-actions rv" style={{ '--i': words.length + 1 }}>
          {children}
        </div>
      ) : null}
    </header>
  )
}

export function Empty({ icon = 'search', title, body }) {
  return (
    <div className="empty">
      <span>
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
    </div>
  )
}

export function Toasts({ items, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className="toast">
          <span className="toast-icon">
            <Icon name={item.icon ?? 'check'} size={16} stroke={2.2} />
          </span>
          <div>
            <strong>{item.title}</strong>
            {item.body ? <p>{item.body}</p> : null}
          </div>
          <button type="button" onClick={() => onDismiss(item.id)} aria-label={t('Dismiss')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
