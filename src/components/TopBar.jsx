import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { Avatar, Logo } from './Brand'
import { MenuItem, Popover, Segmented, Toggle } from './ui'
import { useApp } from '../lib/store'
import { LANGUAGES } from '../data/seed'
import { PAGES } from '../lib/routes'
import { BRAND } from '../config'
import { setLocale, t } from '../lib/i18n'

const ACCENTS = [
  { id: 'orange', color: '#ef6c2f' },
  { id: 'blue', color: '#3d6ef5' },
  { id: 'green', color: '#14a06a' },
  { id: 'violet', color: '#7c4fe0' },
  { id: 'rose', color: '#e5407a' },
]

export default function TopBar() {
  const app = useApp()
  const { page, go, user, notifications, setNotifications } = app
  const nav = useRef(null)
  const ind = useRef(null)
  const gear = useRef(null)
  const [open, setOpen] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const close = useCallback(() => {
    setOpen(null)
    setConfirmClear(false)
  }, [])
  const toggle = (k) => setOpen((o) => (o === k ? null : k))

  useLayoutEffect(() => {
    const place = () => {
      const btn = nav.current?.querySelector(`[data-page="${page}"]`)
      const el = ind.current
      if (!btn || !el) return
      el.style.width = `${btn.offsetWidth}px`
      el.style.transform = `translateX(${btn.offsetLeft}px)`
      const n = nav.current
      if (n.scrollWidth > n.clientWidth) n.scrollTo({ left: btn.offsetLeft - 24, behavior: 'smooth' })
    }
    place()
    // the active pill grows when its icon slides in, so watch every pill
    const ro = new ResizeObserver(place)
    ro.observe(nav.current)
    nav.current.querySelectorAll('button').forEach((b) => ro.observe(b))
    return () => ro.disconnect()
  }, [page])

  const unread = notifications.filter((n) => n.unread).length

  const themeFromGear = (next) => {
    const r = gear.current?.getBoundingClientRect()
    app.switchTheme(next, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined)
  }

  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={() => go('dashboard')} aria-label={t('{name} home', { name: BRAND.name })}>
        <Logo />
        <span className="brand-name">{BRAND.name}</span>
      </button>

      <nav className="nav" ref={nav} aria-label={t('Primary')}>
        <span className="nav-ind" ref={ind} />
        {PAGES.map((p, i) => (
          <button
            key={p.id}
            type="button"
            data-page={p.id}
            className={page === p.id ? 'on' : ''}
            style={{ '--i': i }}
            onClick={() => go(p.id)}
            aria-current={page === p.id ? 'page' : undefined}
          >
            <span className="nav-label">
              <span className="nav-ic">
                <Icon name={p.icon} size={20} stroke={1.8} />
              </span>
              {t(p.label)}
              {p.id === 'friends' && app.social?.unread ? (
                <em className="nav-badge" aria-label={t('{count} new', { count: app.social.unread })}>
                  {app.social.unread > 9 ? '9+' : app.social.unread}
                </em>
              ) : null}
            </span>
          </button>
        ))}
      </nav>

      <div className="tools">
        {/* notifications */}
        <div className="anchor">
          <button
            type="button"
            className={`tool ${open === 'bell' ? 'on' : ''}`}
            style={{ '--i': 0 }}
            onClick={() => toggle('bell')}
            aria-label={t('Notifications')}
          >
            <Icon name="bell" size={22} />
            {unread ? <i className="bell-dot" /> : null}
          </button>
          <Popover open={open === 'bell'} onClose={close} className="notif-pop">
            <div className="pop-head">
              <strong>{t('Notifications')}</strong>
              <button
                type="button"
                className="link"
                disabled={!unread}
                onClick={() => setNotifications((n) => n.map((x) => ({ ...x, unread: false })))}
              >
                {t('Mark all as read')}
              </button>
            </div>
            {notifications.slice(0, 6).map((n, i) => (
              <button
                key={n.id}
                type="button"
                className={`notif ${n.unread ? 'unread' : ''}`}
                style={{ '--i': i }}
                onClick={() => setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, unread: false } : x)))}
              >
                <span className={`notif-ic ${n.tone}`}>
                  <Icon name={n.icon} size={16} stroke={2} />
                </span>
                <span className="notif-txt">
                  <strong>{t(n.title, n.vars)}</strong>
                  <small>{t(n.body, n.vars)}</small>
                </span>
                <em>{t(n.time)}</em>
              </button>
            ))}
            <button
              type="button"
              className="pop-foot"
              onClick={() => {
                close()
                go('dashboard', { tab: 'transactions' })
              }}
            >
              {t('View all activity')} <Icon name="arrowRight" size={15} />
            </button>
          </Popover>
        </div>

        {/* settings */}
        <div className="anchor">
          <button
            type="button"
            ref={gear}
            className={`tool gear ${open === 'gear' ? 'on' : ''}`}
            style={{ '--i': 1 }}
            onClick={() => toggle('gear')}
            aria-label={t('Settings')}
          >
            <Icon name="gear" size={22} />
          </button>
          <Popover open={open === 'gear'} onClose={close} className="set-pop">
            <h6>{t('Appearance')}</h6>
            <Segmented
              items={[
                { key: 'auto', label: t('Auto') },
                { key: 'light', label: t('Light') },
                { key: 'dark', label: t('Dark') },
              ]}
              value={app.themeMode ?? app.theme}
              onChange={themeFromGear}
            />
            {app.themeMode === 'auto' ? <p className="set-note">{t('Light in the day, dark from 7pm to 7am.')}</p> : null}
            <div className="set-gap" />
            <h6>{t('Accent')}</h6>
            <div className="swatches">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`swatch ${app.accent === a.id ? 'on' : ''}`}
                  style={{ background: a.color }}
                  onClick={() => app.setAccent(a.id)}
                  aria-label={t('{color} accent', { color: t(a.id) })}
                  aria-pressed={app.accent === a.id}
                />
              ))}
            </div>
            <h6>{t('Motion')}</h6>
            <div className="set-row">
              <span>{t('Live updates')}</span>
              <Toggle on={app.live} onChange={app.setLive} label={t('Live updates')} />
            </div>
            <div className="set-row">
              <span>{t('Reduce motion')}</span>
              <Toggle on={app.reduceMotion} onChange={app.setReduceMotion} label={t('Reduce motion')} />
            </div>
            <hr />
            <MenuItem
              icon="replay"
              onClick={() => {
                close()
                app.replayIntro()
              }}
            >
              {t('Replay intro animation')}
            </MenuItem>
          </Popover>
        </div>

        {/* language */}
        <div className="anchor">
          <button
            type="button"
            className={`tool lang ${open === 'lang' ? 'on' : ''}`}
            style={{ '--i': 2 }}
            onClick={() => toggle('lang')}
            aria-label={t('Language')}
          >
            {app.lang}
          </button>
          <Popover open={open === 'lang'} onClose={close} className="opt-pop">
            {LANGUAGES.map((l, i) => (
              <MenuItem
                key={l.code}
                i={i}
                on={app.lang === l.code}
                onClick={() => {
                  close()
                  if (l.code === app.lang) return
                  setLocale(l.code)
                  app.setLang(l.code)
                  app.toast(t('Language set to {name}', { name: l.name }), t('{brand} now shows in {name}.', { brand: BRAND.name, name: l.name }), {
                    icon: 'globe',
                  })
                }}
              >
                {l.name}
              </MenuItem>
            ))}
          </Popover>
        </div>

        {/* account */}
        <div className="anchor">
          <button type="button" className={`avatar-btn ${open === 'user' ? 'on' : ''}`} onClick={() => toggle('user')} aria-label={t('Account menu')}>
            <Avatar user={user} />
          </button>
          <Popover open={open === 'user'} onClose={close} className="user-pop">
            <div className="user-card">
              <Avatar size={44} user={user} />
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
            </div>
            <MenuItem icon="wallet" i={0} onClick={() => (close(), go('wallet'))}>
              {t('My wallet')}
            </MenuItem>
            <MenuItem icon="chart" i={1} onClick={() => (close(), go('analytics'))}>
              {t('Analytics')}
            </MenuItem>
            <MenuItem icon="replay" i={2} onClick={() => (close(), app.replayIntro())}>
              {t('Replay intro animation')}
            </MenuItem>
            <MenuItem icon="edit" i={2.4} onClick={() => (close(), app.openModal('profile'))}>
              {t('Your profile')}
            </MenuItem>
            <MenuItem icon="gear" i={2.6} onClick={() => (close(), app.openModal('account'))}>
              {t('Account settings')}
            </MenuItem>
            <MenuItem icon="shield" i={3} onClick={() => (close(), app.openModal('guard'))}>
              {t('Grace’s guard')}
            </MenuItem>
            <MenuItem icon="clock" i={3.5} onClick={() => (close(), app.openModal('activity'))}>
              {t('Grace’s activity')}
            </MenuItem>
            <MenuItem icon="lock" i={3.7} onClick={() => (close(), app.lockNow('manual'))}>
              {t('Lock now')}
            </MenuItem>
            <hr />
            {app.demo ? null : (
              <MenuItem
                icon="trash"
                tone={confirmClear ? 'danger confirm' : 'danger'}
                i={3}
                onClick={() => {
                  if (!confirmClear) return setConfirmClear(true)
                  close()
                  app.clearData()
                }}
              >
                {confirmClear ? t('Click again to delete everything') : t('Clear my data')}
              </MenuItem>
            )}
            <MenuItem icon="logout" tone="danger" i={4} onClick={() => (close(), app.signOut())}>
              {app.accounts && app.demo ? t('Leave demo') : t('Log out')}
            </MenuItem>
          </Popover>
        </div>
      </div>
    </header>
  )
}
