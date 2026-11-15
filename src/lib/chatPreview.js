/* One line about a chat's latest message, for chat lists (Friends page and the chat window on other pages). */
import { mediaLabel, systemText } from './social'
import { money } from './format'
import { t } from './i18n'

export function preview(m, me, social) {
  if (!m) return t('Say hello 👋')
  const mine = m.sender === me
  const who = mine ? `${t('You')}: ` : m.group_id ? `${social.nameOf(m.sender).split(' ')[0]}: ` : ''
  if (m.kind === 'system') return systemText(m, me, social.nameOf)
  if (m.kind === 'text') return `${who}${m.body}`
  if (m.kind === 'media') return `${who}${m.body || mediaLabel(m.media)}`
  if (m.group_id && m.kind === 'split') return `${who}${t('Split “{title}”', { title: m.body })}`
  if (m.group_id && m.kind === 'payment') return `${who}${t('paid their share')}`
  if (m.kind === 'payment') {
    const x = social.transfers.get(m.ref)
    const amount = money(Number(x?.amount ?? 0))
    return mine ? t('You sent {amount}', { amount }) : t('Sent you {amount}', { amount })
  }
  const r = social.requests.get(m.ref)
  const amount = money(Number(r?.amount ?? 0))
  if (m.kind === 'split')
    return mine ? t('You split “{title}”', { title: m.body }) : t('Split “{title}”: your share is {amount}', { title: m.body, amount })
  return mine ? t('You asked for {amount}', { amount }) : t('Asked you for {amount}', { amount })
}
