/* ------------------------------------------------------------------
   Grace's speaking voice: a female voice in the current language.

   Browsers don't say which voices are female, so this goes by the names
   of the female voices that ship with Windows, macOS/iOS, Android and
   Chrome, skips the known male ones, and prefers the "Natural" / neural
   voices that sound most human. With no female voice for a language,
   the best other voice is used with a slightly higher pitch.
   ------------------------------------------------------------------ */

const FEMALE = new RegExp(
  [
    'female',
    'woman',
    // Windows / Edge
    'zira',
    'aria',
    'jenny',
    'michelle',
    'ana',
    'emma',
    'ava',
    'libby',
    'sonia',
    'maisie',
    'hazel',
    'susan',
    'natasha',
    'clara',
    'elvira',
    'helena',
    'laura',
    'irene',
    'dalia',
    'paloma',
    'salome',
    'denise',
    'julie',
    'hortense',
    'eloise',
    'vivienne',
    'brigitte',
    'sylvie',
    'katja',
    'hedda',
    'amala',
    'seraphina',
    'louisa',
    'elke',
    'hoda',
    'salma',
    'zariyah',
    'amany',
    'fatima',
    'laila',
    'mouna',
    'sana',
    'heera',
    'swara',
    'neerja',
    // Apple
    'samantha',
    'victoria',
    'karen',
    'moira',
    'tessa',
    'fiona',
    'serena',
    'allison',
    'susan',
    'kate',
    'nicky',
    'monica',
    'mónica',
    'paulina',
    'marisol',
    'amelie',
    'amélie',
    'audrey',
    'marie',
    'aurelie',
    'anna',
    'petra',
    'helena',
    'marlene',
    'vicki',
    'mariam',
    'lekha',
    'veena',
    // Amazon / others
    'joanna',
    'kendra',
    'kimberly',
    'salli',
    'amy',
    'lucia',
    'conchita',
    'celine',
    'léa',
    'lea',
    'vicky',
    'zeina',
  ].join('|'),
  'i',
)
const FEMALE_RE = new RegExp(`\\b(${FEMALE.source})\\b`, 'i')
// Chrome's own voices for these are female
const GOOGLE_FEMALE = /^google (us english|español|español de estados unidos|français|deutsch|italiano|हिन्दी)/i
const MALE =
  /\b(male|man|david|mark|george|james|richard|guy|ryan|daniel|thomas|paul|pablo|jorge|raul|raúl|alvaro|álvaro|henri|claude|stefan|conrad|killian|hamed|naayf|tarik|shakir|fred|alex|aaron|arthur|oliver|rishi|juan|diego|felix|yannick|markus|jacques|nicolas|reed|eddy|grandpa|rocko|ralph|albert|bruce|junior|ravi|hemant|prabhat|madhur|brian|joey|justin|matthew|russell|enrique|mathieu|hans|maged|xander)\b|google uk english male/i

export const isFemale = (v) => (FEMALE_RE.test(v.name) || GOOGLE_FEMALE.test(v.name)) && !MALE.test(v.name.replace(/female/i, ''))

/**
 * Pick Grace's voice for a BCP-47 tag like "en" or "es".
 * Returns { voice, pitch } (voice may be null when the browser has none).
 */
export function pickVoice(voices, tag = 'en') {
  const lang = tag.toLowerCase().split('-')[0]
  const local = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').split('-')[0] === lang)
  const score = (v) =>
    (isFemale(v) ? 100 : 0) +
    (/natural|neural|online|premium|enhanced/i.test(v.name) ? 10 : 0) +
    (/^(en-us|en-gb|es-es|fr-fr|de-de|ar-sa)$/i.test(v.lang?.replace('_', '-') ?? '') ? 3 : 0) +
    (v.localService ? 1 : 0) -
    (MALE.test(v.name) ? 50 : 0)
  const best = [...local].sort((a, b) => score(b) - score(a))[0] ?? null
  if (!best) return { voice: null, pitch: 1.15 }
  return { voice: best, pitch: isFemale(best) ? 1.05 : 1.2 }
}

/* voices load in the background in some browsers; keep the latest list */
let cache = []
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const load = () => {
    cache = window.speechSynthesis.getVoices()
  }
  load()
  window.speechSynthesis.addEventListener?.('voiceschanged', load)
}

/** Grace's voice for a language, from the voices this device has. */
export const graceVoice = (tag) => pickVoice(cache.length ? cache : (window.speechSynthesis?.getVoices() ?? []), tag)
