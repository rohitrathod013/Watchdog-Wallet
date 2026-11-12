/* Adding friends from the phone's contacts: only usable emails and numbers are kept. */
import { describe, expect, it } from 'vitest'
import { cleanContacts, inviteHref } from '../src/lib/contacts'

describe('cleanContacts', () => {
  it('keeps valid emails and numbers, lower-cased and without repeats', () => {
    const out = cleanContacts([
      { name: ['Sam Lee'], email: ['Sam@Example.com', 'sam@example.com', 'not-an-email'], tel: ['+1 (555) 010-2000', '12'] },
      { name: [], email: ['ana@mail.co'], tel: [] },
      { name: ['Nobody'], email: [], tel: [] },
    ])
    expect(out).toEqual([
      { name: 'Sam Lee', emails: ['sam@example.com'], phones: ['+15550102000'] },
      { name: 'ana', emails: ['ana@mail.co'], phones: [] },
    ])
  })
  it('copes with nothing picked', () => {
    expect(cleanContacts(undefined)).toEqual([])
    expect(cleanContacts([])).toEqual([])
  })
})

describe('inviteHref', () => {
  const url = 'https://example.com/#/friends/invite/abc'
  it('texts a phone number first, else emails', () => {
    expect(inviteHref({ phones: ['+15550102000'], emails: ['a@b.co'] }, url, 'Join me')).toBe(
      `sms:+15550102000?&body=${encodeURIComponent(`Join me ${url}`)}`,
    )
    expect(inviteHref({ phones: [], emails: ['a@b.co'] }, url, 'Join me')).toMatch(/^mailto:a@b\.co\?body=/)
    expect(inviteHref({ phones: [], emails: [] }, url, 'Join me')).toBeNull()
  })
})
