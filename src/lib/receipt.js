/* ------------------------------------------------------------------
   Grace reads receipts and bills from a photo.
   The text is read in the browser with Tesseract.js (free, nothing is
   uploaded), then parseReceipt picks out the shop, total, date and any
   due date with plain rules, and receiptReply turns that into Grace's
   answer with a confirm button: add it as spending, or as a bill.
   ------------------------------------------------------------------ */
import { isoDay, money } from './format'
import { billJump, scan } from './shield'
import { modelFor, predict } from './ml/categorize.js'
import { t } from './i18n'
import { CURRENCIES } from '../data/seed'
import { ASSISTANT } from '../config'

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const SYMBOLS = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' }

/** "1,234.56", "1.234,56", "42,18" → number (or NaN). */
export function toNumber(raw) {
  let s = String(raw).replace(/[^\d.,]/g, '')
  if (!s) return NaN
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastComma > lastDot) {
    // the comma is the decimal mark when two digits follow it
    s = /,\d{2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else s = s.replace(/,/g, '')
  return Number(s)
}

const AMOUNT = /(?:[$€£¥₹]\s?)?\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}\b|(?:[$€£¥₹]\s?)\d+\b/g

function amountsIn(line) {
  return [...line.matchAll(AMOUNT)].map((m) => toNumber(m[0])).filter((n) => Number.isFinite(n) && n > 0 && n < 1e6)
}

/** Dates in a line, as yyyy-mm-dd. Day-first when the first number can't be a month. */
export function datesIn(line, today = new Date()) {
  const out = []
  const push = (y, m, d) => {
    let year = Number(y)
    if (year < 100) year += 2000
    const month = Number(m)
    const day = Number(d)
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > today.getFullYear() + 2) return
    const dt = new Date(year, month - 1, day)
    if (dt.getMonth() !== month - 1) return
    out.push(isoDay(dt))
  }
  const l = line.toLowerCase()
  for (const m of l.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) push(m[1], m[2], m[3])
  for (const m of l.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 12) push(m[3], b, a)
    else push(m[3], a, b)
  }
  for (const m of l.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{2,4})\b/g)) {
    const i = MONTH_NAMES.indexOf(m[2])
    if (i >= 0) push(m[3], i + 1, m[1])
  }
  for (const m of l.matchAll(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})\b/g)) {
    const i = MONTH_NAMES.indexOf(m[1])
    if (i >= 0) push(m[3], i + 1, m[2])
  }
  return out
}

const CATEGORY_WORDS = [
  [
    'Food & Dining',
    /restaurant|trattoria|ristorante|osteria|taverna|brasserie|cantina|steakhouse|noodle|ramen|curry|dhaba|deli\b|bbq|tip\b|gratuity|server|cafe|café|coffee|tea\b|pizza|burger|bistro|grill|kitchen|bar\b|pub\b|diner|bakery|sushi|taco|starbucks|mcdonald|kfc|subway|domino|food|dine|eatery|grocer|supermarket|market|mart\b|whole foods|trader joe|safeway|kroger|tesco|aldi|lidl/,
  ],
  ['Transport', /uber|lyft|taxi|cab\b|fuel|petrol|gas station|shell|chevron|exxon|parking|metro|transit|toll|bp\b/],
  ['Health', /pharmacy|chemist|clinic|hospital|doctor|dental|medical|cvs|walgreens|boots/],
  ['Bills', /electric|electricity|power|energy|water|utility|utilities|internet|broadband|wifi|mobile|phone|telecom|gas bill|insurance|council tax/],
  ['Shopping', /store|shop|boutique|amazon|walmart|target|ikea|mall|outlet|clothing|fashion|electronics|best buy/],
  ['Entertainment', /cinema|movie|theatre|theater|netflix|spotify|concert|tickets?|games?|bowling/],
  ['Travel', /hotel|airline|airways|flight|airbnb|booking\.com|resort|hostel/],
  ['Housing', /rent|landlord|property|mortgage|lease/],
]

const NOT_A_NAME =
  /receipt|invoice|tax|vat|gst|date|time|tel|phone|www\.|http|@|order|table|server|cashier|welcome|thank|copy|statement|account|page|bill to|ship to|^\W*$/i

/**
 * Pick out what matters from a receipt or bill's text.
 * → { merchant, total, currency, date, dueDate, kind: 'expense' | 'bill', category } or null when no total is found.
 */
export function parseReceipt(text, today = new Date()) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (!lines.length) return null
  const all = lines.join('\n')
  const lower = all.toLowerCase()

  // the total: the best-labelled line wins; otherwise the biggest amount on the page
  const ranked = [
    [/amount\s*due|balance\s*due|total\s*due|amount\s*payable|total\s*payable|please\s*pay|pay\s*this\s*amount/i, 5],
    [/grand\s*total/i, 4],
    [/\btotal\b(?!\s*(items?|qty|quantity|savings?|discount|tax|vat))/i, 3],
    [/\bamount\b|\bbalance\b/i, 1],
  ]
  let total = null
  let best = 0
  lines.forEach((line, i) => {
    if (/sub\s*-?\s*total|subtotal|tax|vat|tip|change|cash\s*tendered|tendered|discount|saving/i.test(line) && !/total\s*(due|payable)/i.test(line))
      return
    for (const [re, score] of ranked) {
      if (!re.test(line)) continue
      // the amount can sit on the same line or the next one
      const found = amountsIn(line).concat(i + 1 < lines.length && !amountsIn(line).length ? amountsIn(lines[i + 1]) : [])
      if (found.length && score > best) {
        best = score
        total = found[found.length - 1]
      }
      break
    }
  })
  if (total == null) {
    const every = lines.flatMap(amountsIn)
    if (every.length) total = Math.max(...every)
  }
  if (total == null || !(total > 0)) return null

  const currency =
    Object.entries(SYMBOLS).find(([sym]) => all.includes(sym))?.[1] ??
    (/\b(eur|euro)\b/i.test(all) ? 'EUR' : /\b(gbp)\b/i.test(all) ? 'GBP' : /\b(inr|rs\.?|rupees?)\b/i.test(all) ? 'INR' : 'USD')

  // dates: a due date if a line says "due"; the receipt date is the first other date
  let dueDate = null
  let date = null
  lines.forEach((line, i) => {
    const here = datesIn(line, today)
    const next = !here.length && i + 1 < lines.length ? datesIn(lines[i + 1], today) : []
    if (/\bdue\b|pay\s*by|payment\s*date|due\s*on/i.test(line) && (here.length || next.length)) dueDate ??= here[0] ?? next[0]
    else if (here.length) date ??= here[0]
  })

  // the shop: the first line near the top that looks like a name
  const merchant =
    lines
      .slice(0, 6)
      .find((l) => /[a-z]{3,}/i.test(l) && !NOT_A_NAME.test(l) && amountsIn(l).length === 0 && l.length <= 40)
      ?.replace(/[^\p{L}\p{N}&'.\- ]/gu, '')
      .trim() || null

  const looksLikeBill = Boolean(dueDate) || /invoice|statement|amount\s*due|account\s*number|billing\s*period|meter|bill\s*date/i.test(lower)
  const category = CATEGORY_WORDS.find(([, re]) => re.test(lower))?.[0] ?? (looksLikeBill ? 'Bills' : 'Other')
  const todayIso = isoDay(today)
  return {
    merchant,
    total: Math.round(total * 100) / 100,
    currency,
    date: date && date <= todayIso ? date : null,
    dueDate,
    kind: looksLikeBill && dueDate && dueDate >= todayIso ? 'bill' : 'expense',
    category,
  }
}

/* ---------------- reading the photo ---------------- */
/** Bigger, grey and with more contrast: Tesseract reads that far better than a raw phone photo. */
async function cleanImage(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const long = Math.max(img.naturalWidth, img.naturalHeight)
    const scale = Math.min(2, Math.max(1, 1800 / long), 2400 / long)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const g = canvas.getContext('2d')
    g.filter = 'grayscale(1) contrast(1.5) brightness(1.05)'
    g.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Read the words on a photo. onProgress(0..1) while it works. The reader downloads once, then is cached. */
export async function readReceipt(file, onProgress) {
  const [{ createWorker }, image] = await Promise.all([import('tesseract.js'), cleanImage(file)])
  const worker = await createWorker('eng', 1, {
    logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress),
  })
  try {
    const { data } = await worker.recognize(image)
    return data.text
  } finally {
    worker.terminate()
  }
}

/* ---------------- Grace's answer ---------------- */
const nice = (iso) => {
  const d = new Date(`${iso}T12:00`)
  return `${t(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()])} ${d.getDate()}`
}

/** In dollars, using the dashboard's exchange rates when the receipt is in another currency it knows. */
function inDollars(p) {
  const rate = CURRENCIES[p.currency]?.rate
  if (p.currency === 'USD' || !rate) return { usd: p.total, converted: false }
  return { usd: Math.round((p.total / rate) * 100) / 100, converted: true }
}

/** Grace's reply for a parsed receipt: confirm adds it as spending (or a bill); a link offers the other one. */
/** Scam shield checks on a scanned receipt or bill: changed bank details, a payee you've never paid, a jump. */
export function receiptChecks(p, app, text = '') {
  if (!p) return []
  const found = scan(text).reasons.filter((r) =>
    ['bankChange', 'lookalike', 'mismatch', 'ipLink', 'punycode', 'payment', 'credentials'].includes(r.code),
  )
  const name = p.merchant
  if (name) {
    const known =
      (app.transactions ?? []).some((x) => x.name?.toLowerCase() === name.toLowerCase()) ||
      (app.bills ?? []).some((b) => b.name?.toLowerCase() === name.toLowerCase())
    if (!known && p.kind === 'bill')
      found.push({ code: 'newPayee', weight: 15, label: t('You haven’t paid {name} before', { name }), evidence: name })
    const jump = billJump({ transactions: app.transactions, bills: app.bills }, { name, amount: inDollars(p).usd })
    if (jump) found.push({ ...jump, label: t(jump.label, jump.vars) })
  }
  return found
}

export function receiptReply(p, app, text = '') {
  if (!p)
    return {
      text: t(
        'I couldn’t find a total on that photo 🧾 Try a sharp, straight-on photo with the total in view, or just tell me, like “I spent $42 at Luigi’s”.',
      ),
      chips: [{ q: 'I spent $20 on lunch today', label: t('I spent $20 on lunch today') }],
    }
  // the receipt's words didn't say the category: ask this account's categorizer (it only answers when sure)
  let guessed = null
  if (p.merchant && p.category === 'Other') {
    const g = predict(modelFor(app.transactions ?? [], app.categoryCorrections ?? []), p.merchant)
    if (g.category && !g.ask) {
      guessed = g
      p = { ...p, category: g.category }
    }
  }
  const name = p.merchant || (p.kind === 'bill' ? t('Bill') : t('Receipt'))
  const { usd, converted } = inDollars(p)
  const local = converted ? ` (${p.total.toFixed(2)} ${p.currency})` : p.currency !== 'USD' ? ` (${p.currency})` : ''
  const when = p.date ? nice(p.date) : t('today')
  const method = t('Scanned by {name}', { name: ASSISTANT.name })
  const today = isoDay(app.now ?? new Date())
  const asExpense = {
    label: t('Add expense'),
    note: t('{category} · from your balance', { category: t(p.category === 'Bills' ? 'Bills' : p.category) }),
    effect: { balance: -usd, free: -usd },
    run: () => app.addTransaction({ name, amount: -usd, category: p.category, date: p.date ? `${p.date}T12:00` : undefined, method }),
    done: t('Added ✅ {amount} at {name}.', { amount: money(usd), name }),
  }
  const asBill = {
    label: t('Add bill'),
    note: t('Due {date}', { date: nice(p.dueDate ?? today) }),
    run: () => app.addBill({ name, amount: usd, dueDate: p.dueDate ?? today, category: p.category === 'Other' ? 'Bills' : p.category }),
    done: t('Added ✅ {name} is in your bills, due {date}. I’ll remind you before then.', { name, date: nice(p.dueDate ?? today) }),
  }
  const flags = receiptChecks(p, app, text)
  const careful =
    t('I read this from the photo, so check the amount before you confirm.') +
    (guessed
      ? ` ${t('I guessed the category ({category}, {pct}% sure).', { category: t(guessed.category), pct: Math.round(guessed.confidence * 100) })}`
      : '') +
    (flags.length ? `\n🛡 ${t('Before you pay it:')}\n${flags.map((f) => `• ${f.label} (+${f.weight}): “${f.evidence}”`).join('\n')}` : '')
  if (p.kind === 'bill')
    return {
      text: `${t('This looks like a **bill** from **{name}** for **{amount}**{local}, due **{date}** 🧾', { name, amount: money(usd), local, date: nice(p.dueDate) })}\n${t('Add it to your bills so I can remind you?')}\n${careful}`,
      confirm: asBill,
      links: [
        { label: t('Add as spending instead'), run: () => (asExpense.run(), app.toast?.(t('Money added'), asExpense.done, { icon: 'receipt' })) },
      ],
    }
  return {
    text: `${t('Got it from the photo 🧾 **{name}**, **{amount}**{local} on {date}.', { name, amount: money(usd), local, date: when })}\n${t('Add it as spending under {category}?', { category: t(p.category) })}\n${careful}`,
    confirm: asExpense,
    links: [{ label: t('Add as a bill instead'), run: () => (asBill.run(), app.toast?.(t('Bill added'), asBill.done, { icon: 'receipt' })) }],
  }
}
