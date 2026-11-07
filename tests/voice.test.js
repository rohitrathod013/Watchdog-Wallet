/* Grace's voice: always a female voice in the current language when the device has one. */
import { describe, expect, it } from 'vitest'
import { isFemale, pickVoice } from '../src/lib/voice'

const v = (name, lang, localService = true) => ({ name, lang, localService })
const WINDOWS = [
  v('Microsoft David - English (United States)', 'en-US'),
  v('Microsoft Mark - English (United States)', 'en-US'),
  v('Microsoft Zira - English (United States)', 'en-US'),
  v('Microsoft Pablo - Spanish (Spain)', 'es-ES'),
  v('Microsoft Helena - Spanish (Spain)', 'es-ES'),
  v('Microsoft Hortense - French (France)', 'fr-FR'),
  v('Microsoft Paul - French (France)', 'fr-FR'),
  v('Microsoft Hedda - German (Germany)', 'de-DE'),
  v('Microsoft Stefan - German (Germany)', 'de-DE'),
  v('Microsoft Naayf - Arabic (Saudi Arabia)', 'ar-SA'),
  v('Microsoft Hoda - Arabic (Egypt)', 'ar-EG'),
]
const EDGE = [
  ...WINDOWS,
  v('Microsoft Guy Online (Natural) - English (United States)', 'en-US', false),
  v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
]
const CHROME = [
  v('Google US English', 'en-US', false),
  v('Google UK English Male', 'en-GB', false),
  v('Google UK English Female', 'en-GB', false),
  v('Google español', 'es-ES', false),
  v('Google français', 'fr-FR', false),
  v('Google Deutsch', 'de-DE', false),
]
const MAC = [
  v('Alex', 'en-US'),
  v('Daniel', 'en-GB'),
  v('Samantha', 'en-US'),
  v('Thomas', 'fr-FR'),
  v('Amélie', 'fr-CA'),
  v('Jorge', 'es-ES'),
  v('Mónica', 'es-ES'),
  v('Anna', 'de-DE'),
  v('Maged', 'ar-SA'),
]

describe('Grace’s voice', () => {
  const cases = [
    ['Windows English', WINDOWS, 'en', /Zira/],
    ['Windows Spanish', WINDOWS, 'es', /Helena/],
    ['Windows French', WINDOWS, 'fr', /Hortense/],
    ['Windows German', WINDOWS, 'de', /Hedda/],
    ['Windows Arabic', WINDOWS, 'ar', /Hoda/],
    ['Edge prefers the natural female voice', EDGE, 'en', /Aria Online \(Natural\)/],
    ['Chrome English', CHROME, 'en', /^Google US English$/],
    ['Chrome Spanish', CHROME, 'es', /Google español/],
    ['Mac English', MAC, 'en', /Samantha/],
    ['Mac French', MAC, 'fr', /Amélie/],
    ['Mac Spanish', MAC, 'es', /Mónica/],
    ['Mac German', MAC, 'de', /Anna/],
  ]
  for (const [label, voices, tag, want] of cases)
    it(label, () => {
      const { voice, pitch } = pickVoice(voices, tag)
      expect(voice.name).toMatch(want)
      expect(isFemale(voice)).toBe(true)
      expect(pitch).toBeCloseTo(1.05)
    })

  it('never picks a male voice when a female one exists', () => {
    for (const voices of [WINDOWS, EDGE, CHROME, MAC])
      for (const tag of ['en', 'es', 'fr', 'de']) expect(isFemale(pickVoice(voices, tag).voice)).toBe(true)
  })
  it('raises the pitch when the only voice is male', () => {
    const { voice, pitch } = pickVoice(MAC, 'ar')
    expect(voice.name).toBe('Maged')
    expect(pitch).toBeGreaterThan(1.1)
  })
  it('copes with no voices at all', () => {
    expect(pickVoice([], 'en').voice).toBeNull()
  })
  it('does not read "female" as male', () => {
    expect(isFemale(v('Google UK English Female', 'en-GB'))).toBe(true)
    expect(isFemale(v('Google UK English Male', 'en-GB'))).toBe(false)
  })
})
