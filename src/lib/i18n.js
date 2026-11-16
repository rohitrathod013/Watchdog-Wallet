/* ------------------------------------------------------------------
   Tiny translation layer.

   t('Total Balance')                      → "Saldo total" (in Spanish)
   t('Send {amount} to {name}', { … })     → fills the {placeholders}

   The English sentence is the key, so anything without a translation
   simply shows in English. Dictionaries live in src/i18n/<code>.js and
   each one is downloaded only when that language is picked (loadLocale).
   ------------------------------------------------------------------ */
const LOADERS = {
  ES: () => import('../i18n/es'),
  FR: () => import('../i18n/fr'),
  DE: () => import('../i18n/de'),
  AR: () => import('../i18n/ar'),
  PT: () => import('../i18n/pt'),
  HI: () => import('../i18n/hi'),
}
const DICTS = {}

/** Download a language's dictionary (once). Resolves when t() can use it; English needs none. */
export async function loadLocale(code) {
  if (!LOADERS[code] || DICTS[code]) return
  try {
    DICTS[code] = (await LOADERS[code]()).default
  } catch {
    /* offline and not cached: that language shows in English for now */
  }
}

/** BCP-47 tag and text direction for each language code in the picker. */
export const LOCALES = {
  EN: { tag: 'en', dir: 'ltr' },
  ES: { tag: 'es', dir: 'ltr' },
  FR: { tag: 'fr', dir: 'ltr' },
  DE: { tag: 'de', dir: 'ltr' },
  AR: { tag: 'ar', dir: 'rtl' },
  PT: { tag: 'pt-BR', dir: 'ltr' },
  HI: { tag: 'hi-IN', dir: 'ltr' },
}

let current = 'EN'

export const setLocale = (code) => {
  current = LOCALES[code] ? code : 'EN'
}

export const getLocale = () => current

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m) : s)

export function t(key, vars) {
  if (key == null || key === '') return key
  const hit = DICTS[current]?.[key]
  return fill(hit ?? key, vars)
}

/* Names that are built from a template when they are created
   ("Transfer to Maya Chen") are stored in English and translated on display. */
const NAME_PATTERNS = [
  [/^Transfer to (.+)$/, 'Transfer to {name}'],
  [/^Request from (.+)$/, 'Request from {name}'],
  [/^Payment from (.+)$/, 'Payment from {name}'],
]

const MONTH_WORDS =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g

/** "Jun 2027", "Nov 4", "July 2025" → month names in the current language. */
export const tMonths = (s) => (s && current !== 'EN' ? s.replace(MONTH_WORDS, (m) => t(m)) : s)

export function tName(name) {
  if (!name) return name
  const direct = DICTS[current]?.[name]
  if (direct) return direct
  for (const [re, key] of NAME_PATTERNS) {
    const m = name.match(re)
    if (m) return t(key, { name: m[1] })
  }
  return name
}
