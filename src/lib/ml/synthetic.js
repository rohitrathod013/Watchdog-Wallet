/* ------------------------------------------------------------------
   Synthetic accounts for tests and the evaluation (scripts/ml-eval.js).
   Seeded, so the same seed always gives the same account. Six months
   of everyday life (pay, rent, bills, subscriptions, groceries, eating
   out, transport, shopping) with optional planted incidents, each
   labelled, so a detector can be scored against the truth.

   This is made-up data. Real spending is messier.
   ------------------------------------------------------------------ */
import { int, normal, pick, rng } from './random.js'

const two = (n) => String(n).padStart(2, '0')
const iso = (d, h, m) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(h)}:${two(m)}`

// merchants per category: some well known (in the seed dictionary), some local ones that aren't
export const PLACES = {
  Groceries: ['Trader Joe’s', 'Whole Foods', 'Safeway', 'Kroger', 'Aldi', 'Green Valley Market', 'Rosa’s Grocery'],
  'Food & Dining': [
    'Chipotle',
    'Starbucks',
    'Luigi’s Trattoria',
    'Sakura Sushi Bar',
    'The Corner Deli',
    'Blue Door Bistro',
    'Taco Loco',
    'Mama Wong’s',
  ],
  Transport: ['Uber', 'Lyft', 'Metro Card', 'Shell', 'City Parking'],
  Shopping: ['Amazon', 'Target', 'IKEA', 'Uniqlo', 'Hollow Pine Books'],
  Entertainment: ['AMC Theatres', 'Steam', 'Bowl-O-Rama', 'Jazz at Ellie’s'],
  Health: ['CVS Pharmacy', 'Walgreens', 'Dr. Patel Dental'],
  'Personal Care': ['Great Clips', 'Sephora', 'Lotus Day Spa'],
}

/**
 * opts: { seed, months = 6, end = Date, incidents = true, opening = 3000 }
 * → { transactions (newest first), balance, opening, incidents: [{ type, txId, note }], start, end }
 */
export function syntheticAccount({ seed = 1, months = 6, end = new Date(2026, 9, 31, 23, 59), incidents = true, opening = 3000 } = {}) {
  const rand = rng(seed)
  const out = []
  let n = 0
  const add = (date, h, m, name, amount, category, extra = {}) => {
    const tx = {
      id: `s${seed}-${++n}`,
      date: iso(date, h, m),
      name,
      amount: Math.round(amount * 100) / 100,
      category,
      status: 'Completed',
      kind: 'transfer',
      ...extra,
    }
    out.push(tx)
    return tx
  }
  const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1)
  const salary = 3800 + int(rand, 0, 8) * 100
  const rent = 1200 + int(rand, 0, 6) * 100
  const subs = [
    ['Netflix', 15.49, 12, 'Entertainment'],
    ['Spotify', 10.99, 20, 'Subscriptions'],
    ['Planet Fitness', 24.99, 3, 'Fitness'],
  ]
  // each account has its own favourite places
  const favourite = Object.fromEntries(Object.entries(PLACES).map(([cat, list]) => [cat, list.filter(() => rand() < 0.7).concat(list[0])]))

  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const day = d.getDate()
    const dow = d.getDay()
    const weekend = dow === 0 || dow === 6
    if (day === 1) {
      add(d, 9, 0, 'Northwind Payroll', salary, 'Salary')
      add(d, 10, 15, 'Oakwood Apartments', -rent, 'Housing')
    }
    if (day === 5) add(d, 8, 30, 'City Power & Light', -(70 + rand() * 40), 'Utilities')
    if (day === 8) add(d, 8, 40, 'Verizon', -65, 'Phone & Internet')
    for (const [name, price, on, cat] of subs) if (day === on) add(d, 6, 10, name, -price, cat)
    // groceries about twice a week
    if (rand() < (weekend ? 0.45 : 0.22))
      add(d, int(rand, 10, 19), int(rand, 0, 59), pick(rand, favourite.Groceries), -Math.max(12, 62 + normal(rand) * 20), 'Groceries')
    // eating out, more at weekends
    if (rand() < (weekend ? 0.7 : 0.35))
      add(d, int(rand, 11, 21), int(rand, 0, 59), pick(rand, favourite['Food & Dining']), -Math.max(4, 24 + normal(rand) * 9), 'Food & Dining')
    if (!weekend && rand() < 0.5)
      add(d, int(rand, 7, 9), int(rand, 0, 59), pick(rand, favourite.Transport), -Math.max(2.5, 13 + normal(rand) * 5), 'Transport')
    if (rand() < 0.08) add(d, int(rand, 12, 20), int(rand, 0, 59), pick(rand, favourite.Shopping), -Math.max(8, 55 + normal(rand) * 25), 'Shopping')
    if (rand() < 0.06)
      add(d, int(rand, 17, 22), int(rand, 0, 59), pick(rand, favourite.Entertainment), -Math.max(6, 22 + normal(rand) * 8), 'Entertainment')
    if (rand() < 0.03) add(d, int(rand, 9, 17), int(rand, 0, 59), pick(rand, favourite.Health), -Math.max(5, 28 + normal(rand) * 10), 'Health')
    if (rand() < 0.025)
      add(d, int(rand, 10, 18), int(rand, 0, 59), pick(rand, favourite['Personal Care']), -Math.max(10, 35 + normal(rand) * 12), 'Personal Care')
  }

  const planted = []
  if (incidents) {
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1)
    const inLast = (x) => new Date(x.date) >= lastMonth
    const dining = out.filter((x) => x.category === 'Food & Dining' && inLast(x))
    // 1. the same charge twice, an hour later
    const twice = pick(rand, dining)
    const copy = add(
      new Date(twice.date),
      Number(twice.date.slice(11, 13)) + 1,
      Number(twice.date.slice(14, 16)),
      twice.name,
      twice.amount,
      twice.category,
    )
    planted.push({ type: 'duplicate', txId: copy.id, note: `${twice.name} charged twice` })
    // 2. ten times the usual at a usual place
    const usual = pick(
      rand,
      dining.filter((x) => x !== twice),
    )
    const big = add(new Date(end.getFullYear(), end.getMonth(), int(rand, 3, 25)), 20, 15, usual.name, usual.amount * 10, 'Food & Dining')
    planted.push({ type: 'outlier', txId: big.id, note: `10× at ${usual.name}` })
    // 3. a place never seen before, with a big amount
    const fresh = add(
      new Date(end.getFullYear(), end.getMonth(), int(rand, 3, 25)),
      13,
      5,
      'Lux Watches Online',
      -(650 + int(rand, 0, 500)),
      'Shopping',
    )
    planted.push({ type: 'newMerchant', txId: fresh.id, note: 'big first payment to a new shop' })
    // 4. a subscription price jump
    const sub = out.filter((x) => x.name === 'Netflix' && inLast(x))[0]
    if (sub) {
      sub.amount = -22.99
      planted.push({ type: 'priceRise', txId: sub.id, note: 'Netflix 15.49 → 22.99' })
    }
    // 5. a subtle one: about twice the usual grocery shop. Hard on purpose; detectors often miss it.
    const shop = add(
      new Date(end.getFullYear(), end.getMonth(), int(rand, 3, 25)),
      18,
      40,
      favourite.Groceries[0],
      -(140 + int(rand, 0, 20)),
      'Groceries',
    )
    planted.push({ type: 'subtle', txId: shop.id, note: `about 2× a normal shop at ${shop.name}` })
  }
  out.sort((a, b) => b.date.localeCompare(a.date))
  const balance = Math.round((opening + out.reduce((s, x) => s + x.amount, 0)) * 100) / 100
  return { transactions: out, balance, opening, incidents: planted, start, end }
}
