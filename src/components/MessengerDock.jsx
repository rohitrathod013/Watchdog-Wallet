/* ------------------------------------------------------------------
   Chats from any page: a floating button (with the unread count) that
   opens a small window with your friends and groups, and the same chat
   as the Friends page. Not shown on the Friends page itself.
   ------------------------------------------------------------------ */
import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Persona } from './Brand'
import { useApp } from '../lib/store'
import { t } from '../lib/i18n'
import { Chat, GroupAvatar } from '../pages/Friends'
import { preview } from '../lib/chatPreview'

const lastAt = (x) => x.last?.created_at ?? ''

export default function MessengerDock({ onOpenChange }) {
  const { social, go } = useApp()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(null) // 'f:<id>' or 'g:<id>'

  // friends and groups in one list, newest conversation first
  const threads = [
    ...social.groups.map((g) => ({ key: `g:${g.id}`, group: g, last: g.last, unread: g.unread ?? 0 })),
    ...social.friends.filter((f) => f.status === 'friend').map((f) => ({ key: `f:${f.id}`, friend: f, last: f.last, unread: f.unread ?? 0 })),
  ].sort((a, b) => lastAt(b).localeCompare(lastAt(a)))
  const current = threads.find((x) => x.key === picked)
  const peer = current ? (current.group ?? current.friend) : null
  const unread = threads.reduce((s, x) => s + x.unread, 0)

  // the open chat counts as read, and its new messages don't pop a notification
  const { setOpenChat } = social
  useEffect(() => {
    if (!open || !peer) return undefined
    setOpenChat(peer.id)
    return () => setOpenChat(null)
  }, [open, peer?.id, setOpenChat]) // eslint-disable-line react-hooks/exhaustive-deps

  // tell the app, so Grace steps aside while a chat is open
  useEffect(() => {
    onOpenChange?.(open)
    return () => onOpenChange?.(false)
  }, [open, onOpenChange])

  // Escape closes the window
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && !e.defaultPrevented && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!social.ready) return null

  return (
    <div className={`msgr ${open ? 'open' : ''}`}>
      {open ? (
        <div className="msgr-win" role="dialog" aria-label={peer ? peer.name : t('Chats')}>
          {peer ? (
            <Chat key={peer.id} peer={peer} docked onBack={() => setPicked(null)} onClose={() => setOpen(false)} />
          ) : (
            <section className="card msgr-list">
              <header className="msgr-head">
                <b>{t('Chats')}</b>
                <button type="button" className="ch-act" onClick={() => (setOpen(false), go('friends'))}>
                  {t('Open Friends')}
                </button>
                <button type="button" className="ch-act more" onClick={() => setOpen(false)} aria-label={t('Close chats')}>
                  <Icon name="close" size={17} />
                </button>
              </header>
              {threads.length ? (
                <ul>
                  {threads.map((x) => (
                    <li key={x.key}>
                      <button type="button" className="friend-row" onClick={() => setPicked(x.key)}>
                        {x.group ? <GroupAvatar group={x.group} /> : <Persona name={x.friend.name} hue={x.friend.hue} src={x.friend.avatar} size={42} />}
                        <div className="fr-main">
                          <b>{(x.group ?? x.friend).name}</b>
                          <small>{x.group && !x.last ? t('{count} people', { count: x.group.members.length }) : preview(x.last, social.me, social)}</small>
                        </div>
                        <div className="fr-side">{x.unread ? <em className="badge">{x.unread}</em> : null}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="msgr-empty">
                  <Icon name="users" size={26} />
                  <p>{t('No chats yet. Add a friend and you can message them from any page.')}</p>
                  <button type="button" className="btn solid" onClick={() => (setOpen(false), go('friends'))}>
                    {t('Add a friend')}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      ) : null}
      <button
        type="button"
        className="msgr-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unread ? t('Chats, {count} unread', { count: unread }) : t('Chats')}
      >
        <Icon name={open ? 'close' : 'chat'} size={24} />
        {unread && !open ? <em className="msgr-badge">{unread > 9 ? '9+' : unread}</em> : null}
      </button>
    </div>
  )
}
