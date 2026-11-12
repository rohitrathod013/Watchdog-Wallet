/* ------------------------------------------------------------------
   Watchdog scam shield: scores a pasted message, email, link, invoice
   or payee with plain rules, and says why. Pure functions, no network:
   links are only read as text, never opened or fetched.

   Weights (0-100: how strongly one signal on its own suggests a scam)
     45  unusual payment     gift cards, crypto, wire, Western Union, "send me the codes"
     45  credentials         asks for a password, PIN, one-time code, SSN or card number
     45  remote access       AnyDesk, TeamViewer, "install this app"
     45  lookalike link      paypa1.com, amazon-billing.net, paypal.com.login.xyz
     45  bank change         "our bank details have changed", pay a new account
     40  lookalike contact   payee name a letter or two off one of your contacts
     35  secrecy             "don't tell anyone", "keep this between us"
     35  prize               won, lottery, giveaway, double your money, guaranteed returns
     35  ip link / punycode  http://185.23.4.1/..., xn--pypal-4ve.com
     35  link mismatch       the text shows one site, the link goes to another
     30  impersonation       bank, IRS, Amazon, a courier, tech support, "Mum, it's me" (10 alone)
     25  urgency             act now, within 24 hours, account suspended, final notice
     25  fee to release      customs, redelivery or release fee
     25  unusual amount      over 3× your usual payment (or usual for this payee)
     25  bill jump           a bill more than 20% above the last one
     15  short link          bit.ly, tinyurl...
     15  new payee           you've never paid them
     15  over guard limit    at or above your large-payment limit
     15  zelle               asked to pay by Zelle (fine with people you know)
     10  odd domain ending   .xyz, .top, .click...
      5  writing tells       "dear customer", "kindly", lots of CAPITALS or !!!

   Combining, with diminishing returns: each signal counts once (its
   strongest match), then score = 100 × (1 − Π(1 − w/100)). So one
   45 is "medium" (45), 45 + 35 is "high" (64), and a pile of weak
   signals creeps up slowly. Writing tells are capped at 8 points and
   never count on their own; an impersonation on its own counts 10.
   Levels: low < 30 ≤ medium < 60 ≤ high.
   ------------------------------------------------------------------ */
import { t } from './i18n'

export const LEVELS = { medium: 30, high: 60 }

/* ---------------- signals found in the text ---------------- */
const TEXT_SIGNALS = [
  {
    code: 'payment',
    weight: 45,
    label: 'Asks for an unusual way to pay',
    res: [
      /\b(?:buy|get|purchase|send|pay (?:with|in|by|using))\b[^.!?\n]{0,40}\b(?:gift ?cards?|itunes cards?|google play cards?|steam cards?|apple cards?|vouchers?)\b/i,
      /\bgift ?cards?\b/i,
      /\b(?:send|give|text|share)\b[^.!?\n]{0,25}\b(?:the )?(?:card )?codes?\b[^.!?\n]{0,25}\b(?:on the back|from the cards?|scratch)/i,
      /\bscratch (?:off|the back)\b/i,
      /\b(?:bitcoin|btc|ethereum|usdt|tether|crypto(?:currency)?)\b[^.!?\n]{0,30}\b(?:wallet|address|send|pay|transfer|deposit)\b/i,
      /\b(?:send|pay|transfer|deposit)\b[^.!?\n]{0,30}\b(?:bitcoin|btc|ethereum|usdt|tether|crypto(?:currency)?)\b/i,
      /\b(?:western union|moneygram|wire transfer|wire the money|bank wire)\b/i,
      /\btarjetas? de regalo\b/i,
      /بطاقات? (?:هدايا|هدية)/,
      /\bgift ?card (?:bhej|le ?a|khareed)/i,
    ],
  },
  {
    code: 'credentials',
    weight: 45,
    label: 'Asks for passwords, PINs or codes',
    res: [
      /\b(?:send|share|confirm|verify|enter|provide|give|reply with|tell (?:me|us)|read (?:me|out))\b[^.!?\n]{0,40}\b(?:password|passcode|pin|one[- ]time (?:code|password|pin)|otp|verification code|security code|login (?:code|details)|social security(?: number)?|ssn|card number|cvv|cvc|bank login)\b/i,
      /\b(?:password|pin|otp|ssn|cvv|card number|verification code)\b[^.!?\n]{0,20}\b(?:to (?:verify|confirm|unlock|keep)|so (?:we|i) can)\b/i,
      /\b(?:send|forward|tell|give|read)(?: it)? (?:me|us) (?:the|that|your|this) (?:\d-digit |six-digit |verification |security )?code\b/i,
      /\bcode (?:you|u) (?:just )?(?:received|got)\b/i,
      /\b(?:comparta|envíe|envie|dime)\b[^.!?\n]{0,30}\b(?:contraseña|código|pin)\b/i,
    ],
    // "Don't share this code with anyone" is the real bank talking
    unless: /\b(?:don'?t|do not|never|won'?t|will never|we'll never|we will never|no (?:one|staff))\b[^.!?\n]{0,25}$/i,
  },
  {
    code: 'remote',
    weight: 45,
    label: 'Wants remote access to your device',
    res: [
      /\b(?:anydesk|teamviewer|rustdesk|ultraviewer|quick ?assist|logmein|supremo|screenconnect)\b/i,
      /\b(?:install|download)\b[^.!?\n]{0,25}\b(?:this|the|our|an?)\b[^.!?\n]{0,15}\b(?:app|apk|software|program|tool)\b[^.!?\n]{0,30}\b(?:so (?:we|i) can|to (?:fix|secure|protect|access|refund|verify))/i,
      /\b(?:remote access|screen ?share|share your screen)\b/i,
    ],
  },
  {
    code: 'bankChange',
    weight: 45,
    label: 'Says the bank details have changed',
    res: [
      /\b(?:new|updated|changed|different)\b[^.!?\n]{0,15}\b(?:bank|account|payment|banking|remittance) (?:details|information|info|account)\b/i,
      /\b(?:our|my|the) (?:bank(?:ing)?|account|payment) (?:details|information|account)\b[^.!?\n]{0,20}\b(?:have|has) (?:changed|been updated)\b/i,
      /\b(?:please|kindly) (?:pay|transfer|send)\b[^.!?\n]{0,30}\b(?:to|into) (?:this|the following|our new|the new|a new|my new)\b[^.!?\n]{0,10}\baccount\b/i,
      /\b(?:do not|don'?t) (?:pay|use) (?:the|our) (?:old|previous|usual) (?:account|details)\b/i,
      /\bpay\b[^.!?\n]{0,20}\b(?:to|into) (?:our|the|a|my) new (?:bank )?account\b/i,
    ],
  },
  {
    code: 'secrecy',
    weight: 35,
    label: 'Asks you to keep it secret',
    res: [
      /\b(?:don'?t|do not|never) (?:tell|mention (?:this |it )?to|inform|say anything to|let)\b[^.!?\n]{0,20}\b(?:anyone|anybody|your (?:bank|family|wife|husband|parents|mum|mom|dad)|the bank|dad|mum|mom|police|no ?one)\b/i,
      /\bkeep (?:this|it|that)\b[^.!?\n]{0,15}\b(?:secret|between us|between you and me|to yourself|private|confidential|quiet)\b/i,
      /\b(?:this is|it's) (?:strictly )?(?:confidential|a secret)\b/i,
      /\bno se lo (?:digas|diga) a nadie\b/i,
      /لا تخبر أحد/,
      /\b(?:kisi ko|kisi se) (?:mat|na) (?:batana|bolna|kehna)\b/i,
    ],
  },
  {
    code: 'prize',
    weight: 35,
    label: 'Promises a prize or easy money',
    res: [
      /\byou(?:'ve| have)? (?:won|been selected|been chosen)\b/i,
      /\b(?:claim|collect) your (?:prize|reward|winnings|gift|refund)\b/i,
      /\b(?:lottery|jackpot|sweepstakes|giveaway|inheritance)\b/i,
      /\b(?:double|triple) (?:your|my) (?:money|crypto|bitcoin|investment)\b/i,
      /\bguaranteed (?:returns?|profits?|income)\b/i,
      /\b(?:send|deposit) \S+ (?:and|to) (?:get|receive) \S+ back\b/i,
    ],
  },
  {
    code: 'urgency',
    weight: 25,
    label: 'Pressures you to act fast',
    res: [
      /\b(?:act|respond|reply|pay|verify|call|send|transfer|wire)\b[^.!?\n]{0,20}\b(?:now|immediately|right away|today|asap|urgently)\b/i,
      /\bwithin (?:the next )?\d{1,2} ?(?:hours?|hrs?|minutes?|mins?)\b/i,
      /\b(?:account|card|access|service)\b[^.!?\n]{0,25}\b(?:suspended|locked|blocked|closed|deactivated|frozen|disabled|on hold)\b/i,
      /\b(?:final|last) (?:notice|warning|reminder|chance)\b/i,
      /\b(?:urgent(?:ly)?|immediately|expires? (?:today|tonight|soon))\b/i,
      /\b(?:or|otherwise) (?:you will|you'll|we will|we'll) (?:be )?(?:arrested|charged|fined|sued|lose)\b/i,
      /\burgente\b|\bcuenta (?:suspendida|bloqueada)\b/i,
      /عاجل|حسابك (?:معلق|موقوف)/,
      /\bjaldi (?:karo|bhejo|se)\b/i,
    ],
  },
  {
    code: 'fee',
    weight: 25,
    label: 'Asks for a small fee to release something',
    res: [
      /\b(?:customs|release|redelivery|re-delivery|delivery|shipping|processing|clearance|unlock|activation|tax) (?:fee|charge|payment)\b/i,
      /\bpay (?:a )?(?:small )?(?:fee|\$\s?\d+(?:\.\d\d)?)\b[^.!?\n]{0,30}\b(?:to (?:release|receive|reschedule|unlock|claim)|for (?:redelivery|delivery))\b/i,
    ],
  },
  {
    code: 'impersonation',
    weight: 30,
    label: 'Claims to be a company, an authority or family',
    res: [
      /\b(?:this is|we are|i am|i'm|from|calling from|message from|on behalf of)\b[^.!?\n]{0,10}\b(?:your bank|the bank|irs|hmrc|the tax (?:office|department)|social security|police|fbi|amazon|paypal|apple|microsoft|google|netflix|usps|fedex|dhl|ups|royal mail|tech support|customer support|fraud (?:team|department)|security (?:team|department))\b/i,
      /^\s*(?:usps|fedex|dhl|ups|royal mail|amazon|paypal|irs|hmrc|netflix|apple|chase|wells fargo|bank of america)\s*[:|-]/i,
      /\b(?:hi|hey|hello) (?:mum|mom|mam|dad|ma|pa)\b[^.!?\n]{0,40}\b(?:it'?s me|new number|lost my phone|broke my phone)\b/i,
      /\b(?:this is my new number|i lost my phone|my phone (?:broke|is broken)|i'?m in (?:trouble|jail|hospital)|i need (?:money|help) (?:urgently|fast|now))\b/i,
    ],
  },
  {
    code: 'zelle',
    weight: 15,
    label: 'Asks for Zelle or a cash app',
    res: [/\b(?:zelle|cash ?app|venmo|paysend)\b[^.!?\n]{0,30}\b(?:immediately|now|urgently|to (?:this|the following)|refund|verify)\b/i],
  },
  {
    code: 'writing',
    weight: 5,
    label: 'Odd writing, like mass messages',
    res: [/\bdear (?:customer|user|client|valued customer|account holder|sir\/madam)\b/i, /\bkindly\b/i, /!{3,}/, /\b(?:[A-Z]{4,}\s+){3,}/],
  },
]

/* ---------------- links: read as text only, never opened ---------------- */
// 50 well-known names people impersonate, with the domains that really are theirs
const BRANDS = {
  paypal: ['paypal.com', 'paypal.me'],
  amazon: ['amazon.com', 'amazon.co.uk', 'amazon.in', 'amazon.de', 'amazon.ca', 'amazon.es', 'amazon.fr'],
  apple: ['apple.com', 'icloud.com'],
  icloud: ['icloud.com'],
  microsoft: ['microsoft.com', 'live.com', 'outlook.com', 'office.com'],
  google: ['google.com', 'gmail.com', 'youtube.com'],
  netflix: ['netflix.com'],
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com'],
  whatsapp: ['whatsapp.com', 'wa.me'],
  chase: ['chase.com'],
  wellsfargo: ['wellsfargo.com'],
  bankofamerica: ['bankofamerica.com', 'bofa.com'],
  citibank: ['citibank.com', 'citi.com'],
  capitalone: ['capitalone.com'],
  americanexpress: ['americanexpress.com', 'amex.com'],
  discover: ['discover.com'],
  hsbc: ['hsbc.com', 'hsbc.co.uk'],
  barclays: ['barclays.co.uk', 'barclays.com'],
  lloyds: ['lloydsbank.com'],
  santander: ['santander.com', 'santander.co.uk'],
  revolut: ['revolut.com'],
  monzo: ['monzo.com'],
  wise: ['wise.com'],
  venmo: ['venmo.com'],
  zelle: ['zellepay.com'],
  cashapp: ['cash.app'],
  coinbase: ['coinbase.com'],
  binance: ['binance.com'],
  kraken: ['kraken.com'],
  metamask: ['metamask.io'],
  stripe: ['stripe.com'],
  visa: ['visa.com'],
  mastercard: ['mastercard.com'],
  usps: ['usps.com'],
  fedex: ['fedex.com'],
  dhl: ['dhl.com'],
  ups: ['ups.com'],
  royalmail: ['royalmail.com'],
  irs: ['irs.gov'],
  hmrc: ['gov.uk'],
  ebay: ['ebay.com'],
  walmart: ['walmart.com'],
  target: ['target.com'],
  costco: ['costco.com'],
  bestbuy: ['bestbuy.com'],
  dropbox: ['dropbox.com'],
  docusign: ['docusign.com', 'docusign.net'],
  linkedin: ['linkedin.com'],
  steam: ['steampowered.com', 'steamcommunity.com'],
  spotify: ['spotify.com'],
  adobe: ['adobe.com'],
}
const SHORTENERS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'cutt.ly',
  'rb.gy',
  'shorturl.at',
  'tiny.cc',
  'buff.ly',
  't.ly',
  'rebrand.ly',
  's.id',
]
const ODD_TLDS = [
  'xyz',
  'top',
  'click',
  'link',
  'zip',
  'mov',
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
  'buzz',
  'rest',
  'cam',
  'support',
  'icu',
  'live',
  'online',
  'site',
  'loan',
  'work',
]
const TLDS =
  'com|net|org|io|co|uk|us|info|biz|xyz|top|click|link|app|me|ru|cn|tk|ml|ga|cf|gq|online|site|shop|store|live|support|help|ly|gl|gd|at|in|pk|de|fr|es|it|nl|ca|au|gov|edu|zip|mov|buzz|rest|cam|icu|loan|work|io|ai|cc|ws'

/** The links in some text: full URLs, www. ones and bare domains, plus "shown text → real target" pairs. */
export function findLinks(text) {
  const out = []
  const seen = new Set()
  const add = (url, shown = null) => {
    const raw = url.replace(/[).,;:!?'"\]]+$/, '')
    const key = `${raw}|${shown ?? ''}`
    if (!raw || seen.has(key)) return
    seen.add(key)
    const host = hostOf(raw)
    if (host) out.push({ raw, host, shown })
  }
  // markdown [shown](target) and <a href="target">shown</a>
  for (const m of text.matchAll(/\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/gi)) add(m[2], m[1])
  for (const m of text.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([^<]{1,120})<\/a>/gi)) add(m[1], m[2])
  for (const m of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi)) add(m[0])
  for (const m of text.matchAll(new RegExp(`(?<![@\\w.-])(?:[a-z0-9-]+\\.)+(?:${TLDS})(?:/[^\\s<>"']*)?(?![\\w-])`, 'gi'))) add(m[0])
  return out
}

/** The host name of a URL-ish string (lower case), or null. */
export function hostOf(url) {
  const m = String(url)
    .trim()
    .match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/\s]*@)?([^/:?#\s]+)/i)
  return m
    ? m[1]
        .toLowerCase()
        .replace(/^www\./, '')
        .replace(/\.$/, '')
    : null
}

/** The part of a host someone actually registered: "login.paypal.co.uk" → "paypal.co.uk". */
export function registrable(host) {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const second = parts[parts.length - 2]
  const twoLevel = parts[parts.length - 1].length === 2 && ['co', 'com', 'org', 'net', 'gov', 'ac', 'edu'].includes(second)
  return parts.slice(twoLevel ? -3 : -2).join('.')
}

/** Edit distance (Levenshtein), stopping early once it's over max. */
export function distance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

// digits and pairs that pass for letters at a glance
const unconfuse = (s) =>
  s
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/0/g, 'o')
    .replace(/[1l|]/g, 'l')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/4/g, 'a')
    .replace(/7/g, 't')

/** Which brand a host pretends to be, if any: { brand, how } */
export function lookalike(host) {
  const reg = registrable(host)
  const label = reg.split('.')[0]
  for (const official of Object.values(BRANDS)) {
    if (official.includes(reg) || official.includes(host)) return null
  }
  for (const [brand, official] of Object.entries(BRANDS)) {
    // "paypal.com.account-check.xyz": the real name, as a decoy in front of someone else's domain
    if (official.some((d) => host.startsWith(`${d}.`) || host.includes(`.${d}.`))) return { brand, how: 'subdomain' }
    const flat = label.replace(/-/g, '')
    if (label === brand) return { brand, how: 'wrong ending' }
    if (unconfuse(label) === unconfuse(brand) && label !== brand) return { brand, how: 'swapped letters' }
    if (brand.length >= 5 && distance(flat, brand, 2) <= (brand.length >= 7 ? 2 : 1)) return { brand, how: 'misspelt' }
    // "amazon-billing.net", "secure-paypal.com", "micros0ft-support.com"
    const parts = label.split('-')
    if (brand.length >= 4 && parts.length > 1 && parts.includes(brand)) return { brand, how: 'extra words' }
    if (brand.length >= 4 && parts.length > 1 && parts.some((x) => x !== brand && unconfuse(x) === unconfuse(brand)))
      return { brand, how: 'swapped letters' }
    if (brand.length >= 5 && flat.includes(brand) && flat !== brand) return { brand, how: 'extra words' }
  }
  return null
}

function linkSignals(text) {
  const found = []
  for (const l of findLinks(text)) {
    const { host, raw, shown } = l
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) found.push({ code: 'ipLink', weight: 35, label: 'Link goes to a bare number address', evidence: raw })
    if (host.split('.').some((p) => p.startsWith('xn--')))
      found.push({ code: 'punycode', weight: 35, label: 'Link uses look-alike letters (punycode)', evidence: raw })
    if (SHORTENERS.includes(host)) found.push({ code: 'shortLink', weight: 15, label: 'Shortened link hides where it goes', evidence: raw })
    const fake = lookalike(host)
    if (fake)
      found.push({ code: 'lookalike', weight: 45, label: 'Link looks like {brand} but isn’t theirs', vars: { brand: fake.brand }, evidence: raw })
    if (ODD_TLDS.includes(host.split('.').pop())) found.push({ code: 'oddTld', weight: 10, label: 'Unusual website ending', evidence: raw })
    if (shown) {
      const shownHost = hostOf(shown)
      if (shownHost && shownHost.includes('.') && registrable(shownHost) !== registrable(host))
        found.push({ code: 'mismatch', weight: 35, label: 'The link text and where it really goes don’t match', evidence: `${shown} → ${raw}` })
    }
  }
  return found
}

/* ---------------- account-aware checks (local only) ---------------- */
const median = (list) => {
  if (!list.length) return 0
  const s = [...list].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()

/** Past payments to a payee: transactions named after them ("Transfer to Sam Lee", or the merchant itself). */
const paidTo = (transactions, payee) => {
  const p = norm(payee)
  return (transactions ?? []).filter((x) => x.amount < 0 && x.status !== 'Failed' && (norm(x.name) === p || norm(x.name) === `transfer to ${p}`))
}

/**
 * Checks for paying someone, against the user's own history.
 * ctx: { transactions, contacts, bills, guard }; pay: { payee, amount, kind?: 'bill' }
 */
export function payeeChecks(ctx = {}, { payee, amount } = {}) {
  const found = []
  const name = String(payee ?? '').trim()
  const n = Number(amount) || 0
  if (!name && !n) return found
  const history = name ? paidTo(ctx.transactions, name) : []
  const isBill = (ctx.bills ?? []).some((b) => norm(b.name) === norm(name))
  if (name && !history.length && !isBill)
    found.push({ code: 'newPayee', weight: 15, label: 'You haven’t paid {name} before', vars: { name }, evidence: name })
  // much more than usual: this payee's usual, or all payments if they're new
  const usual = median(
    (history.length ? history : (ctx.transactions ?? []).filter((x) => x.amount < 0 && x.status !== 'Failed')).map((x) => -x.amount),
  )
  if (n && usual && n > usual * 3)
    found.push({
      code: 'bigAmount',
      weight: 25,
      label: '{amount} is over 3× your usual payment',
      vars: { amount: `$${n.toFixed(2)}`, usual: `$${usual.toFixed(2)}` },
      evidence: `$${n.toFixed(2)} vs $${usual.toFixed(2)}`,
    })
  const limit = ctx.guard?.limit
  if (n && limit && n >= limit)
    found.push({
      code: 'overLimit',
      weight: 15,
      label: 'At or above your {limit} guard limit',
      vars: { limit: `$${limit}` },
      evidence: `$${n.toFixed(2)}`,
    })
  // "Varsah Hunjan" when you know "Varsha Hunjan"
  if (name) {
    const me = norm(name)
    const close = (ctx.contacts ?? []).find((c) => {
      const them = norm(c.name)
      if (!them || them === me) return false
      const first = (s) => s.split(' ')[0]
      return (
        (them.length >= 4 && distance(me, them, 2) <= 2) ||
        (first(me).length >= 4 &&
          first(me) !== first(them) &&
          distance(first(me), first(them), 1) <= 1 &&
          me.split(' ').slice(1).join(' ') === them.split(' ').slice(1).join(' '))
      )
    })
    if (close)
      found.push({
        code: 'nearContact',
        weight: 40,
        label: '{name} is very close to your contact {contact}, but not the same',
        vars: { name, contact: close.name },
        evidence: `${name} ≠ ${close.name}`,
      })
  }
  return found
}

/** A bill more than 20% above the last one with the same name (a bill or a payment). */
export function billJump(ctx = {}, { name, amount } = {}) {
  const n = Number(amount) || 0
  if (!name || !n) return null
  const last =
    paidTo(ctx.transactions, name).sort((a, b) => b.date.localeCompare(a.date))[0]?.amount * -1 ||
    (ctx.bills ?? []).find((b) => norm(b.name) === norm(name))?.amount ||
    0
  if (!last || n <= last * 1.2) return null
  return {
    code: 'billJump',
    weight: 25,
    label: '{name} is {pct}% more than last time',
    vars: { name, pct: Math.round((n / last - 1) * 100) },
    evidence: `$${n.toFixed(2)} vs $${last.toFixed(2)}`,
  }
}

/* ---------------- scoring ---------------- */
const ADVICE = {
  payment: 'Real companies and government offices never ask to be paid in gift cards, crypto or by wire.',
  credentials: 'Never share passwords, PINs or one-time codes, even with someone who says they’re your bank.',
  remote: 'Don’t install apps or share your screen because someone asked you to.',
  bankChange: 'Call the company on a number you already have (not one in this message) before paying a new account.',
  secrecy: 'Anyone who asks you to keep a payment secret is a warning sign. Talk to someone you trust first.',
  prize: 'If you didn’t enter, you didn’t win. Never pay to collect a prize.',
  urgency: 'Slow down. Pressure to act right now is how scams stop you checking.',
  fee: 'Couriers and customs don’t text you for small fees. Check the tracking on the real company’s website.',
  impersonation: 'Contact them yourself using the app, the website you normally use or the number on your card.',
  lookalike: 'Don’t tap the link. Type the real website address yourself.',
  mismatch: 'The link doesn’t go where it says. Don’t tap it.',
  ipLink: 'Don’t tap links that are just a string of numbers.',
  punycode: 'Don’t tap it: some letters are look-alikes from another alphabet.',
  shortLink: 'Short links hide where they go. Be careful before tapping.',
  nearContact: 'Check you picked the right person: the name is almost the same as someone you know.',
  newPayee: 'For a first payment, check the details with them another way, like a call.',
  bigAmount: 'That’s much more than you usually pay. Double-check the amount.',
  billJump: 'Compare it with your last bill, and ask the company if the jump isn’t explained.',
}

/** Combine reasons: each code once (its strongest), with diminishing returns. */
export function combine(reasons) {
  const best = new Map()
  for (const r of reasons) if (!best.has(r.code) || best.get(r.code).weight < r.weight) best.set(r.code, r)
  let list = [...best.values()]
  const strong = list.filter((r) => r.code !== 'writing' && r.code !== 'impersonation')
  // impersonation alone is only a mention of a company; writing alone is nothing
  list = list.map((r) => (r.code === 'impersonation' && !strong.length ? { ...r, weight: 10 } : r))
  if (!strong.length && !list.some((r) => r.code === 'impersonation')) list = list.filter((r) => r.code !== 'writing')
  let keep = 1
  let writing = 0
  for (const r of list) {
    const w = r.code === 'writing' ? Math.min(8 - writing, r.weight) : r.weight
    if (r.code === 'writing') writing += w
    keep *= 1 - w / 100
  }
  const score = Math.round(100 * (1 - keep))
  list.sort((a, b) => b.weight - a.weight)
  return { score, level: score >= LEVELS.high ? 'high' : score >= LEVELS.medium ? 'medium' : 'low', reasons: list }
}

/**
 * Scan a message, email, link, invoice or payee.
 * ctx (optional, the user's own data, never sent anywhere): { transactions, contacts, bills, guard, payee, amount }
 * → { score 0-100, level, reasons: [{ code, label, weight, evidence }], advice: [string] }
 */
export function scan(text, ctx = {}) {
  // curly quotes as straight ones, so "don’t" matches like "don't"
  const src = String(text ?? '')
    .slice(0, 20000)
    .replace(/[‘’ʼ]/g, "'")
  const reasons = []
  for (const sig of TEXT_SIGNALS) {
    for (const re of sig.res) {
      const m = src.match(re)
      if (!m) continue
      if (sig.unless && sig.unless.test(src.slice(Math.max(0, m.index - 40), m.index))) continue
      reasons.push({ code: sig.code, weight: sig.weight, label: sig.label, evidence: m[0].trim().slice(0, 140) })
      break
    }
  }
  reasons.push(...linkSignals(src))
  if (ctx.payee || ctx.amount) {
    reasons.push(...payeeChecks(ctx, { payee: ctx.payee, amount: ctx.amount }))
    const jump = billJump(ctx, { name: ctx.payee, amount: ctx.amount })
    if (jump) reasons.push(jump)
  }
  const { score, level, reasons: list } = combine(reasons)
  const shown = list.map((r) => ({ code: r.code, label: t(r.label, r.vars), weight: r.weight, evidence: r.evidence }))
  const advice = [...new Set(list.map((r) => ADVICE[r.code]).filter(Boolean))].slice(0, 3).map((a) => t(a))
  if (level !== 'low') advice.push(t('If you’re unsure, stop and check with the company or person directly. You can always say no.'))
  else if (!list.length) advice.push(t('Nothing in my checks stood out. Rules can’t catch everything, so trust your gut if something feels off.'))
  return { score, level, reasons: shown, advice }
}

/** The plain-words headline for a level. It never claims certainty. */
export const levelText = (level) =>
  ({
    high: t('This looks risky'),
    medium: t('Some things here look suspicious'),
    low: t('Nothing obvious looks risky'),
  })[level]

/* ---------------- the user's own verdicts, kept on this device ---------------- */
const VERDICT_KEY = (account) => `ww-shield-${account || 'guest'}`
/** A short fingerprint of the text, so verdicts can be counted without keeping what was pasted. */
export const fingerprint = (text) => {
  let h = 2166136261
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619)
  return (h >>> 0).toString(36)
}
export function saveVerdict(account, entry) {
  try {
    const list = JSON.parse(localStorage.getItem(VERDICT_KEY(account)) ?? '[]')
    const next = [{ at: new Date().toISOString(), ...entry }, ...list.filter((x) => x.id !== entry.id)].slice(0, 200)
    localStorage.setItem(VERDICT_KEY(account), JSON.stringify(next))
    return next
  } catch {
    return []
  }
}
export function verdicts(account) {
  try {
    return JSON.parse(localStorage.getItem(VERDICT_KEY(account)) ?? '[]')
  } catch {
    return []
  }
}
