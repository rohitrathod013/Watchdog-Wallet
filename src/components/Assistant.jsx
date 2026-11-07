import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import BuddyArt from './BuddyArt'
import { MerchantLogo } from './Brand'
import { useApp } from '../lib/store'
import { greetingAlerts, respond, starters } from '../lib/assistant'
import { cachedHolidays, homeCountry, loadHolidays } from '../lib/live'
import { graceVoice } from '../lib/voice'
import { signed, uid } from '../lib/format'
import { ASSISTANT, BRAND } from '../config'
import { getLocale, LOCALES, t, tName } from '../lib/i18n'

/* "**bold**", newlines and "• " bullets, cut off after `limit` visible characters */
const plainLength = (text) => text.replace(/\*\*/g, '').replace(/^• /gm, '').length

function Rich({ text, limit = Infinity }) {
  let left = limit
  const out = []
  const lines = text.split('\n')
  for (let li = 0; li < lines.length && left > 0; li++) {
    const bullet = lines[li].startsWith('• ')
    const parts = (bullet ? lines[li].slice(2) : lines[li]).split(/(\*\*[^*]+\*\*)/).filter(Boolean)
    const segs = []
    for (let pi = 0; pi < parts.length && left > 0; pi++) {
      const bold = parts[pi].startsWith('**')
      const str = bold ? parts[pi].slice(2, -2) : parts[pi]
      segs.push(bold ? <b key={pi}>{str.slice(0, left)}</b> : <span key={pi}>{str.slice(0, left)}</span>)
      left -= str.length
    }
    left -= 1
    out.push(
      <p key={li} className={bullet ? 'li' : ''}>
        <span>{segs}</span>
      </p>,
    )
  }
  return out
}

/* never echo long digit runs (card numbers, codes) back on screen */
const maskDigits = (s) => s.replace(/(?:\d[ -]?){8,}/g, (m) => `•••• ${m.replace(/\D/g, '').slice(-4)}`)

/* first sentence of a reply, without the bold markers: a short label for the activity log */
const gist = (text) =>
  text
    .replace(/\*\*/g, '')
    .split(/(?<=[.!?])\s|\n/)[0]
    .slice(0, 120)

const Speech = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

/* read a reply aloud in the current language, without the markdown and emoji */
function say(text) {
  if (!canSpeak || !text) return
  const clean = text
    .replace(/\*\*/g, '')
    .replace(/^• /gm, '')
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .replace(/\n+/g, '. ')
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = LOCALES[getLocale()]?.tag ?? 'en'
  // a female voice in the current language (see lib/voice.js)
  const { voice, pitch } = graceVoice(u.lang)
  if (voice) {
    u.voice = voice
    u.lang = voice.lang
  }
  u.pitch = pitch
  u.rate = 1.02
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

function Card({ card }) {
  if (card.type === 'stats') {
    return (
      <div className="ai-card">
        <div className="ai-stats">
          {card.items.map((it) => (
            <div key={it.label}>
              <small>
                {it.label}
                {it.note ? <em>{it.note}</em> : null}
              </small>
              <b>{it.value}</b>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (card.type === 'tx') {
    return (
      <div className="ai-card">
        {card.rows.map((row) => (
          <div key={row.id} className="ai-tx">
            <MerchantLogo kind={row.kind} size={32} />
            <span>
              <b>{tName(row.name)}</b>
              <small>{t(row.category)}</small>
            </span>
            <strong className={row.amount > 0 ? 'in' : ''}>{signed(row.amount)}</strong>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="ai-card">
      {card.rows.map((r, k) => (
        <div key={r.label}>
          <div className="ai-bar-top">
            <span>{r.label}</span>
            <b>{r.value}</b>
          </div>
          <div className="ai-bar">
            <i style={{ '--p': `${r.p}%`, '--c': r.c, '--k': k }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function BotMessage({ m, last, onTyped, onConfirm, onCancel, onAsk }) {
  const total = plainLength(m.text)
  const [n, setN] = useState(m.instant ? total : 0)
  const typed = n >= total
  const [armed, setArmed] = useState(false)

  // type the reply out a few characters at a time
  useEffect(() => {
    if (n >= total) return undefined
    const t = window.setTimeout(() => {
      const next = Math.min(total, n + 2 + Math.round(Math.random() * 2))
      setN(next)
      if (next >= total) onTyped(m)
    }, 16)
    return () => window.clearTimeout(t)
  }, [n, total, m, onTyped])

  return (
    <div className="msg bot">
      <span className="msg-dot">
        <BuddyArt size={26} mood={typed ? 'idle' : 'talk'} />
      </span>
      <div className="msg-col">
        <div className="bubble">
          <Rich text={m.text} limit={n} />
          {typed ? null : <i className="caret" />}
        </div>
        {typed && m.card ? <Card card={m.card} /> : null}
        {typed && m.confirm ? (
          <div className={`ai-confirm ${m.status ?? ''}`}>
            <p>
              <Icon name={m.status === 'done' ? 'check' : 'shield'} size={15} stroke={2} />
              {m.status === 'done' ? t('Completed') : m.status === 'cancelled' ? t('Cancelled') : m.confirm.note}
            </p>
            {m.status ? null : (
              <div>
                <button
                  type="button"
                  className={`btn solid ${armed ? 'armed' : ''}`}
                  onClick={() => {
                    // over the guard limit: the first tap only arms the button
                    if (m.confirm.guard && !armed) return setArmed(true)
                    onConfirm(m)
                  }}
                >
                  {armed ? t('Tap again to confirm') : m.confirm.label}
                </button>
                <button type="button" className="btn" onClick={() => onCancel(m)}>
                  {t('Cancel')}
                </button>
              </div>
            )}
          </div>
        ) : null}
        {typed && m.links?.length ? (
          <div className="ai-links">
            {m.links.map((l, k) => (
              <button key={l.label} type="button" className="go" style={{ '--k': k }} onClick={l.run}>
                {l.label}
                <Icon name="arrowRight" size={13} stroke={2} />
              </button>
            ))}
          </div>
        ) : null}
        {typed && last && m.chips?.length ? (
          <div className="ai-links">
            {m.chips.map((c, k) => (
              <button key={c.q} type="button" style={{ '--k': k + 1 }} onClick={() => onAsk(c.q, c.label)}>
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function Assistant({ open, onClose, prompt }) {
  const app = useApp()
  const appRef = useRef(app)
  const body = useRef(null)
  const list = useRef(null)
  const input = useRef(null)
  const avatar = useRef(null)
  const [msgs, setMsgs] = useState([])
  const [thinking, setThinking] = useState(false)
  const [mood, setMood] = useState('idle')
  const [hop, setHop] = useState(0)
  const [text, setText] = useState('')
  const [chat, setChat] = useState(0)
  // what Grace remembers within this conversation ("and last month?", "make it $80")
  const memory = useRef({})
  const [listening, setListening] = useState(false)
  const recognizer = useRef(null)
  // read every reply aloud (remembered per browser)
  const [spoken, setSpoken] = useState(() => {
    try {
      return localStorage.getItem('ww-grace-voice') === 'on'
    } catch {
      return false
    }
  })
  const toggleSpoken = () => {
    const next = !spoken
    setSpoken(next)
    if (!next) window.speechSynthesis?.cancel()
    try {
      localStorage.setItem('ww-grace-voice', next ? 'on' : 'off')
    } catch {
      /* not saved, still works for this visit */
    }
  }

  // warm the holiday cache so the greeting can warn about bills due on a bank holiday
  useEffect(() => {
    if (!open) return
    const year = (appRef.current.now ?? new Date()).getFullYear()
    const country = homeCountry()
    loadHolidays(country, year).catch(() => null)
    loadHolidays(country, year + 1).catch(() => null)
  }, [open])

  useEffect(() => {
    appRef.current = app
  })

  const cheer = useCallback(() => {
    setMood('happy')
    setHop((h) => h + 1)
    window.setTimeout(() => setMood('idle'), 2100)
  }, [])

  const pushBot = useCallback((r) => {
    setMsgs((list) => [...list, { id: uid(), from: 'bot', ...r }])
    setMood('talk')
  }, [])

  // say hello the first time the panel opens (and after a reset)
  useEffect(() => {
    if (!open) return undefined
    const focus = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 420)
    let hello = 0
    if (!msgs.length) {
      hello = window.setTimeout(
        () =>
          pushBot({
            text:
              t(
                'Hi {name}! 👋 I’m **{assistant}**, your {brand} money buddy. I can answer questions about your accounts and do things for you: send money, pay bills, top up goals, change the theme and more. What would you like to do?',
                { name: appRef.current.user.first, assistant: ASSISTANT.name, brand: BRAND.name },
              ) + (greetingAlerts(appRef.current) ? `\n${greetingAlerts(appRef.current)}` : ''),
            mood: 'happy',
            chips: starters().filter((c) => ['Give me a summary', 'What’s my balance?', 'Any bills due?'].includes(c.q)),
          }),
        520,
      )
    }
    return () => {
      window.clearTimeout(focus)
      window.clearTimeout(hello)
    }
    // msgs.length is read once per open / reset on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chat, pushBot])

  // keep the newest message in view while it types
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const b = body.current
      if (b) b.scrollTop = b.scrollHeight
    })
    ro.observe(list.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const key = (e) => e.key === 'Escape' && !document.querySelector('.modal-veil') && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open, onClose])

  /* the engine sees the live app, with theme switches spilling out of Grace's head */
  const brain = () => ({
    ...appRef.current,
    holidays: cachedHolidays(homeCountry(), (appRef.current.now ?? new Date()).getFullYear()),
    switchTheme: (next) => {
      const r = avatar.current?.getBoundingClientRect()
      appRef.current.switchTheme(next, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined)
    },
  })

  /* q goes to the engine; label (a translated chip) is what the bubble shows */
  const ask = (q, label = q, voice = false) => {
    const question = q.trim()
    if (!question || thinking) return
    setText('')
    const mine = uid()
    setMsgs((list) => [...list, { id: mine, from: 'me', text: maskDigits(label.trim()) }])
    setThinking(true)
    setMood('think')
    window.setTimeout(
      async () => {
        let r = respond(question, brain(), memory.current)
        memory.current = r.memory ?? {}
        // live answers (rates, crypto, holidays) arrive from the internet
        if (r.later) r = { ...(await r.later()), memory: r.memory }
        setThinking(false)
        if (voice || spoken) say(r.text)
        // something private was typed: don't keep it on screen
        if (r.mask) setMsgs((list) => list.map((x) => (x.id === mine ? { ...x, text: '••••••••' } : x)))
        pushBot({ ...r, request: r.mask ? '••••••••' : maskDigits(question) })
        if (r.run)
          window.setTimeout(() => {
            r.run()
            appRef.current.logActivity?.({
              request: maskDigits(question),
              action: gist(r.text),
              detail: '',
              reason: t('You asked “{request}”, so I did it straight away (it doesn’t move money).', { request: maskDigits(question) }),
            })
          }, 300)
      },
      520 + Math.min(700, question.length * 14),
    )
  }

  // a question sent from elsewhere on the page ("Ask Grace" on a card), asked once the hello is out
  const askRef = useRef(ask)
  useEffect(() => {
    askRef.current = ask
  })
  useEffect(() => {
    if (!prompt) return undefined
    const timer = window.setTimeout(() => askRef.current(prompt.q, t(prompt.label ?? prompt.q)), 1200)
    return () => window.clearTimeout(timer)
  }, [prompt])

  const onTyped = useCallback(
    (m) => {
      if (m.mood === 'happy') cheer()
      else setMood('idle')
    },
    [cheer],
  )

  const onConfirm = (m) => {
    m.confirm.run()
    const steps = m.confirm.steps ?? [m.confirm]
    for (const st of steps)
      app.logActivity?.({
        request: m.request ?? '',
        action: st.label,
        detail: st.note,
        reason: t('You asked “{request}”. I read that as: {action} ({detail}), and you confirmed it.', {
          request: m.request ?? '',
          action: st.label,
          detail: st.note,
        }),
      })
    setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, status: 'done' } : x)))
    const done = typeof m.confirm.done === 'function' ? m.confirm.done() : m.confirm.done
    window.setTimeout(() => pushBot({ text: done, mood: 'happy' }), 380)
  }
  const onCancel = (m) => {
    setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, status: 'cancelled' } : x)))
    window.setTimeout(() => pushBot({ text: t('No worries, cancelled. Anything else?') }), 300)
  }

  /* voice: the browser's own speech recognition, in the current language */
  const listen = () => {
    if (!Speech) return
    if (listening) {
      recognizer.current?.stop()
      return
    }
    const rec = new Speech()
    rec.lang = LOCALES[getLocale()]?.tag ?? 'en'
    rec.interimResults = true
    rec.onresult = (e) => {
      const said = [...e.results].map((x) => x[0].transcript).join(' ')
      setText(said)
      if (e.results[e.results.length - 1].isFinal) {
        rec.stop()
        ask(said, said, true) // asked out loud, so answer out loud
      }
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognizer.current = rec
    setListening(true)
    rec.start()
  }

  const reset = () => {
    memory.current = {}
    setMsgs([])
    setMood('idle')
    setChat((c) => c + 1)
  }

  const lastId = msgs[msgs.length - 1]?.id

  return (
    <aside
      className={`ai-panel ${open ? 'open' : ''}`}
      aria-label={t('{name} assistant', { name: ASSISTANT.name })}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <header className="ai-head">
        <div className="ai-avatar" ref={avatar}>
          <BuddyArt key={hop} size={70} mood={thinking ? 'think' : mood} className={hop && mood === 'happy' ? 'hop' : ''} />
        </div>
        <div className="ai-title">
          <strong>{ASSISTANT.name}</strong>
          <small>
            <i />
            {thinking ? t('Thinking…') : mood === 'talk' ? t('Typing…') : t('On guard · watching your {brand}', { brand: BRAND.name })}
          </small>
        </div>
        {canSpeak ? (
          <button
            type="button"
            className={`icon-btn ${spoken ? 'on' : ''}`}
            onClick={toggleSpoken}
            aria-pressed={spoken}
            aria-label={spoken ? t('Stop reading replies aloud') : t('Read replies aloud')}
            title={spoken ? t('Stop reading replies aloud') : t('Read replies aloud')}
          >
            <Icon name={spoken ? 'volume' : 'volumeOff'} size={17} stroke={2} />
          </button>
        ) : null}
        <button type="button" className="icon-btn" onClick={reset} aria-label={t('New chat')} title={t('New chat')}>
          <Icon name="refresh" size={17} stroke={2} />
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Close assistant')}>
          <Icon name="close" size={17} stroke={2} />
        </button>
      </header>

      <div className="ai-body" ref={body}>
        <div className="ai-list" ref={list}>
          {msgs.map((m) =>
            m.from === 'me' ? (
              <div key={m.id} className="msg me">
                <div className="msg-col">
                  <div className="bubble">{m.text}</div>
                </div>
              </div>
            ) : (
              <BotMessage key={m.id} m={m} last={m.id === lastId} onTyped={onTyped} onConfirm={onConfirm} onCancel={onCancel} onAsk={ask} />
            ),
          )}
          {thinking ? (
            <div className="msg bot">
              <span className="msg-dot">
                <BuddyArt size={26} mood="think" />
              </span>
              <div className="bubble typing" aria-label={t('{name} is typing', { name: ASSISTANT.name })}>
                <i />
                <i />
                <i />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="ai-foot">
        <div className="ai-chips">
          {starters(app.contacts).map((s) => (
            <button key={s.q} type="button" onClick={() => ask(s.q, s.label)}>
              {s.label}
            </button>
          ))}
        </div>
        <form
          className="ai-input"
          onSubmit={(e) => {
            e.preventDefault()
            ask(text)
          }}
        >
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('Ask {name} anything…', { name: ASSISTANT.name })}
            aria-label={t('Message {name}', { name: ASSISTANT.name })}
          />
          {Speech ? (
            <button
              type="button"
              className={`ai-mic ${listening ? 'on' : ''}`}
              onClick={listen}
              aria-label={listening ? t('Stop listening') : t('Speak to {name}', { name: ASSISTANT.name })}
              aria-pressed={listening}
              title={listening ? t('Stop listening') : t('Speak to {name}', { name: ASSISTANT.name })}
            >
              <Icon name="mic" size={18} />
            </button>
          ) : null}
          <button type="submit" className="ai-send" disabled={!text.trim() || thinking} aria-label={t('Send')}>
            <Icon name="arrowUp" size={18} stroke={2.4} />
          </button>
        </form>
        <p className="ai-hint">
          {t('Press')} <kbd>/</kbd> {t('to chat anytime · {name} can read and update this dashboard', { name: ASSISTANT.name })}
        </p>
      </footer>
    </aside>
  )
}
