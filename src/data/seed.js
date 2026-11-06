import { isoDay } from '../lib/format'
import { BRAND, USER as PERSON } from '../config'

export const USER = { ...PERSON, email: `${PERSON.first.toLowerCase()}@${BRAND.domain}` }
const PAY = `${BRAND.name} Pay`

export const BALANCE_USD = 128430.5

export const CURRENCIES = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1, flag: 'us', dp: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.92, flag: 'eu', dp: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.79, flag: 'gb', dp: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', rate: 151.4, flag: 'jp', dp: 0 },
}

export const LANGUAGES = [
  { code: 'EN', name: 'English' },
  { code: 'ES', name: 'Español' },
  { code: 'FR', name: 'Français' },
  { code: 'DE', name: 'Deutsch' },
  { code: 'AR', name: 'العربية' },
]

/* the "This Month" picker drives the three KPI cards and the profit split */
export const PERIODS = {
  week: {
    label: 'This Week',
    vs: 'vs Last Week',
    income: 3120,
    incomeDelta: 4.6,
    expenses: 1265.4,
    expensesDelta: -2.1,
    net: 1854.6,
    netDelta: 6.8,
    split: [46, 30, 24],
    savings: 1040,
  },
  month: {
    label: 'This Month',
    vs: 'vs Last Month',
    income: 12540,
    incomeDelta: 8.2,
    expenses: 5000,
    expensesDelta: -5.3,
    net: 7540,
    netDelta: 12.2,
    split: [48, 28, 24],
    savings: 4260,
  },
  quarter: {
    label: 'This Quarter',
    vs: 'vs Last Quarter',
    income: 36880,
    incomeDelta: 11.4,
    expenses: 15420,
    expensesDelta: 3.2,
    net: 21460,
    netDelta: 17.9,
    split: [50, 27, 23],
    savings: 12610,
  },
  year: {
    label: 'This Year',
    vs: 'vs Last Year',
    income: 148210,
    incomeDelta: 14.8,
    expenses: 61300,
    expensesDelta: -1.7,
    net: 86910,
    netDelta: 22.5,
    split: [51, 25, 24],
    savings: 50120,
  },
}

export const EARNINGS = {
  2026: {
    total: 98643.24,
    delta: 12.4,
    vs: 'vs Last Week',
    values: [26.4, 80.2, 41.3, 65.1, 54.2, 46.0, 76.3, 46.2, 65.4, 15.3, 46.1, 62.4],
  },
  2025: {
    total: 87711.06,
    delta: 6.1,
    vs: 'vs 2024',
    values: [34.8, 52.6, 61.2, 38.4, 47.9, 70.4, 58.3, 66.1, 29.7, 44.2, 73.8, 55.6],
  },
}

export const INCOME_SOURCES = [
  { id: 'salary', name: 'Salary', value: 4500, trend: [3.8, 4.1, 4.1, 4.2, 4.3, 4.5, 4.5, 4.5] },
  { id: 'freelance', name: 'Freelance', value: 12500, trend: [6.2, 8.4, 7.1, 9.8, 10.6, 9.4, 11.8, 12.5] },
  { id: 'business', name: 'Business', value: 66500, trend: [41, 44, 52, 49, 55, 58, 61, 66.5] },
]

export const CASHFLOW = {
  labels: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
  income: [9.8, 10.4, 11.2, 10.1, 11.8, 12.3, 11.6, 12.9, 13.4, 12.1, 13.8, 12.5],
  expenses: [6.1, 5.4, 6.8, 5.2, 5.9, 6.4, 5.1, 6.2, 5.7, 4.9, 5.6, 5.0],
}

export const CATEGORIES = [
  { id: 'housing', name: 'Housing', v: 1850, icon: 'home' },
  { id: 'food', name: 'Food & Dining', v: 920, icon: 'coffee' },
  { id: 'shopping', name: 'Shopping', v: 780, icon: 'bag' },
  { id: 'transport', name: 'Transport', v: 640, icon: 'car' },
  { id: 'fun', name: 'Entertainment', v: 410, icon: 'play' },
  { id: 'health', name: 'Health', v: 400, icon: 'heart' },
]

export const CAT_COLORS = ['var(--accent)', 'var(--solid)', 'var(--green)', 'var(--accent-2)', 'var(--faint)', 'var(--blue)']

export const BUDGETS = [
  { id: 'housing', name: 'Housing', icon: 'home', spent: 1850, limit: 2000 },
  { id: 'food', name: 'Food & Dining', icon: 'coffee', spent: 920, limit: 1000 },
  { id: 'shopping', name: 'Shopping', icon: 'bag', spent: 780, limit: 600 },
  { id: 'transport', name: 'Transport', icon: 'car', spent: 640, limit: 800 },
  { id: 'fun', name: 'Entertainment', icon: 'play', spent: 410, limit: 500 },
  { id: 'health', name: 'Health', icon: 'heart', spent: 400, limit: 600 },
]

export const GOALS = [
  { id: 'g1', name: 'Emergency Fund', icon: 'sack', saved: 7200, target: 10000, monthly: 600, due: 'Jun 2027' },
  { id: 'g2', name: 'Europe Vacation', icon: 'luggage', saved: 1400, target: 5000, monthly: 300, due: 'Aug 2027' },
  { id: 'g3', name: 'Tesla Model 3', icon: 'car', saved: 13500, target: 30000, monthly: 1200, due: 'Dec 2027' },
]

export const CONTACTS = [
  { id: 'c6', name: 'Varsha Hunjan', hue: 300 },
  { id: 'c7', name: 'Nikhil', hue: 190 },
  { id: 'c8', name: 'Ayush', hue: 40 },
  { id: 'c1', name: 'Maya Chen', hue: 18 },
  { id: 'c2', name: 'Leo Park', hue: 210 },
  { id: 'c3', name: 'Sara Ali', hue: 330 },
  { id: 'c4', name: 'Tom Reed', hue: 150 },
  { id: 'c5', name: 'Nina Patel', hue: 265 },
]

/** Contacts a brand-new account starts with (the list above is the demo owner's). */
export const STARTER_CONTACTS = CONTACTS.filter((c) => !['c6', 'c7', 'c8'].includes(c.id))

export const TRANSACTIONS = [
  {
    id: 't01',
    name: 'Salary · Northwind Ltd',
    category: 'Salary',
    kind: 'salary',
    method: 'Bank transfer',
    date: '2026-10-28T09:12',
    amount: 4500,
    status: 'Completed',
  },
  {
    id: 't02',
    name: 'Apple Store',
    category: 'Shopping',
    kind: 'shopping',
    method: 'Card •••• 4821',
    date: '2026-10-27T18:40',
    amount: -1299,
    status: 'Completed',
  },
  {
    id: 't03',
    name: 'Upwork Payout',
    category: 'Freelance',
    kind: 'freelance',
    method: 'Bank transfer',
    date: '2026-10-27T11:05',
    amount: 2150,
    status: 'Completed',
  },
  {
    id: 't04',
    name: 'Airbnb · Lisbon',
    category: 'Travel',
    kind: 'travel',
    method: 'Card •••• 4821',
    date: '2026-10-26T21:18',
    amount: -642,
    status: 'Pending',
  },
  {
    id: 't05',
    name: 'Whole Foods Market',
    category: 'Food & Dining',
    kind: 'food',
    method: 'Card •••• 9034',
    date: '2026-10-26T17:22',
    amount: -186.32,
    status: 'Completed',
  },
  {
    id: 't06',
    name: 'Transfer to Maya Chen',
    category: 'Transfer',
    kind: 'transfer',
    method: PAY,
    date: '2026-10-25T14:50',
    amount: -250,
    status: 'Completed',
  },
  {
    id: 't07',
    name: 'Netflix',
    category: 'Entertainment',
    kind: 'stream',
    method: 'Card •••• 4821',
    date: '2026-10-25T08:00',
    amount: -15.49,
    status: 'Completed',
  },
  {
    id: 't08',
    name: 'Stripe Payout',
    category: 'Business',
    kind: 'business',
    method: 'Bank transfer',
    date: '2026-10-24T10:30',
    amount: 3920,
    status: 'Completed',
  },
  {
    id: 't09',
    name: 'Uber',
    category: 'Transport',
    kind: 'ride',
    method: 'Card •••• 9034',
    date: '2026-10-24T09:14',
    amount: -24.8,
    status: 'Completed',
  },
  {
    id: 't10',
    name: 'Blue Bottle Coffee',
    category: 'Food & Dining',
    kind: 'coffee',
    method: 'Card •••• 9034',
    date: '2026-10-23T08:31',
    amount: -8.75,
    status: 'Completed',
  },
  {
    id: 't11',
    name: 'Dividend · Vanguard',
    category: 'Business',
    kind: 'business',
    method: 'Brokerage',
    date: '2026-10-22T16:00',
    amount: 1280,
    status: 'Completed',
  },
  {
    id: 't12',
    name: 'Request from Leo Park',
    category: 'Transfer',
    kind: 'request',
    method: PAY,
    date: '2026-10-21T19:45',
    amount: 120,
    status: 'Pending',
  },
  {
    id: 't13',
    name: 'Shell Gas Station',
    category: 'Transport',
    kind: 'fuel',
    method: 'Card •••• 4821',
    date: '2026-10-20T07:52',
    amount: -58.4,
    status: 'Completed',
  },
  {
    id: 't14',
    name: 'Spotify',
    category: 'Entertainment',
    kind: 'music',
    method: 'Card •••• 4821',
    date: '2026-10-19T08:00',
    amount: -10.99,
    status: 'Completed',
  },
  {
    id: 't15',
    name: 'Rent · Oakwood Apts',
    category: 'Housing',
    kind: 'home',
    method: 'Bank transfer',
    date: '2026-10-01T09:00',
    amount: -1850,
    status: 'Completed',
  },
  {
    id: 't16',
    name: 'Equinox Gym',
    category: 'Health',
    kind: 'gym',
    method: 'Card •••• 9034',
    date: '2026-10-01T06:30',
    amount: -45,
    status: 'Failed',
  },
]

export const BILLS = [
  { id: 'b1', name: 'Rent', kind: 'home', due: 'Nov 1', days: 4, amount: 1850, paid: false },
  { id: 'b2', name: 'Electricity', kind: 'fuel', due: 'Nov 4', days: 7, amount: 96.4, paid: false },
  { id: 'b3', name: 'Fiber Internet', kind: 'wifi', due: 'Nov 6', days: 9, amount: 59.99, paid: false },
  { id: 'b4', name: 'Netflix', kind: 'stream', due: 'Nov 9', days: 12, amount: 15.49, paid: true },
  { id: 'b5', name: 'Spotify', kind: 'music', due: 'Nov 12', days: 15, amount: 10.99, paid: true },
  { id: 'b6', name: 'Equinox Gym', kind: 'gym', due: 'Nov 15', days: 18, amount: 45, paid: false },
]

export const NOTIFICATIONS = [
  { id: 'n1', icon: 'arrowDown', tone: 'green', title: 'Salary received', body: '$4,500.00 from Northwind Ltd', time: '2h', unread: true },
  { id: 'n2', icon: 'target', tone: 'accent', title: 'Emergency Fund hit 72%', body: 'Only $2,800 to go. Keep it up!', time: '5h', unread: true },
  { id: 'n3', icon: 'alert', tone: 'red', title: 'Shopping is over budget', body: 'You spent $780 of $600 this month', time: '1d', unread: true },
  { id: 'n4', icon: 'receipt', tone: '', title: 'Rent is due in 4 days', body: '$1,850.00 to Oakwood Apts', time: '1d', unread: false },
  { id: 'n5', icon: 'shield', tone: '', title: 'New sign-in on MacBook Pro', body: 'Lisbon, Portugal', time: '3d', unread: false },
]

export const REPORTS = [
  { id: 'r1', q: 'Q4 2025', title: 'Annual Performance', date: 'Jan 12, 2026', size: '2.4 MB', bars: [42, 55, 48, 62, 70, 66, 81, 92] },
  { id: 'r2', q: 'Q3 2025', title: 'Growth Report', date: 'Oct 3, 2025', size: '1.8 MB', bars: [30, 38, 45, 41, 52, 60, 58, 74] },
  { id: 'r3', q: 'Q2 2025', title: 'Expense Report', date: 'Jul 6, 2025', size: '1.2 MB', bars: [64, 58, 70, 52, 49, 55, 46, 40] },
  { id: 'r4', q: 'Q1 2025', title: 'Tax Summary', date: 'Apr 9, 2025', size: '960 KB', bars: [22, 34, 30, 46, 40, 52, 48, 58] },
  { id: 'r5', q: 'Sep 2026', title: 'Monthly Statement', date: 'Oct 1, 2026', size: '640 KB', bars: [48, 52, 44, 60, 66, 58, 72, 70] },
  { id: 'r6', q: 'FY 2025', title: 'Net Worth Snapshot', date: 'Jan 2, 2026', size: '3.1 MB', bars: [36, 44, 51, 58, 63, 71, 78, 88] },
]

export const CARDS = [
  { id: 'k1', skin: 'onyx', label: `${BRAND.name} Black`, number: '5412 7534 9921 4821', holder: PERSON.name, exp: '09/29', cvv: '417' },
  { id: 'k2', skin: 'ember', label: `${BRAND.name} Ember`, number: '5244 1102 7743 9034', holder: PERSON.name, exp: '03/28', cvv: '902' },
  { id: 'k3', skin: 'ocean', label: 'Travel Card', number: '4532 8890 1265 7710', holder: PERSON.name, exp: '11/27', cvv: '258' },
]

export const WALLETS = [
  { code: 'USD', name: 'US Dollar', flag: 'us', amount: 128430.5, usd: 128430.5 },
  { code: 'EUR', name: 'Euro', flag: 'eu', amount: 12840.2, usd: 13956.74 },
  { code: 'GBP', name: 'British Pound', flag: 'gb', amount: 6210.75, usd: 7861.71 },
  { code: 'JPY', name: 'Japanese Yen', flag: 'jp', amount: 482000, usd: 3183.62 },
]

/* ---------------- 52 weeks of daily spending ---------------- */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const HEAT_END = new Date(2026, 9, 28)

export const HEAT = (() => {
  const r = rng(7)
  const end = HEAT_END
  const dow = (end.getDay() + 6) % 7
  const start = new Date(end)
  start.setDate(end.getDate() - dow - 51 * 7)
  const weeks = []
  for (let w = 0; w < 52; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      const future = date > end
      let amt = future ? 0 : Math.round(r() ** 1.7 * (d >= 5 ? 430 : 270) + (w / 52) * 40)
      if (!future && r() < 0.13) amt = 0
      days.push({ date: isoDay(date), amt, future })
    }
    weeks.push(days)
  }
  return weeks
})()
