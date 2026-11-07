/* ------------------------------------------------------------------
   Typo correction for Grace, using Fuse.js.

   Each word the user types is checked against Grace's vocabulary (every
   word her patterns and replies use, built by the grace-vocab plugin in
   vite.config.js) plus the names on the account: contacts, goals, bills,
   pots, budgets and transactions. A word that isn't known is swapped for
   the closest known word, so "whats my balnce" reads as "whats my
   balance" and "send $50 to varsah" finds Varsha.

   Fuse ranks the candidates; a strict edit-distance check then decides
   whether a swap is safe, so ordinary words Grace doesn't know (like
   "sushi") are left alone.
   ------------------------------------------------------------------ */
import Fuse from 'fuse.js'
import VOCAB from 'virtual:grace-vocab'

const FUSE_OPTIONS = { includeScore: true, threshold: 0.4, ignoreLocation: true, minMatchCharLength: 3 }
/* Everyday short words, so "tax" never becomes "taxi" or "tea" "team". */
const COMMON =
  'tax tea gas car bus pay fee fun gym art pet toy kid mom dad son job app fix cut eat ate got get put buy own bed cup pen bag hat box oil ice egg jam pie bun nut dog cat cab van sun day now new old big top way out off and the but you his her its our who why how all any few may can let lot set bit ago yet zoo spa bar pub gin rum ale mug rug tub tip tin key map kit lab law tie war win won yes not too two six ten saw sat ran run'
const KNOWN = new Set([...VOCAB, ...COMMON.split(' ')])
let baseIndex = null // built on first use

/** Edit distance where swapping two neighbouring letters counts as one edit. */
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

/* How far a word may be from its correction. Short words are easy to
   confuse with other real words, so they get the least room. */
function allowed(word, candidate) {
  if (candidate.length < 4 || candidate[0] !== word[0]) return false
  const n = distance(word, candidate)
  if (word.length <= 4) return n === 1 && candidate.length > word.length // only a dropped letter: "fod" → "food", "bils" → "bills"
  // an extra letter only counts as a typo when it's a doubled key ("billls"), so "crash" never becomes "cash"
  if (candidate.length < word.length && !/(.)\1/.test(word)) return false
  if (word.length >= 8) return n <= 2
  if (n !== 1) return false
  // one wrong letter only counts when it's next to the right key ("bslance"), so "trail" never becomes "train"
  if (candidate.length === word.length) {
    const i = [...word].findIndex((c, k) => c !== candidate[k])
    if (i >= 0 && word[i + 1] === candidate[i + 1] && !NEAR[candidate[i]]?.includes(word[i])) return false
  }
  return true
}

/* Keys next to each other on a QWERTY keyboard. */
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const NEAR = {}
ROWS.forEach((row, r) =>
  [...row].forEach((c, i) => {
    NEAR[c] = [row[i - 1], row[i + 1], ROWS[r - 1]?.[i], ROWS[r - 1]?.[i + 1], ROWS[r + 1]?.[i], ROWS[r + 1]?.[i - 1]].filter(Boolean).join('')
  }),
)

/* A known word with a common ending ("scammed", "budgets", "paying") is
   spelled right, even if only its stem is in the vocabulary. */
function knownStem(word, known) {
  return ['ing', 'ers', 'ed', 'es', 'er', 'ly', 's'].some((end) => {
    if (!word.endsWith(end) || word.length - end.length < 3) return false
    const stem = word.slice(0, -end.length)
    if (end === 's' && stem.endsWith('s')) return false // "groceriess" is a typo, not a plural
    return known(stem) || known(stem + 'e') || (stem.at(-1) === stem.at(-2) && known(stem.slice(0, -1)))
  })
}

/* Two neighbouring letters swapped ("spnet" → "spent"). Fuse scores
   these poorly, so they're checked directly. */
function swapped(word, known) {
  for (let i = 1; i < word.length - 1; i++) {
    const w = word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2)
    if (known(w)) return w
  }
  return null
}

function best(word, indexes, known) {
  const swap = swapped(word, known)
  if (swap) return swap
  let pick = null
  for (const index of indexes)
    for (const { item, score } of index.search(word, { limit: 12 })) {
      if (!allowed(word, item)) continue
      const n = distance(word, item)
      if (!pick || n < pick.n || (n === pick.n && score < pick.score)) pick = { item, n, score }
    }
  return pick?.item ?? null
}

const wordsOf = (names) =>
  names.flatMap((name) =>
    String(name ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 3),
  )

/** The names on an account that count as correctly spelled. */
export function accountWords(app) {
  return wordsOf([
    ...(app.contacts ?? []).map((c) => c.name),
    ...(app.goals ?? []).map((g) => g.name),
    ...(app.bills ?? []).map((b) => b.name),
    ...(app.pots ?? []).map((p) => p.name),
    ...(app.budgets ?? []).map((b) => b.name),
    ...(app.transactions ?? []).map((x) => x.name),
  ])
}

/**
 * Fix misspelled words in a message.
 * Returns { text, fixes } where fixes lists [typed, corrected] pairs.
 */
export function fixTypos(raw, extraWords = []) {
  const extra = [...new Set(extraWords)].filter((w) => !KNOWN.has(w))
  const own = new Set(extra)
  const known = (w) => KNOWN.has(w) || own.has(w)
  let accountIndex = null
  const fixes = []
  const text = raw.replace(/[A-Za-z]+/g, (typed) => {
    const word = typed.toLowerCase()
    if (word.length < 3 || known(word) || knownStem(word, known)) return typed
    baseIndex ??= new Fuse(VOCAB, FUSE_OPTIONS)
    if (extra.length) accountIndex ??= new Fuse(extra, FUSE_OPTIONS)
    const fixed = best(word, accountIndex ? [accountIndex, baseIndex] : [baseIndex], known)
    if (!fixed) return typed
    fixes.push([typed, fixed])
    return typed[0] === typed[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed
  })
  return { text, fixes }
}
