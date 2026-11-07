/* ------------------------------------------------------------------
   Grace's brain: a small, local intent engine. It reads the live app
   state (balance, budgets, goals, bills…) and can act on it through the
   same functions the dashboard uses. Understands a bit of Roman Urdu.

   Replies are written in the current language (see i18n.js). Chips are
   { q, label }: the label is shown translated, while q is the English
   command sent back in, so a tapped chip works in every language.

   respond(text, app, memory) → {
     text,                 // **bold**, newlines and "• " bullets
     mood?,                // 'happy' | 'idle'
     card?,                // { type: 'bars' | 'stats' | 'tx', … }
     confirm?,             // { label, note, run, done }: needs a tap
     run?,                 // fires as soon as the reply lands
     links?,               // [{ label, run }]: quick navigation
     chips?,               // follow-up prompts
   }
   ------------------------------------------------------------------ */
import { isoDay, localIso, money, whole } from './format'
import { getLocale, LOCALES, t, tName } from './i18n'
import { COINS, COUNTRIES, CURRENCY_WORDS, homeCountry, loadCoins, loadHolidays, loadRates } from './live'
import { billDue } from './stats'
import {
  afford,
  alerts,
  anomalies,
  compareMonths,
  findTransactions,
  forecast,
  nowFor,
  parseRange,
  parseTarget,
  planGoal,
  subscriptions,
} from './insights'
import { accountWords, fixTypos } from './typos'
import { ASSISTANT, BRAND } from '../config'
import { CAT_COLORS, CURRENCIES } from '../data/seed'

/** A follow-up prompt: shown translated, sent back in English. */
const chip = (q, key = q, vars) => ({ q, label: t(key, vars) })

export const STARTERS = [
  'Give me a summary',
  'What’s my balance?',
  'Where did my money go?',
  'Any bills due?',
  'Send $50 to Maya',
  'How are my goals?',
  'Switch to dark mode',
  'Give me a saving tip',
  'I spent $25 on lunch',
  'What’s $100 in euros?',
  'Bitcoin price',
  'Any bank holidays soon?',
]

/** The starter chips in the current language. */
export const starters = (contacts = []) => {
  const who = contacts[0]?.name.split(' ')[0]
  return STARTERS.flatMap((s) => {
    if (s !== 'Send $50 to Maya') return [chip(s)]
    return who ? [chip(`Send $50 to ${who}`, 'Send {amount} to {name}', { amount: '$50', name: who })] : []
  })
}

const norm = (s) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim()

const parseAmount = (s) => {
  const m = s.match(/(?:\$|usd\s?)?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)
  return n > 0 ? n : null
}

const firstName = (name) => name.split(' ')[0]
const words = (s) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3)

const word = (s, w) => new RegExp(`\\b${w}\\b`).test(s)
const named = (s, name) => s.includes(name.toLowerCase()) || words(name).some((w) => word(s, w))

const findContact = (s, list) => list.find((c) => word(s, firstName(c.name).toLowerCase()))
const findGoal = (s, list) => list.find((g) => named(s, g.name))
const findBudget = (s, list) =>
  list.find((b) => named(s, b.name)) ??
  (/\b(groceries|grocery|restaurants?|coffee|khana)\b/.test(s) ? list.find((b) => b.id === 'food') : null) ??
  (/\b(rent|house|ghar)\b/.test(s) ? list.find((b) => b.id === 'housing') : null) ??
  (/\b(uber|fuel|gas|car|travel)\b/.test(s) ? list.find((b) => b.id === 'transport') : null)
const findBill = (s, list) =>
  list.find((b) => named(s, b.name)) ??
  list.find((b) => words(b.name).some((w) => s.split(/[^a-z]+/).some((x) => x.length >= 4 && (w.startsWith(x) || x.startsWith(w)))))

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const signedPct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`
const tone = (p) => (p > 1 ? 'var(--red)' : p > 0.9 ? 'var(--amber)' : 'var(--accent)')

const NAV = [
  { re: /analytic|insight/, label: 'Analytics', to: ['analytics'] },
  { re: /wallet|my cards|currenc/, label: 'Wallet', to: ['wallet'] },
  { re: /budget/, label: 'Budget', to: ['budget'] },
  { re: /transaction|history|activity/, label: 'Transactions', to: ['dashboard', { tab: 'transactions' }] },
  { re: /report|statement/, label: 'Reports', to: ['dashboard', { tab: 'reports' }] },
  { re: /transfer/, label: 'Transfer', to: ['transfer'] },
  { re: /dashboard|home|overview|main/, label: 'Dashboard', to: ['dashboard', { tab: 'overview' }] },
]

const JOKES = [
  'Why did the dollar break up with the euro? It needed some **change**. 💸',
  'My budget and I have a great relationship: I ignore it and it judges me silently. 🙈',
  'I told my wallet a joke… it didn’t laugh. Too many **bills** on its mind. 😅',
]

/* ---------------- "I spent $300 on dinner": turning a sentence into a transaction ---------------- */
const EXPENSE_WORDS = [
  [
    'Food & Dining',
    /\b(dinner|lunch|breakfast|brunch|food|restaurant|coffee|cafe|caf[eé]|pizza|burger|groceries|grocery|supermarket|snacks?|meal|takeaway|takeout|drinks?|bar|khana|chai)\b/,
  ],
  ['Transport', /\b(uber|lyft|taxi|cab|fuel|gas|petrol|diesel|bus|train|metro|subway|parking|toll|ride|auto)\b/],
  ['Housing', /\b(rent|mortgage|landlord)\b/],
  ['Bills', /\b(electricity|electric|internet|wifi|phone bill|mobile bill|water bill|bill|subscription|recharge)\b/],
  ['Entertainment', /\b(movie|movies|cinema|netflix|spotify|concert|game|games|gaming|party|tickets?|club)\b/],
  ['Health', /\b(doctor|medicine|medicines|pharmacy|chemist|gym|hospital|dentist|clinic)\b/],
  ['Travel', /\b(hotel|flight|flights|airbnb|trip|vacation|holiday|travel)\b/],
  ['Shopping', /\b(clothes|shoes|shirt|dress|shopping|amazon|mall|gadget|phone|laptop|gift|present)\b/],
]
const INCOME_WORDS = [
  ['Salary', /\b(salary|paycheck|pay ?check|wages?|got paid|payday)\b/],
  ['Freelance', /\b(freelanc\w*|client|gig|project|commission)\b/],
  ['Business', /\b(business|shop sales|sales|dividend|profit)\b/],
  ['Gift', /\b(gift|birthday|present)\b/],
  ['Refund', /\b(refund|cashback|cash back|returned)\b/],
]
const SPENT = /\b(spent|paid|bought|purchased|was charged|got charged|blew|kharch\w*|kharcha|lagaye|lagaya)\b/
const EARNED = /\b(earned|got paid|received|recieved|was paid|made|kamaye|kamaya|mile|mila)\b|\bgot\s+(?:\$|usd\s?|\d)/
const QUESTION = /^(how|what|did|do|when|where|why|which|show|tell|can|could|should|is|are|am)\b|\?\s*$/

const titleCase = (x) => x.replace(/\b\w/g, (c) => c.toUpperCase())

/* the thing it was for: "on dinner with friends" → "Dinner with friends" */
function describe(raw) {
  const bought = raw.match(/\bbought\s+(?:an?\s+|some\s+|the\s+|new\s+)?([a-z][a-z' -]{1,30}?)(?:\s+(?:for|from|yesterday|today|at)\b|[.!,]|$)/i)
  if (bought) return titleCase(bought[1].trim())
  const m = raw.match(
    /\b(?:on|for|at|towards)\s+(?:an?\s+|the\s+|some\s+|my\s+)?([a-z][a-z' &-]{1,40}?)(?:\s+(?:yesterday|today|from|using|with my|last night|this morning)\b|[.!,]|$)/i,
  )
  if (!m) return null
  const what = m[1].replace(/\s+(pot|budget)$/i, '').trim()
  if (!what || /^\d/.test(what)) return null
  return titleCase(what)
}

/** Parse "spent / paid / bought … $amount …" (or got paid / received for income). */
export function parseLogged(raw, s, amount, pots) {
  if (!amount || QUESTION.test(s)) return null
  // "got paid", "received", "earned" mean money in, even though they contain words like "paid"
  const strongIn = /\b(got paid|was paid|get paid|received|recieved|earned|kamaye|kamaya)\b/.test(s)
  const out = !strongIn && SPENT.test(s)
  const inn = !out && EARNED.test(s) && !/\b(got to|got a question|made a goal)\b/.test(s)
  if (!out && !inn) return null
  const words = out ? EXPENSE_WORDS : INCOME_WORDS
  const category = words.find(([, re]) => re.test(s))?.[0] ?? (out ? 'Other' : 'Other income')
  const day = new Date()
  if (/\byesterday|last night|kal\b/.test(s)) day.setDate(day.getDate() - 1)
  const date = isoDay(day) === isoDay(new Date()) ? localIso() : `${isoDay(day)}T12:00`
  const pot = pots.find((p) => s.includes(p.name.toLowerCase()) || words.some(([c, re]) => c === category && re.test(p.name.toLowerCase())))
  const potNamed = pot && s.includes(pot.name.toLowerCase())
  return {
    type: out ? 'expense' : 'income',
    amount,
    category,
    name: describe(raw) ?? category,
    date,
    yesterday: isoDay(day) !== isoDay(new Date()),
    potId: potNamed ? pot.id : null,
    pot: potNamed ? pot : null,
  }
}

function core(raw, app) {
  const s = norm(raw)
  const me = app.user.first
  const { periods: PERIODS, incomeSources: INCOME_SOURCES, cashflow: CASHFLOW } = app.stats
  const p = PERIODS[app.period]
  const period = t(p.label.toLowerCase())
  const vsPeriod = t(p.vs.toLowerCase())
  const cur = CURRENCIES[app.currency]
  const amount = parseAmount(s)
  const contact = findContact(s, app.contacts)
  const goal = findGoal(s, app.goals)
  const bill = findBill(s, app.bills)
  const budget = findBudget(s, app.budgets)
  const go =
    (...to) =>
    () =>
      app.go(...to)
  const balanceText = money(app.balance * cur.rate, cur.symbol, cur.dp)
  const openBudget = { label: t('Open Budget'), run: go('budget') }

  /* ---------------- small talk ---------------- */
  if (/^(hi+|hey+|hello|helo|yo|salam|assalam|aoa|hola|sup|good (morning|afternoon|evening))\b/.test(s) && s.split(' ').length <= 5) {
    return {
      text: t('Hey {name}! 👋 Great to see you. Want a quick money summary, or should I help you get something done?', { name: me }),
      mood: 'happy',
      chips: [chip('Give me a summary'), chip('What can you do?'), chip('Any bills due?')],
    }
  }
  if (/(what can you do|help me|^help\b|how (do|can) you help|madad|kya kar sakt)/.test(s)) {
    return {
      text: t(
        'Here’s how I can help:\n• **Answer**: balance, income, spending, budgets, goals, bills\n• **Move money**: send, request, pay bills, top up goals\n• **Drive the dashboard**: open pages, dark mode, colours, currency, period\nJust ask like you would a friend 🙂',
      ),
      chips: [
        chip('What’s my balance?'),
        chip('Pay my rent'),
        chip('Add $100 to Emergency Fund', 'Add {amount} to {name}', { amount: '$100', name: t('Emergency Fund') }),
        chip('Make it blue'),
      ],
    }
  }
  if (/(thank|thx|shukriya|shukria|great job|awesome|love you|you'?re the best|nice one)/.test(s)) {
    return { text: t('Anytime! 💛 I’ll be right here in the corner.'), mood: 'happy' }
  }
  if (/(who are you|your name|what are you|kaun ho|tum kon)/.test(s)) {
    return {
      text: t('I’m **{name}**, your {brand} money buddy 🐕 I keep an eye on your accounts and can do things for you right here.', {
        name: ASSISTANT.name,
        brand: BRAND.name,
      }),
      mood: 'happy',
    }
  }
  if (/(joke|make me laugh|funny)/.test(s)) {
    return { text: t(JOKES[Math.floor(Math.random() * JOKES.length)]), mood: 'happy', chips: [chip('Another one'), chip('Give me a saving tip')] }
  }
  if (/^another one$/.test(s)) return core('joke', app)
  if (/(dance|jump|celebrate|party|be happy|khush)/.test(s)) {
    return { text: t('Wheee! 🎉 Every dollar saved deserves a little dance.'), mood: 'happy' }
  }

  /* ---------------- appearance & controls ---------------- */
  if (/\bdark\b/.test(s) || /(lights? off|night mode)/.test(s)) {
    if (app.theme === 'dark') return { text: t('We’re already in dark mode 🌙') }
    return { text: t('Lights off 🌙 Switching to dark mode.'), run: () => app.switchTheme('dark'), mood: 'happy' }
  }
  if (/\blight (mode|theme)|light karo|lights? on|day mode|\bwhite (mode|theme)/.test(s)) {
    if (app.theme === 'light') return { text: t('We’re already in light mode ☀️') }
    return { text: t('Good morning ☀️ Switching to light mode.'), run: () => app.switchTheme('light'), mood: 'happy' }
  }
  const ACCENT = { orange: 'orange', blue: 'blue', green: 'green', violet: 'violet', purple: 'violet', rose: 'rose', pink: 'rose' }
  const accentWord = Object.keys(ACCENT).find((w) => new RegExp(`\\b${w}\\b`).test(s))
  if (accentWord && /(colou?r|accent|theme|make it|change|switch|karo|kar do|go)/.test(s)) {
    const next = ACCENT[accentWord]
    return { text: t('Fresh coat of paint 🎨 Accent is now **{color}**.', { color: t(next) }), run: () => app.setAccent(next), mood: 'happy' }
  }
  if (/live/.test(s) && /(pause|stop|off|band|freeze)/.test(s)) {
    return { text: t('Paused live updates ⏸ Your numbers will stay still.'), run: () => app.setLive(false) }
  }
  if (/live/.test(s) && /(resume|start|on\b|chalu|turn on)/.test(s)) {
    return { text: t('Live updates are back on 📡'), run: () => app.setLive(true) }
  }
  const CUR = [
    [/(euro|\beur\b|€)/, 'EUR'],
    [/(pound|\bgbp\b|£|sterling)/, 'GBP'],
    [/(\byen\b|\bjpy\b|¥)/, 'JPY'],
    [/(dollar|\busd\b)/, 'USD'],
  ]
  const curHit = CUR.find(([re]) => re.test(s))
  if (curHit && /(show|switch|change|convert|in |to |balance|karo)/.test(s) && !/(send|transfer|pay|request|add|bhej)/.test(s)) {
    const c = CURRENCIES[curHit[1]]
    return {
      text: t('Done. Your balance is **{amount}** in {code}.', { amount: money(app.balance * c.rate, c.symbol, c.dp), code: c.code }),
      run: () => app.setCurrency(c.code),
    }
  }
  const per = s.match(/(this|last|current) (week|month|quarter|year)/)
  if (per && /(show|switch|change|set|view|period|filter|for)/.test(s) && !/(spen|income|earn)/.test(s)) {
    const key = per[2]
    const np = PERIODS[key]
    return {
      text: t('Switched the dashboard to **{period}**: income {income}, expenses {expenses}, net {net}.', {
        period: t(np.label),
        income: whole(np.income),
        expenses: whole(np.expenses),
        net: whole(np.net),
      }),
      run: () => app.setPeriod(key),
    }
  }

  /* ---------------- "I spent $300 on dinner" / "got paid $2,000" ---------------- */
  const logged = !contact ? parseLogged(raw, s, amount, app.pots ?? []) : null
  if (logged) {
    const when = logged.yesterday ? t('yesterday') : t('today')
    const cat = t(logged.category)
    if (logged.type === 'expense') {
      const budget = app.budgets.find((b) => b.name === logged.category)
      const after = app.balance - logged.amount
      const notes = [
        budget
          ? t('That brings {name} to {spent} of your {limit} budget.', {
              name: cat,
              spent: whole(budget.spent + logged.amount),
              limit: whole(budget.limit),
            })
          : null,
        after < 0 ? t('Heads up: this takes your balance below zero.') : null,
      ].filter(Boolean)
      return {
        text:
          t('Got it. Add **{amount}** for **{name}** under {category} ({when})?', {
            amount: money(logged.amount),
            name: t(logged.name),
            category: cat,
            when,
          }) + (notes.length ? `\n${notes.join(' ')}` : ''),
        confirm: {
          label: t('Add expense'),
          note: logged.pot
            ? t('{category} · from {pot}', { category: cat, pot: t(logged.pot.name) })
            : t('{category} · from your balance', { category: cat }),
          effect: { balance: -logged.amount, free: logged.potId ? 0 : -logged.amount },
          run: () =>
            app.addTransaction({
              name: logged.name,
              amount: -logged.amount,
              category: logged.category,
              date: logged.date,
              method: t('Added by {name}', { name: ASSISTANT.name }),
              potId: logged.potId,
            }),
          done: t('Added ✅ {amount} for {name}. Your balance is now {balance}.', {
            amount: money(logged.amount),
            name: t(logged.name),
            balance: money(after),
          }),
        },
        chips: [chip('Where did my money go?'), chip('Am I over budget?')],
      }
    }
    return {
      text: t('Nice! Add **{amount}** from {name} as {category} ({when})?', {
        amount: money(logged.amount),
        name: t(logged.name),
        category: cat,
        when,
      }),
      confirm: {
        label: t('Add income'),
        note: logged.pot
          ? t('{category} · into {pot}', { category: cat, pot: t(logged.pot.name) })
          : t('{category} · into unassigned', { category: cat }),
        effect: { balance: logged.amount, free: logged.potId ? 0 : logged.amount },
        run: () =>
          app.addMoney({
            amount: logged.amount,
            category: logged.category === 'Other income' ? 'Other income' : logged.category,
            name: logged.name,
            date: logged.date,
            potId: logged.potId,
          }),
        done: t('Added ✅ {amount}. Your balance is now {balance}.', { amount: money(logged.amount), balance: money(app.balance + logged.amount) }),
      },
      chips: [chip('How much is in my pots?'), chip('Give me a summary')],
    }
  }

  /* ---------------- money actions ---------------- */
  if (/(request|ask .*(to pay|for)|mang|maang)/.test(s) && !/payment request page/.test(s)) {
    if (contact && amount) {
      return {
        text: t('I’ll send {name} a request for **{amount}**. Shall I?', { name: contact.name, amount: money(amount) }),
        confirm: {
          label: t('Request {amount}', { amount: money(amount) }),
          note: t('From {name} · arrives instantly', { name: contact.name }),
          effect: { balance: 0, free: 0 },
          run: () => app.requestMoney({ from: contact.name, amount, note: t('Sent by {name}', { name: ASSISTANT.name }) }),
          done: t('Request sent ✅ {name} will see it right away.', { name: firstName(contact.name) }),
        },
      }
    }
    if (contact)
      return {
        text: t('How much should I ask {name} for?', { name: firstName(contact.name) }),
        chips: [50, 100, 250].map((v) =>
          chip(`Request $${v} from ${firstName(contact.name)}`, 'Request {amount} from {name}', { amount: `$${v}`, name: firstName(contact.name) }),
        ),
      }
    return {
      text: t('Who should I send the request to?'),
      chips: app.contacts.slice(0, 4).map((c) =>
        chip(`Request $${amount ?? 50} from ${firstName(c.name)}`, 'Request {amount} from {name}', {
          amount: `$${amount ?? 50}`,
          name: firstName(c.name),
        }),
      ),
      links: [{ label: t('Open Payment Request'), run: () => app.openModal('request') }],
    }
  }

  if (/(new|create|add|make|start|set up) (a )?(new )?(savings )?goal/.test(s)) {
    return { text: t('Let’s set a new goal 🎯 I opened the form for you.'), run: () => app.openModal('goal'), mood: 'happy' }
  }
  if (goal && amount && /(add|put|save|move|deposit|fund|top ?up|dal|daal|transfer)/.test(s)) {
    const room = goal.target - goal.saved
    const gName = t(goal.name)
    if (room <= 0) return { text: t('{name} is already fully funded 🎉', { name: gName }), mood: 'happy' }
    const add = Math.min(amount, room)
    if (add > app.balance) return { text: t('That’s more than your balance ({amount}).', { amount: money(app.balance) }) }
    const after = pct(goal.saved + add, goal.target)
    return {
      text:
        t('Moving **{amount}** into {name} takes it to **{pct}%**.', { amount: money(add), name: gName, pct: after }) +
        (add < amount ? ` ${t('(Only {amount} was left to reach the target.)', { amount: whole(room) })}` : ''),
      confirm: {
        label: t('Add {amount}', { amount: money(add, '$', 0) }),
        note: t('To {name} · from your balance', { name: gName }),
        effect: { balance: -add, free: -add },
        run: () => app.fundGoal(goal.id, add),
        done:
          goal.saved + add >= goal.target
            ? t('Goal reached! 🎉 {name} is fully funded.', { name: gName })
            : t('Done ✅ {name} is now at {pct}%.', { name: gName, pct: after }),
      },
    }
  }
  if (budget && amount && /(set|change|increase|raise|lower|reduce|make|limit|to \$?\d)/.test(s) && /budget|limit/.test(s)) {
    const bName = t(budget.name)
    return {
      text: t('Set your **{name}** budget to **{amount}**? You’ve spent {spent} so far ({pct}% of the new limit).', {
        name: bName,
        amount: whole(amount),
        spent: whole(budget.spent),
        pct: pct(budget.spent, amount),
      }),
      confirm: {
        label: t('Set to {amount}', { amount: whole(amount) }),
        note: t('Was {amount}', { amount: whole(budget.limit) }),
        effect: { balance: 0, free: 0 },
        run: () => app.setBudgetLimit(budget.id, amount),
        done: t('Updated ✅ {name} now has a {amount} monthly limit.', { name: bName, amount: whole(amount) }),
      },
      links: [openBudget],
    }
  }
  if (/\bpay\b|bhar|jama/.test(s) && !contact && (bill || /bills?/.test(s))) {
    const unpaid = app.bills.filter((b) => !b.paid)
    if (/all|every|sab/.test(s)) {
      if (!unpaid.length) return { text: t('Every bill is already paid 🎉'), mood: 'happy' }
      const total = unpaid.reduce((sum, b) => sum + b.amount, 0)
      return {
        text: t('You have **{n} unpaid bills** totalling **{amount}**. Pay them all now?', { n: unpaid.length, amount: money(total) }),
        card: { type: 'bars', rows: unpaid.map((b) => ({ label: t(b.name), value: money(b.amount), p: 100, c: 'var(--accent)' })) },
        confirm: {
          label: t('Pay {amount}', { amount: money(total) }),
          note: t('{n} bills · from your balance', { n: unpaid.length }),
          effect: { balance: -total, free: -total },
          run: () => unpaid.forEach((b) => app.payBill(b.id)),
          done: t('All paid ✅ Nothing due for the next three weeks.'),
        },
      }
    }
    if (bill) {
      const name = t(bill.name)
      const due = tDue(billDue(bill).due)
      if (bill.paid) return { text: t('{name} is already paid for {date} ✅', { name, date: due }) }
      return {
        text: t('{name} is **{amount}**, due {date} (in {n} days). Pay it now?', { name, amount: money(bill.amount), date: due, n: bill.days }),
        confirm: {
          label: t('Pay {amount}', { amount: money(bill.amount) }),
          note: t('{name} · autopay account', { name }),
          effect: { balance: -bill.amount, free: -bill.amount },
          run: () => app.payBill(bill.id),
          done: t('Paid ✅ {name} is settled ahead of {date}.', { name, date: due }),
        },
      }
    }
  }
  if (/(send|transfer|bhej|\bpay\b)/.test(s) && !/(transfer page|transfer limits?)/.test(s) && (contact || amount)) {
    if (contact && amount) {
      if (amount > app.balance) return { text: t('That’s more than your balance of {amount} 😬', { amount: money(app.balance) }) }
      return {
        text: t('Sending **{amount}** to **{name}**. Your balance will be {after}.', {
          amount: money(amount),
          name: contact.name,
          after: money(app.balance - amount),
        }),
        confirm: {
          label: t('Send {amount}', { amount: money(amount) }),
          note: t('To {name} · instant · free', { name: contact.name }),
          effect: { balance: -amount, free: -amount },
          run: () => app.sendMoney({ to: contact.name, amount, note: t('Sent by {name}', { name: ASSISTANT.name }) }),
          done: t('Sent ✅ {amount} is on its way to {name}.', { amount: money(amount), name: firstName(contact.name) }),
        },
      }
    }
    if (contact) {
      return {
        text: t('How much should I send to {name}?', { name: firstName(contact.name) }),
        chips: [50, 100, 250].map((v) =>
          chip(`Send $${v} to ${firstName(contact.name)}`, 'Send {amount} to {name}', { amount: `$${v}`, name: firstName(contact.name) }),
        ),
      }
    }
    return {
      text: t('Who should get **{amount}**?', { amount: money(amount) }),
      chips: app.contacts
        .slice(0, 4)
        .map((c) => chip(`Send $${amount} to ${firstName(c.name)}`, 'Send {amount} to {name}', { amount: `$${amount}`, name: firstName(c.name) })),
    }
  }
  if (/(send|transfer) (some )?money|paise bhej|bhejna/.test(s)) {
    return { text: t('Opening **Send Money** for you 💸'), run: () => app.openModal('send') }
  }
  if (/(receive|account (number|details)|\biban\b|routing|\bqr\b|get paid|my details)/.test(s)) {
    return { text: t('Here are your account details. Share the QR or the link to get paid 📥'), run: () => app.openModal('receive') }
  }

  /* ---------------- pots ---------------- */
  if (/(add|record|put in|top up) (some )?(money|cash|income|funds)|paise (add|dal)/.test(s) && !goal && !contact) {
    return { text: t('Opening **Add money** 💰 Type in what you have and pick a pot for it.'), run: () => app.openModal('addMoney') }
  }
  if (/\b(pots?|unassigned|envelopes?|sorted|set aside)\b/.test(s)) {
    if (!app.pots.length)
      return {
        text: t('You don’t have any pots yet. Make pots like Rent, Food or Savings and split your money between them.'),
        links: [{ label: t('New pot'), run: () => app.openModal('pot') }],
      }
    const total = Math.max(app.inPots + Math.max(0, app.unassigned), 1)
    return {
      text: t('You have **{inPots}** in {n} pots and **{free}** unassigned.', {
        inPots: money(app.inPots),
        n: app.pots.length,
        free: money(app.unassigned),
      }),
      card: {
        type: 'bars',
        rows: [...app.pots]
          .sort((a, b) => b.amount - a.amount)
          .map((p, k) => ({
            label: t(p.name),
            value: money(p.amount),
            p: Math.round((p.amount / total) * 100),
            c: CAT_COLORS[k % CAT_COLORS.length],
            k,
          })),
      },
      links: [
        { label: t('Move money'), run: () => app.openModal('move') },
        { label: t('Open Wallet'), run: go('wallet') },
      ],
    }
  }

  /* ---------------- navigation ---------------- */
  const wantsNav = /(open|go to|goto|take me|navigate|jump to|kholo|khol do|le chalo|visit|switch to)/.test(s)
  const nav = NAV.find((n) => n.re.test(s))
  if (nav && (wantsNav || /^(show )?(the )?\w+( page| tab)?$/.test(s))) {
    return { text: t('Opening **{page}** for you 👉', { page: t(nav.label) }), run: () => app.go(...nav.to) }
  }

  /* ---------------- answers ---------------- */
  if (/(summary|overview|snapshot|how am i doing|how'?s my money|my finances|hisab|halat)/.test(s)) {
    const spent = app.budgets.reduce((sum, b) => sum + b.spent, 0)
    const limit = app.budgets.reduce((sum, b) => sum + b.limit, 0)
    const best = [...app.goals].sort((a, b) => b.saved / b.target - a.saved / a.target)[0]
    return {
      text:
        t('Here’s your snapshot for **{period}** 📊', { period }) +
        '\n' +
        (best
          ? t('You’ve used **{pct}%** of your budget, and **{goal}** is your closest goal at **{goalPct}%**.', {
              pct: pct(spent, limit),
              goal: t(best.name),
              goalPct: pct(best.saved, best.target),
            })
          : t('You’ve used **{pct}%** of your budget.', { pct: pct(spent, limit) })),
      card: {
        type: 'stats',
        items: [
          { label: t('Balance'), value: balanceText },
          { label: t('Income'), value: whole(p.income), note: signedPct(p.incomeDelta) },
          { label: t('Expenses'), value: whole(p.expenses), note: signedPct(p.expensesDelta) },
          { label: t('Net profit'), value: whole(p.net), note: signedPct(p.netDelta) },
        ],
      },
      chips: [chip('Where did my money go?'), chip('Give me a saving tip')],
    }
  }
  if (/(balance|how much (money )?(do )?i (have|got)|kitna paisa|kitne paise|paise kitne|balance kitna)/.test(s)) {
    return {
      text: app.stats.demo
        ? t('Your total balance is **{amount}**, up **+12.4%** vs last week. Nice work, {name}! 💪', { amount: balanceText, name: me })
        : t('Your total balance is **{amount}**, {name}.', { amount: balanceText, name: me }),
      mood: 'happy',
      chips: [chip('Show it in euros'), chip('Where did my money go?')],
    }
  }
  if (budget && /(spen|spent|kharch|budget|how much|cost|on )/.test(s)) {
    const r = budget.spent / budget.limit
    const bName = t(budget.name)
    const verdict =
      r > 1
        ? t('that’s **{amount} over** your {limit} budget 😬', { amount: whole(budget.spent - budget.limit), limit: whole(budget.limit) })
        : t('{amount} left of your {limit} budget', { amount: whole(budget.limit - budget.spent), limit: whole(budget.limit) }) +
          (r > 0.9 ? `. ${t('Getting close!')}` : ' 👍')
    const next = Math.ceil((budget.spent * 1.15) / 50) * 50
    return {
      text: `${t('You’ve spent **{amount}** on {name} this month', { amount: whole(budget.spent), name: bName })}: ${verdict}`,
      card: { type: 'bars', rows: [{ label: bName, value: `${pct(budget.spent, budget.limit)}%`, p: Math.min(100, r * 100), c: tone(r) }] },
      chips: [
        chip(`Set ${budget.name.split(' ')[0].toLowerCase()} budget to $${next}`, 'Set {name} budget to {amount}', {
          name: bName,
          amount: `$${next}`,
        }),
      ],
      links: [openBudget],
    }
  }
  if (/(income|earn|kamai|salary|freelance|business)/.test(s)) {
    const total = INCOME_SOURCES.reduce((sum, x) => sum + x.value, 0)
    return {
      text: t('You earned **{amount}** {period} ({delta} {vs}). Year to date, here’s where it comes from:', {
        amount: money(p.income),
        period,
        delta: signedPct(p.incomeDelta),
        vs: vsPeriod,
      }),
      card: {
        type: 'bars',
        rows: INCOME_SOURCES.map((x, i) => ({
          label: t(x.name),
          value: whole(x.value),
          p: pct(x.value, total),
          c: ['var(--solid)', 'var(--green)', 'var(--accent)'][i],
        })),
      },
      links: [{ label: t('Open Reports'), run: go('dashboard', { tab: 'reports' }) }],
    }
  }
  if (/(biggest|largest|most expensive|highest|sabse bara)/.test(s)) {
    const out = app.transactions.filter((x) => x.amount < 0).sort((a, b) => a.amount - b.amount)
    const top = out[0]
    return {
      text: top
        ? t('Your biggest expense was **{name}**: **{amount}** ({category}).', {
            name: top.name,
            amount: money(-top.amount),
            category: t(top.category),
          })
        : t('No expenses yet!'),
      card: { type: 'tx', rows: out.slice(0, 3) },
    }
  }
  if (/(where.*(money|it).*(go|went)|expense|spent|spending|spend\b|kharch|breakdown)/.test(s)) {
    const total = app.budgets.reduce((sum, b) => sum + b.spent, 0)
    const top = [...app.budgets].sort((a, b) => b.spent - a.spent)
    if (!total || !top.length)
      return {
        text: p.expenses
          ? t('You spent **{amount}** {period}, none of it in a budget category yet.', { amount: money(p.expenses), period })
          : t('You haven’t spent anything {period} yet. Add an expense and I’ll break it down for you.', { period }),
        links: [{ label: t('Add transaction'), run: () => app.openModal('transaction', { type: 'expense' }) }],
      }
    return {
      text: t('You spent **{amount}** {period} ({delta}). **{name}** is the biggest slice:', {
        amount: money(p.expenses),
        period,
        delta: signedPct(p.expensesDelta),
        name: t(top[0].name),
      }),
      card: {
        type: 'bars',
        rows: top.map((b, i) => ({
          label: t(b.name),
          value: whole(b.spent),
          p: pct(b.spent, total),
          c: CAT_COLORS[app.budgets.indexOf(b) % CAT_COLORS.length],
          k: i,
        })),
      },
      chips: [chip('Am I over budget?'), chip('Give me a saving tip')],
    }
  }
  if (/(profit|\bnet\b|how much (did )?i save|savings rate)/.test(s)) {
    return {
      text: t('Your net profit is **{amount}** {period} ({delta}). That’s a **{rate}%** savings rate. Excellent 🙌', {
        amount: money(p.net),
        period,
        delta: signedPct(p.netDelta),
        rate: ((p.net / p.income) * 100).toFixed(1),
      }),
      mood: 'happy',
    }
  }
  if (/(budget|over ?spen|over budget|limit)/.test(s)) {
    const spent = app.budgets.reduce((sum, b) => sum + b.spent, 0)
    const limit = app.budgets.reduce((sum, b) => sum + b.limit, 0)
    const over = app.budgets.filter((b) => b.spent > b.limit)
    const overNames = over.map((b) => t(b.name)).join(', ')
    return {
      text: `${t('You’ve used **{pct}%** of your {limit} budget.', { pct: pct(spent, limit), limit: whole(limit) })} ${
        over.length
          ? over.length > 1
            ? t('**{names}** are over the limit.', { names: overNames })
            : t('**{names}** is over the limit.', { names: overNames })
          : t('Every category is within its limit 🎉')
      }`,
      card: {
        type: 'bars',
        rows: [...app.budgets]
          .sort((a, b) => b.spent / b.limit - a.spent / a.limit)
          .map((b, k) => ({
            label: t(b.name),
            value: `${whole(b.spent)} / ${whole(b.limit)}`,
            p: Math.min(100, (b.spent / b.limit) * 100),
            c: tone(b.spent / b.limit),
            k,
          })),
      },
      links: [openBudget],
    }
  }
  if (/(tip|advice|save more|saving tip|bachat|how (can|do|should) i save|suggest|recommend)/.test(s)) {
    const tips = []
    const over = app.budgets.filter((b) => b.spent > b.limit)
    over.forEach((b) =>
      tips.push(
        t('**{name}** is {amount} over. Try a 48-hour pause before non-essential buys.', { name: t(b.name), amount: whole(b.spent - b.limit) }),
      ),
    )
    const subs = app.bills.filter((b) => ['stream', 'music', 'gym'].includes(b.kind))
    if (subs.length)
      tips.push(
        t('Your subscriptions cost **{amount}/mo**. Cancel one you rarely use.', { amount: money(subs.reduce((sum, b) => sum + b.amount, 0)) }),
      )
    const g = [...app.goals].sort((a, b) => a.saved / a.target - b.saved / b.target)[0]
    if (g) tips.push(t('An extra **$25 a week** into {name} adds {amount} a year.', { name: t(g.name), amount: whole(25 * 52) }))
    tips.push(t('Move savings on payday, not at month end. What you don’t see, you don’t spend.'))
    return {
      text: `${t('A few ideas for you 💡')}\n${tips
        .slice(0, 3)
        .map((x) => `• ${x}`)
        .join('\n')}`,
      chips: [chip('Am I over budget?'), chip('How are my goals?')],
    }
  }

  if (/(goal|saving|target|emergency|vacation|tesla)/.test(s)) {
    if (goal) {
      const left = Math.max(0, goal.target - goal.saved)
      const months = goal.monthly ? Math.ceil(left / goal.monthly) : null
      const gName = t(goal.name)
      const head = t('**{name}** is at **{pct}%**: {saved} of {target}.', {
        name: gName,
        pct: pct(goal.saved, goal.target),
        saved: whole(goal.saved),
        target: whole(goal.target),
      })
      const tail = left
        ? months
          ? t('{amount} to go, about **{n} months** at {monthly}/mo.', { amount: whole(left), n: months, monthly: whole(goal.monthly) })
          : t('{amount} to go.', { amount: whole(left) })
        : t('Fully funded 🎉')
      return {
        text: `${head} ${tail}`,
        chips: left
          ? [
              chip(`Add $100 to ${goal.name}`, 'Add {amount} to {name}', { amount: '$100', name: gName }),
              chip(`Add $500 to ${goal.name}`, 'Add {amount} to {name}', { amount: '$500', name: gName }),
            ]
          : [],
      }
    }
    if (!app.goals.length) return { text: t('You don’t have any goals yet. Want to start one?'), chips: [chip('Create a new goal')] }
    return {
      text: t('You’re saving for **{n} goals**. Here’s the progress:', { n: app.goals.length }),
      card: {
        type: 'bars',
        rows: app.goals.map((g, k) => ({ label: t(g.name), value: `${pct(g.saved, g.target)}%`, p: pct(g.saved, g.target), c: 'var(--accent)', k })),
      },
      chips: [
        chip(`Add $100 to ${app.goals[0].name}`, 'Add {amount} to {name}', { amount: '$100', name: t(app.goals[0].name) }),
        chip('Create a new goal'),
      ],
    }
  }
  if (/(bill|due|upcoming|subscription|rent\b)/.test(s)) {
    const unpaid = app.bills.filter((b) => !b.paid)
    if (!unpaid.length) return { text: t('No bills due. Everything’s paid 🎉'), mood: 'happy' }
    const total = unpaid.reduce((sum, b) => sum + b.amount, 0)
    return {
      text: t('**{n} bills** coming up, **{amount}** in total. {name} is next, due {date}.', {
        n: unpaid.length,
        amount: money(total),
        name: t(unpaid[0].name),
        date: tDue(billDue(unpaid[0]).due),
      }),
      card: {
        type: 'bars',
        rows: unpaid.map((b, k) => ({
          label: `${t(b.name)} · ${tDue(billDue(b).due)}`,
          value: money(b.amount),
          p: Math.max(8, 100 - b.days * 5),
          c: b.days <= 5 ? 'var(--red)' : 'var(--accent)',
          k,
        })),
      },
      chips: [chip('Pay all my bills'), chip(`Pay ${unpaid[0].name.toLowerCase()}`, 'Pay {name}', { name: t(unpaid[0].name) })],
    }
  }
  if (/(transaction|recent|history|last (payment|purchase|transfer)|latest)/.test(s)) {
    return {
      text: t('Here are your latest transactions:'),
      card: { type: 'tx', rows: app.transactions.slice(0, 4) },
      links: [{ label: t('See all transactions'), run: go('dashboard', { tab: 'transactions' }) }],
    }
  }
  if (/(cash ?flow|money in|money out)/.test(s)) {
    const inn = CASHFLOW.income.reduce((sum, v) => sum + v, 0) * 1000
    const out = CASHFLOW.expenses.reduce((sum, v) => sum + v, 0) * 1000
    return {
      text: t('Over the last 12 months **{in}** came in and **{out}** went out. You kept **{kept}** 💚', {
        in: whole(inn),
        out: whole(out),
        kept: whole(inn - out),
      }),
      mood: 'happy',
    }
  }
  return {
    text: t(
      'Hmm, I’m not sure about that one yet 🤔 Try asking about your balance, spending, budgets, goals or bills, or tell me to send money, pay a bill or switch the theme.',
    ),
    chips: [chip('What can you do?'), chip('Give me a summary'), chip('Any bills due?')],
  }
}

/* bill due dates are stored as "Nov 4" */
const tDue = (d) => (d ?? '').replace(/^([A-Z][a-z]{2})/, (m) => t(m))

/* ==================================================================
   The front layer: safety first, then multi-step requests, follow-ups
   within the conversation and the smarter answers (search, alerts,
   forecasts, "can I afford it?", goal plans, pots), then everything
   above in core(). `memory` is per conversation, kept by the chat panel.
   ================================================================== */

const AMOUNT_TOKEN = /(?:\$|usd\s?)?\d[\d,]*(?:\.\d+)?\s?k?\b/i
const monthName = (d) =>
  t(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()])
const rangeLabel = (r) =>
  r.label.startsWith('past ')
    ? t('in the past {n} days', { n: r.label.split(' ')[1] })
    : /^[A-Z]/.test(r.label)
      ? t('in {month}', { month: t(r.label) })
      : t(r.label)
const whenWord = (days) => (days <= 0 ? t('today') : days === 1 ? t('tomorrow') : t('in {n} days', { n: days }))

/* ---------------- safety ---------------- */
function safety(raw, s) {
  const digits = raw.replace(/[\s-]/g, '')
  const secret =
    /\b(password|passcode|pin|cvv|cvc|otp|one[- ]time (code|password)|security code|login code)\b\s*(is|:|=)\s*\S/.test(s) ||
    /\b(pin|cvv|cvc|otp|code)\b\s*\d{3,}/.test(s) ||
    /\d{13,19}/.test(digits)
  if (secret)
    return {
      text: t(
        'Please don’t share passwords, PINs, codes or full card numbers here, not even with me. I’ll never ask for them. If you think someone else has them, change your password and call your bank.',
      ),
      mask: true,
    }
  if (
    !/^(what('?s| is| are| does)|explain|define|meaning)\b/.test(s) &&
    /\b(fraud|scam(med)?|stolen|hacked|unauthori[sz]ed|dispute|chargeback|someone (used|took|stole)|i didn'?t (make|do) (this|that)|identity theft)\b/.test(
      s,
    )
  )
    return {
      text: t(
        'I’m sorry, that sounds stressful. I can’t freeze cards or reverse charges. {brand} only tracks numbers you enter, so no real money moved here. For fraud or a disputed charge on a real card or account, contact your bank right away: they can freeze the card and investigate.',
        { brand: BRAND.name },
      ),
    }
  if (/\b(locked out|can'?t (log|sign) ?in|lost access|forgot (my )?password|reset (my )?password)\b/.test(s))
    return {
      text: t('Use **Forgot password?** on the login screen and we’ll email you a reset link. If the email doesn’t arrive, check your spam folder.'),
    }
  if (
    /\b(should i (buy|sell|invest|short)|which (stocks?|shares?|crypto|coins?|funds?|etfs?)|best (stocks?|crypto|investments?|funds?)|invest (in|my)|buy (bitcoin|btc|crypto|stocks?|shares?|eth|gold|etfs?)|stock tips?|good investment|price prediction)\b/.test(
      s,
    )
  )
    return {
      text: t(
        'I can’t give investment advice or tell you what to buy. I can share information, like how much you could set aside each month, but for investing decisions please talk to a licensed financial adviser.',
      ),
      chips: [chip('How much do I keep each month?'), chip('Give me a saving tip')],
    }
  return null
}

/* ---------------- help with the site, and what words mean ---------------- */
export const HELP = [
  [
    /(export|download).*(csv|transactions|spreadsheet|excel|statement)|where.*\bcsv\b/,
    'Go to **Dashboard › Transactions** and press **Export CSV** at the top right. Reports have their own **CSV** button on each card.',
    ['dashboard', { tab: 'transactions' }],
    'Open Transactions',
  ],
  [
    /how (do|can|to) (i )?(add|put( in)?|record) (some )?money|how.*add money/,
    'Press **Add money** on the balance card or the Wallet page, type the amount and where it came from, and pick a pot for it if you like. No bank needed.',
    ['wallet'],
    'Open Wallet',
  ],
  [
    /how (do|can|to) (i )?(make|create|use|set up) (a )?pots?|what (is|are) (a )?pots?\b/,
    'Pots split your money by what it’s for, like Rent or Savings. On the **Wallet** page press **New pot**, then use the arrows on a pot to move money in or out.',
    ['wallet'],
    'Open Wallet',
  ],
  [
    /what (is|does|'?s) unassigned|unassigned mean/,
    '**Unassigned** is money you have that isn’t in any pot yet. Move it into pots on the Wallet page.',
    ['wallet'],
    'Open Wallet',
  ],
  [
    /how (do|can|to) (i )?(make|create|add|set( up)?|start) (a )?(new )?(savings )?goal/,
    'On the Dashboard, press **Add Goal** on the My Savings Goals card. Give it a name and target, and top it up any time.',
    ['dashboard', { tab: 'overview' }],
    'Open Dashboard',
  ],
  [
    /how (do|can|to) (i )?add (a )?bill/,
    'Press **+** on the **Upcoming Bills** card (Dashboard or Wallet), then enter the name, amount and due date.',
    ['wallet'],
    'Open Wallet',
  ],
  [
    /how (do|can|to) (i )?add (a )?(contact|person|friend|someone)/,
    'Press **Add contact** on the Quick Transfer card, or **New** on the Transfer page.',
    ['transfer'],
    'Open Transfer',
  ],
  [
    /(change|switch|set).*\blanguage\b|how.*\blanguage\b/,
    'Press the language button (it shows **EN**, **ES** and so on) at the top right and pick a language.',
    null,
    null,
  ],
  [
    /how (do|can|to) (i )?(change|switch) (the )?(theme|colou?r|accent|look)/,
    'Open **Settings** (the gear at the top right) to pick light or dark and an accent colour. Or just tell me, like “make it blue”.',
    null,
    null,
  ],
  [
    /how (do|can|to) (i )?(change|set|edit|raise|lower) (a |my )?budgets?/,
    'On the **Budget** page, drag the **Monthly limit** slider on any category. Or tell me, like “set food budget to $500”.',
    ['budget'],
    'Open Budget',
  ],
  [
    /(delete|clear|erase|wipe|reset) (all )?(of )?(my )?(data|account|everything)|start (over|fresh|again)/,
    'Open the account menu (your picture or initials, top right) and choose **Clear my data**, then click again to confirm. That empties your dashboard.',
    null,
    null,
  ],
  [
    /how (do|can|to) (i )?(add|record|log|enter) (an? )?(expense|spending|purchase|transaction|income)/,
    'Press **Add transaction** on the Transactions tab, or just tell me, like “I spent $20 on lunch”.',
    ['dashboard', { tab: 'transactions' }],
    'Open Transactions',
  ],
  [
    /how (do|can|to) (i )?(send|transfer) money/,
    'Press **Send Money** on the balance card, pick a contact and an amount. Or tell me, like “send $50 to Nikhil”.',
    null,
    null,
  ],
]

export const TERMS = [
  [/\b(fees?)\b/, 'A **fee** is a charge for a service, like a monthly account fee or an ATM fee. Fees show up as expenses.'],
  [
    /\b(overdraft|overdrawn)\b/,
    'An **overdraft** is when you spend more than you have and your balance goes below zero. Banks often charge a fee or interest for it.',
  ],
  [
    /\b(apr|interest rate|interest)\b/,
    '**Interest** is the cost of borrowing money (or what you earn on savings). **APR** is that cost over a whole year, including fees, so you can compare offers.',
  ],
  [
    /\bpending\b/,
    'A **pending** transaction has started but isn’t finished yet, like a request someone hasn’t paid. It doesn’t count in your totals until it’s completed.',
  ],
  [
    /\b(refunds?)\b/,
    'A **refund** is money given back for something you returned or were overcharged for. Add it with **Add money** and pick **Refund**.',
  ],
  [
    /\b(chargebacks?)\b/,
    'A **chargeback** is when your bank reverses a card payment after you dispute it, for example for fraud or an item that never arrived.',
  ],
  [
    /\b(autopay|direct debit|standing order)\b/,
    '**Autopay** (a direct debit) lets a company take a bill from your account automatically each time it’s due.',
  ],
  [
    /\b(net profit|net income)\b/,
    '**Net profit** is your income minus your expenses for the period. Positive means you kept money; negative means you spent more than came in.',
  ],
  [
    /\b(savings rate)\b/,
    'Your **savings rate** is the share of your income you didn’t spend: net profit ÷ income. 20% means you kept $20 of every $100.',
  ],
  [
    /\b(cash ?flow)\b/,
    '**Cash flow** is money coming in versus money going out over time. The Cash Flow chart shows both lines for the last 6 or 12 months.',
  ],
  [
    /\b(emergency fund)\b/,
    'An **emergency fund** is money set aside for surprises, like a repair or losing income. A common aim is 3 to 6 months of expenses.',
  ],
  [/\b(budget)\b/, 'A **budget** is a limit you set for a category each month. The bar shows how much of it you’ve used.'],
  [
    /\b(subscriptions?)\b/,
    'A **subscription** is a regular charge for an ongoing service, like streaming or a gym. They’re easy to forget, so ask me to list yours.',
  ],
  [/\b(balance)\b/, 'Your **balance** is all the money you’ve recorded: everything added minus everything spent.'],
]

function siteHelp(s, app) {
  for (const [re, text, to, label] of HELP) {
    if (re.test(s)) return { text: t(text), links: to ? [{ label: t(label), run: () => app.go(...to) }] : undefined }
  }
  if (/^(what('?s| is| are| does)|meaning of|define|explain|what do you mean by)\b/.test(s) && !/\b(my|i|me)\b/.test(s)) {
    const hit = TERMS.find(([re]) => re.test(s))
    if (hit) return { text: t(hit[1]) }
  }
  return null
}

/* ---------------- finding transactions ---------------- */
const FIND_VERB =
  /\b(show|find|list|search|see|look up|what did i (spend|buy|pay|earn)|how much (did|have) i (spend|spent|pay|paid|earn|earned|make|made)|did i (spend|buy|pay)|transactions?|purchases?|charges?|payments?|spending on|spent on|paid for)\b/

function filterFrom(s, app, now) {
  const range = parseRange(s, now)
  const dir = /\b(earn|earned|made|income|received|got paid)\b/.test(s)
    ? 'in'
    : /\b(spend|spending|spent|buy|bought|pay|paid|purchases?|charges?|cost|costs|expenses?)\b/.test(s)
      ? 'out'
      : undefined
  const category = app.budgets.find((b) => s.includes(b.name.toLowerCase()))?.name ?? EXPENSE_WORDS.find(([, re]) => re.test(s))?.[0] ?? null
  const names = [...new Set(app.transactions.flatMap((x) => x.name.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length >= 4))]
  const words = names.filter((w) => new RegExp(`\\b${w}\\b`).test(s) && !['transfer', 'request', 'payment', 'salary', 'from'].includes(w))
  const min = s.match(/\b(?:over|above|more than|bigger than|greater than)\s*\$?(\d[\d,]*)/)
  const max = s.match(/\b(?:under|below|less than|smaller than)\s*\$?(\d[\d,]*)/)
  return {
    range,
    dir,
    category: words.length ? null : category,
    words,
    min: min ? Number(min[1].replace(/,/g, '')) : null,
    max: max ? Number(max[1].replace(/,/g, '')) : null,
  }
}

function finderReply(filter, app) {
  const { rows } = findTransactions(app.transactions, filter)
  const when = filter.range ? ` ${rangeLabel(filter.range)}` : ''
  const what = filter.words?.length
    ? ` ${t('for {name}', { name: filter.words.map((w) => w[0].toUpperCase() + w.slice(1)).join(', ') })}`
    : filter.category
      ? ` ${t('on {name}', { name: t(filter.category) })}`
      : ''
  const size =
    filter.min != null
      ? ` ${t('over {amount}', { amount: whole(filter.min) })}`
      : filter.max != null
        ? ` ${t('under {amount}', { amount: whole(filter.max) })}`
        : ''
  const memory = { lastFilter: filter }
  const chips = [chip('and last month', 'And last month?'), chip('and this month', 'And this month?')].filter(
    (c) => !filter.range || !filter.range.label.includes(c.q.replace('and ', '')),
  )
  if (!rows.length) return { text: t('No transactions{when}{what}{size}.', { when, what, size }), memory, chips }
  const out = rows.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0)
  const inn = rows.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0)
  const sum =
    filter.dir === 'in' || (!out && inn)
      ? t('**{amount}** came in', { amount: money(inn) })
      : filter.dir === 'out' || !inn
        ? t('**{amount}** went out', { amount: money(out) })
        : t('**{out}** went out and **{in}** came in', { out: money(out), in: money(inn) })
  return {
    text:
      rows.length === 1
        ? t('Found **1 transaction**{when}{what}{size}: {sum}.', { when, what, size, sum })
        : t('Found **{n} transactions**{when}{what}{size}: {sum}.', { n: rows.length, when, what, size, sum }),
    card: { type: 'tx', rows: rows.slice(0, 5) },
    links: rows.length > 5 ? [{ label: t('See all transactions'), run: () => app.go('dashboard', { tab: 'transactions' }) }] : undefined,
    memory,
    chips,
  }
}

/* ---------------- moving money between pots ---------------- */
function findPot(text, pots) {
  if (!text) return null
  return (
    pots.find((p) => text.includes(p.name.toLowerCase())) ?? pots.find((p) => words(p.name).some((w) => new RegExp(`\\b${w}\\b`).test(text))) ?? null
  )
}

function potMove(s, amount, app) {
  if (!amount || !app.pots?.length) return null
  if (!/\b(move|put|transfer|shift|add|take|pull|withdraw|top ?up)\b/.test(s)) return null
  const fromText = s.match(/\b(?:from|out of)\s+(?:my\s+|the\s+)?([a-z][a-z ]{1,30}?)(?:\s+(?:pot|to|into|and)\b|$)/)?.[1]
  const toText = s.match(/\b(?:to|into|in)\s+(?:my\s+|the\s+)?([a-z][a-z ]{1,30}?)(?:\s+(?:pot|from)\b|$)/)?.[1]
  const fromPot = findPot(fromText, app.pots)
  const toPot = findPot(toText, app.pots)
  const goal = findGoal(s, app.goals)
  // "add $100 to Emergency Fund" is a goal; only treat it as a pot when clearly about pots
  if (!fromPot && !toPot) return null
  if (goal && !/\b(move|shift|transfer|pot)\b/.test(s)) return null
  const from = fromPot ? fromPot.id : 'unassigned'
  const to = toPot ? toPot.id : 'unassigned'
  if (from === to) return null
  const label = (id) => (id === 'unassigned' ? t('Unassigned') : t(app.pots.find((p) => p.id === id).name))
  const have = from === 'unassigned' ? Math.max(0, app.unassigned) : fromPot.amount
  if (amount > have)
    return { text: t('{name} only has {amount}, so I can’t move {want}.', { name: label(from), amount: money(have), want: money(amount) }) }
  return {
    text: t('Move **{amount}** from {from} to **{to}**?', { amount: money(amount), from: label(from), to: label(to) }),
    confirm: {
      label: t('Move {amount}', { amount: money(amount) }),
      note: t('{from} → {to}', { from: label(from), to: label(to) }),
      effect: { balance: 0, free: from === 'unassigned' ? -amount : to === 'unassigned' ? amount : 0 },
      run: () => app.moveMoney({ from, to, amount }),
      done: t('Moved ✅ {amount} is now in {to}.', { amount: money(amount), to: label(to) }),
    },
  }
}

/* ---------------- the smarter answers ---------------- */
function smart(raw, s, app) {
  const now = nowFor(app)
  const amount = parseAmount(s)

  // what Grace did, and why
  if (
    /(why did you (do|make|send|pay|add|move|that)|what did you (just )?do|your (activity|history|log)|grace'?s (activity|history|log)|what have you done)/.test(
      s,
    )
  ) {
    const last = app.activity?.[0]
    if (!last) return { text: t('I haven’t done anything on your account yet.') }
    return {
      text: t('The last thing I did was **{action}** ({detail}), {when}.\nWhy: {reason}', {
        action: last.action,
        detail: last.detail,
        when: new Date(last.at).toLocaleString(),
        reason: last.reason,
      }),
      links: [{ label: t('See all activity'), run: () => app.openModal('activity') }],
    }
  }

  const help = siteHelp(s, app)
  if (help) return help

  if (/(what can you do|what else can you do|^help\b|how (do|can) you help|madad|kya kar sakt)/.test(s)) {
    return {
      text: t(
        'Here’s what I can do:\n• **Answer** about your balance, spending, budgets, goals, bills and pots\n• **Find** transactions, like “what did I spend on food last week”\n• **Warn** you about bills, budgets and unusual charges, and forecast your month\n• **Plan**: “can I afford $1,200 in March?” or “save $5k by June”\n• **Do things**: record spending, send or request money, pay bills, move money between pots, top up goals, several in a row\nJust ask like you would a friend 🙂',
      ),
      chips: [chip('Any alerts?'), chip('What did I spend last week?'), chip('Can I afford $500?'), chip('I spent $25 on lunch')],
    }
  }

  // heads-ups
  if (
    /(any (alerts?|warnings?|heads ?ups?|news)|anything i should know|what should i know|insights?\b|how am i (looking|tracking))/.test(s) &&
    !/\b(open|go to|take me|page)\b/.test(s)
  ) {
    const list = alerts(app, now)
    if (!list.length) return { text: t('All quiet 👍 No bills you can’t cover, no budgets near the limit and nothing unusual.'), mood: 'happy' }
    return {
      text: `${t('Here’s what I’d keep an eye on:')}\n${list.map((a) => `• ${alertText(a)}`).join('\n')}`,
      chips: [chip('Forecast my month'), chip('Any unusual charges?')],
    }
  }

  // unusual charges
  if (
    /(unusual|suspicious|weird|strange|odd|duplicate|double)\b.*\b(charges?|transactions?|payments?|spend\w*|activity)|charged twice|any duplicates?|anything (unusual|weird|odd|strange|suspicious)/.test(
      s,
    )
  ) {
    const list = anomalies(app.transactions)
    if (!list.length) return { text: t('Nothing unusual. No duplicate charges, odd spikes or price rises that I can see.'), mood: 'happy' }
    return {
      text: `${t('A few things stand out:')}\n${list
        .slice(0, 5)
        .map((a) => `• ${anomalyText(a)}`)
        .join('\n')}\n${t('If one is a mistake, fix it in Transactions. For a real card charge you don’t recognise, call your bank.')}`,
      card: {
        type: 'tx',
        rows: list
          .filter((a) => a.tx)
          .slice(0, 3)
          .map((a) => a.tx),
      },
    }
  }

  // subscriptions
  if (/(subscriptions?|recurring|repeat(ing)? (charges|payments)|paying (for )?every month|forgotten (charges|subscriptions))/.test(s)) {
    const subs = subscriptions(app.transactions, app.bills)
    if (!subs.items.length) return { text: t('I don’t see any subscriptions or repeat charges yet.') }
    const hikes = subs.items.filter((i) => i.previous != null && i.amount > i.previous + 0.009)
    return {
      text:
        t('You have **{n}** subscriptions and repeat charges costing about **{monthly}** a month (**{yearly}** a year).', {
          n: subs.items.length,
          monthly: money(subs.monthly),
          yearly: whole(subs.yearly),
        }) +
        (hikes.length
          ? `\n${hikes.map((h) => `• ${t('**{name}** went up from {from} to {to}.', { name: h.name, from: money(h.previous), to: money(h.amount) })}`).join('\n')}`
          : '') +
        `\n${t('I can’t cancel them for you. If you don’t use one, cancel it with the company directly.')}`,
      card: {
        type: 'bars',
        rows: subs.items.slice(0, 6).map((i, k) => ({
          label: i.name,
          value: `${money(i.amount)}/${t('mo')}`,
          p: Math.round((i.amount / Math.max(...subs.items.map((x) => x.amount))) * 100),
          c: CAT_COLORS[k % CAT_COLORS.length],
          k,
        })),
      },
    }
  }

  // can I afford it?
  if (/(can i afford|afford|is it ok(ay)? (to|if i) (spend|buy)|can i (spend|buy|get))/.test(s) && amount) {
    const until = parseTarget(s, now)
    const a = afford(app, amount, until, now)
    const by = until ? ` ${t('by {month}', { month: monthName(until) })}` : ''
    const basis = t('That counts {free} you have free now, {bills} in bills still due, and about {surplus} a month you usually keep.', {
      free: money(a.free),
      bills: money(a.billTotal),
      surplus: money(Math.max(0, a.avg.surplus - a.goalMonthly)),
    })
    if (a.ok)
      return {
        text: `${t('Yes, you can afford **{cost}**{by}. You’d still have about **{left}** after it.', { cost: money(amount), by, left: money(a.after) })}\n${basis}`,
        mood: 'happy',
        chips: [chip(`I spent $${amount}`, 'I bought it'), chip('Forecast my month')],
      }
    return {
      text:
        `${t('Not comfortably. **{cost}**{by} would leave you about **{short}** short.', { cost: money(amount), by, short: money(a.shortBy) })}\n${basis}\n` +
        (a.months
          ? t('To make it, set aside about **{perMonth}** a month until then.', { perMonth: money(a.perMonth) })
          : t('You could wait a month or two, or move money from a pot.')) +
        (a.goalMonthly ? ` ${t('Pausing your goal contributions ({amount} a month) would also help.', { amount: money(a.goalMonthly) })}` : ''),
      chips: until
        ? [
            chip(
              `save $${amount} by ${['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'][until.getMonth()]}`,
              'Plan to save {amount}',
              { amount: money(amount) },
            ),
          ]
        : [],
    }
  }

  // plan a goal: "save $5k by June"
  if (amount && /\b(save|saving|put aside|set aside|need|plan)\b/.test(s) && parseTarget(s, now) && !parseLogged(raw, s, amount, app.pots ?? [])) {
    const until = parseTarget(s, now)
    const plan = planGoal(app, amount, until, now)
    const name =
      describe(
        raw.replace(
          /\b(by|in|before|until)\s+(next\s+\w+|\d{1,2}\s+(months?|weeks?)|jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\b/i,
          '',
        ),
      ) ?? t('Savings goal')
    const fit =
      plan.spare >= plan.monthly
        ? t('You usually keep about {spare} a month, so that fits.', { spare: money(plan.spare) })
        : t('You usually keep about {spare} a month, so you’re about {gap} a month short.', { spare: money(plan.spare), gap: money(plan.gap) }) +
          (plan.trim
            ? ` ${t('Cutting **{name}** by {amount} a month would close most of the gap.', { name: t(plan.trim.budget.name), amount: money(plan.trim.cut) })}`
            : '')
    return {
      text: `${t('To save **{target}** by **{when}**, put aside **{weekly}** a week ({monthly} a month) for {weeks} weeks.', {
        target: money(amount),
        when: monthName(plan.when),
        weekly: money(plan.weekly),
        monthly: money(plan.monthly),
        weeks: plan.weeks,
      })}\n${fit}`,
      confirm: {
        label: t('Create this goal'),
        note: t('{name} · {amount} a month', { name, amount: money(plan.monthly) }),
        effect: { balance: 0, free: 0 },
        run: () =>
          app.addGoal({
            name,
            target: amount,
            saved: 0,
            icon: 'sack',
            monthly: plan.monthly,
            due: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][plan.when.getMonth()]} ${plan.when.getFullYear()}`,
          }),
        done: t('Goal created ✅ I’ll track {name} for you.', { name }),
      },
    }
  }

  // end-of-month forecast
  if (/(forecast|end of (the )?month|month end|by (the )?end of|will i (have|run out|be short|make it)|how much will i have|predict)/.test(s)) {
    const fc = forecast(app, now)
    const lines = [
      t('**{amount}** in bills still due', { amount: money(fc.billTotal) }),
      t('about **{daily}** a day of everyday spending ({total} over {n} days)', {
        daily: money(fc.daily),
        total: money(fc.everyday),
        n: fc.daysLeft,
      }),
    ]
    return {
      text:
        `${t('By {date} I expect your balance to be about **{amount}**.', { date: `${monthName(fc.end)} ${fc.end.getDate()}`, amount: money(fc.endBalance) })}\n${lines.map((l) => `• ${l}`).join('\n')}` +
        (fc.endBalance < 0 ? `\n${t('That’s below zero, so trim spending or move money from a pot.')}` : ''),
      mood: fc.endBalance >= 0 ? 'happy' : undefined,
      card: fc.bills.length
        ? {
            type: 'bars',
            rows: fc.bills.map((b, k) => ({
              label: `${t(b.name)} · ${whenWord(b.days)}`,
              value: money(b.amount),
              p: Math.max(8, 100 - b.days * 4),
              c: 'var(--accent)',
              k,
            })),
          }
        : undefined,
    }
  }

  // why is spending up?
  if (
    /(why (is|are|did|has|was) (my )?(spending|expenses?|costs?|bills?)|spending (is |went |gone )?(up|higher)|spent more|more than last month|compared? (to|with) last month|vs\.? last month|spending change)/.test(
      s,
    )
  ) {
    const cmp = compareMonths(app.transactions, now)
    if (!cmp.total.now && !cmp.total.before) return { text: t('There’s no spending this month or last month to compare yet.') }
    const head =
      cmp.change > 0
        ? t('You’ve spent **{amount}** more than this time last month ({now} vs {before}).', {
            amount: money(cmp.change),
            now: money(cmp.total.now),
            before: money(cmp.total.before),
          })
        : cmp.change < 0
          ? t('You’ve actually spent **{amount}** less than this time last month ({now} vs {before}).', {
              amount: money(-cmp.change),
              now: money(cmp.total.now),
              before: money(cmp.total.before),
            })
          : t('Your spending is the same as this time last month ({now}).', { now: money(cmp.total.now) })
    const lines = cmp.rows
      .filter((r) => r.change)
      .slice(0, 3)
      .map((r) =>
        r.change > 0
          ? t('**{name}** up {amount}', { name: t(r.category), amount: money(r.change) }) +
            (r.biggest ? `, ${t('mostly {what} ({amount})', { what: r.biggest.name, amount: money(-r.biggest.amount) })}` : '')
          : t('**{name}** down {amount}', { name: t(r.category), amount: money(-r.change) }),
      )
    return {
      text: `${head}${lines.length ? `\n${lines.map((l) => `• ${l}`).join('\n')}` : ''}`,
      card: {
        type: 'bars',
        rows: cmp.rows
          .filter((r) => r.now)
          .slice(0, 5)
          .map((r, k) => ({
            label: t(r.category),
            value: money(r.now),
            p: Math.round((r.now / Math.max(...cmp.rows.map((x) => x.now), 1)) * 100),
            c: r.change > 0 ? 'var(--red)' : 'var(--green)',
            k,
          })),
      },
    }
  }

  // move money between pots
  const move = potMove(s, amount, app)
  if (move) return move

  // find transactions
  if (FIND_VERB.test(s) && !parseLogged(raw, s, amount, app.pots ?? [])) {
    const filter = filterFrom(s, app, now)
    const narrowed =
      filter.range || filter.words.length || filter.min != null || filter.max != null || (filter.category && /\b(show|find|list|search)\b/.test(s))
    if (narrowed) return finderReply(filter, app)
  }
  return null
}

function alertText(a) {
  if (a.kind === 'short')
    return t('**{bill}** ({amount}) is due {when} and you’ll be **{short}** short.', {
      bill: t(a.bill.name),
      amount: money(a.bill.amount),
      when: whenWord(a.bill.days),
      short: money(a.short),
    })
  if (a.kind === 'due')
    return t('**{bill}** ({amount}) is due {when}.', { bill: t(a.bill.name), amount: money(a.bill.amount), when: whenWord(a.bill.days) })
  if (a.kind === 'overdue') return t('**{bill}** is overdue ({amount}).', { bill: t(a.bill.name), amount: money(a.bill.amount) })
  if (a.kind === 'over') return t('**{name}** is {amount} over budget.', { name: t(a.budget.name), amount: money(a.by) })
  if (a.kind === 'near') return t('**{name}** is at {pct}% of its budget.', { name: t(a.budget.name), pct: a.pct })
  if (a.kind === 'odd') return anomalyText(a.anomaly)
  if (a.kind === 'forecast') return t('At this pace you’ll end the month at **{amount}**.', { amount: money(a.forecast.endBalance) })
  return ''
}

function anomalyText(a) {
  if (a.type === 'duplicate') return t('**{name}** was charged twice ({amount}). Worth checking.', { name: a.tx.name, amount: money(-a.tx.amount) })
  if (a.type === 'big')
    return t('**{name}** ({amount}) is much bigger than your usual {typical}.', {
      name: a.tx.name,
      amount: money(-a.tx.amount),
      typical: money(a.typical),
    })
  if (a.type === 'hike') return t('**{name}** went up from {from} to {to}.', { name: a.name, from: money(a.from), to: money(a.to) })
  return ''
}

/** Heads-ups for the chat's hello message (empty when there's nothing to say). */
export function greetingAlerts(app) {
  const list = [...alerts(app, nowFor(app)).map(alertText), ...holidayBills(app, nowFor(app), 7).map(holidayBillText)]
  return list.length ? `${t('Heads up:')}\n${list.map((a) => `• ${a}`).join('\n')}` : ''
}

/* ---------------- live data: exchange rates, crypto, holidays ---------------- */
const tag = () => LOCALES[getLocale()]?.tag ?? 'en'
const cash = (n, code) =>
  new Intl.NumberFormat(tag(), {
    style: 'currency',
    currency: code,
    maximumFractionDigits: code === 'JPY' || code === 'KRW' ? 0 : n !== 0 && Math.abs(n) < 1 ? 4 : 2,
  }).format(n)
const dayText = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${iso}T12:00`).toLocaleDateString(tag(), opts)
const OFFLINE = () => ({ text: t('I can’t reach that service right now. Check your connection and try again in a minute.') })
/* run an online lookup; any failure becomes a friendly reply */
const online = (work) => ({ later: () => work().catch(OFFLINE) })

const MONEY_ACTION =
  /\b(send|sent|pay|paid|request|transfer|spent|spend|bought|buy|add|move|put|take|save|saving|budget|goal|pot|earned|received|got|made|kharch\w*|bhej\w*)\b/

/** Currencies mentioned, in the order they appear: ['USD', 'EUR'] */
function currenciesIn(s) {
  return CURRENCY_WORDS.map(([code, re]) => [code, s.search(re)])
    .filter(([, at]) => at >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([code]) => code)
}

function convertIntent(s, app) {
  if (MONEY_ACTION.test(s)) return null
  const found = currenciesIn(s)
  const amount = parseAmount(s)
  const rateQ = /\b(exchange rates?|rates?|convert|conversion|worth|how much is)\b/.test(s)
  let from
  let to
  if (found.length >= 2) [from, to] = found
  else if (found.length === 1 && (amount || rateQ) && /\b(convert|in|to|into|worth|how much|rates?)\b/.test(s)) {
    to = found[0]
    from = app.currency !== to ? app.currency : 'USD'
    // "100 euros in my currency": the one named is where it comes from
    if (amount && new RegExp(`\\d[\\d,.]*\\s*k?\\s*(${CURRENCY_WORDS.find(([c]) => c === to)[1].source})`).test(s)) [from, to] = [to, app.currency]
  } else return null
  if (!from || !to || from === to) return null
  const n = amount ?? 1
  return online(async () => {
    const r = await loadRates()
    if (!r?.rates[from] || !r?.rates[to]) return OFFLINE()
    const rate = r.rates[to] / r.rates[from]
    const switchable = CURRENCIES[to] && to !== app.currency
    return {
      text: t('**{from}** is **{to}**.\nThat’s the European Central Bank rate from {date}: 1 {a} = {rate} {b}.', {
        from: cash(n, from),
        to: cash(n * rate, to),
        date: dayText(r.date, { day: 'numeric', month: 'long' }),
        a: from,
        b: to,
        rate: rate.toLocaleString(tag(), { maximumSignificantDigits: 5 }),
      }),
      chips: switchable
        ? [chip(`show my balance in ${to}`, 'Show my balance in {code}', { code: to })]
        : [chip(`${to} to ${from}`, '{a} to {b}', { a: to, b: from })],
    }
  })
}

function cryptoIntent(s, app) {
  if (SPENT.test(s) || EARNED.test(s)) return null
  let coins = COINS.filter(([, , , re]) => re.test(s))
  const priceQ = /\b(price|prices|worth|value|cost|trading|market|doing|today|now|rate|up|down|at)\b|how('?s| is)/.test(s)
  if (!coins.length && /\b(crypto|cryptos|cryptocurrency|cryptocurrencies|coins?)\b/.test(s) && priceQ) coins = COINS.slice(0, 3)
  // a bare "btc?" counts; otherwise ask about a price
  const bare =
    coins.length &&
    s
      .replace(/[^a-z ]/g, '')
      .trim()
      .split(' ').length <= 2
  if (!coins.length || !(priceQ || bare)) return null
  const vs = ['USD', 'EUR', 'GBP', 'JPY'].includes(app.currency) ? app.currency : 'USD'
  return online(async () => {
    const data = await loadCoins(coins.map(([id]) => id))
    const rows = coins.filter(([id]) => data?.[id]?.[vs.toLowerCase()] != null)
    if (!rows.length) return OFFLINE()
    const line = ([id, name]) => {
      const price = data[id][vs.toLowerCase()]
      const change = data[id][`${vs.toLowerCase()}_24h_change`] ?? 0
      return t('**{name}** is **{price}** ({change} in 24 hours).', { name, price: cash(price, vs), change: signedPct(change) })
    }
    return {
      text: `${rows.length === 1 ? line(rows[0]) : rows.map((c) => `• ${line(c)}`).join('\n')}\n${t('Prices from CoinGecko, for information only, not advice.')}`,
      card:
        rows.length > 1
          ? {
              type: 'stats',
              items: rows.map(([id, , sym]) => ({
                label: sym,
                value: cash(data[id][vs.toLowerCase()], vs),
                note: ` ${signedPct(data[id][`${vs.toLowerCase()}_24h_change`] ?? 0)}`,
              })),
            }
          : undefined,
      chips: [chip('crypto prices', 'Crypto prices')].filter(() => rows.length === 1),
    }
  })
}

/* bills that fall on a weekend or bank holiday in the next `days` days */
function holidayBills(app, now, days = 30) {
  const list = app.holidays ?? []
  if (!list.length || !app.bills?.length) return []
  const off = new Map(list.filter((h) => !h.types || h.types.some((x) => x === 'Public' || x === 'Bank')).map((h) => [h.date, h]))
  return app.bills.flatMap((b) => {
    const left = billDue(b, now).days
    if (left == null || left < 0 || left > days) return []
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + left, 12)
    const h = off.get(isoDay(due))
    return h ? [{ bill: b, holiday: h, due }] : []
  })
}
const holidayBillText = ({ bill, holiday, due }) =>
  t('**{bill}** is due on {holiday} ({date}). Banks are closed, so it may go out the next working day.', {
    bill: tName(bill.name),
    holiday: holiday.name,
    date: dayText(isoDay(due), { weekday: 'long', day: 'numeric', month: 'short' }),
  })

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function holidayIntent(s, app) {
  if (!/\b(holidays?|bank holidays?|banks? (closed|open|shut)|day off|long weekend|public holiday)\b|\bbanks? .*\b(closed|open)\b/.test(s))
    return null
  // "I spent $500 on a holiday" or "save for a holiday" is about money, not dates
  if (parseAmount(s) || MONEY_ACTION.test(s)) return null
  const code = COUNTRIES.find(([, re]) => re.test(s))?.[0] ?? app.country ?? homeCountry()
  let country = code
  try {
    country = new Intl.DisplayNames([tag()], { type: 'region' }).of(code) ?? code
  } catch {
    /* older browsers: keep the code */
  }
  const now = nowFor(app)
  // "is Monday a holiday", "are banks open tomorrow"
  let day = null
  if (/\btoday\b/.test(s)) day = new Date(now)
  else if (/\btomorrow\b/.test(s)) day = new Date(now.getTime() + 864e5)
  else {
    const w = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(s))
    if (w >= 0) day = new Date(now.getTime() + ((w - now.getDay() + 7) % 7 || 7) * 864e5)
  }
  return online(async () => {
    const year = now.getFullYear()
    const [a, b] = await Promise.all([loadHolidays(code, year), loadHolidays(code, year + 1).catch(() => [])])
    if (!a) return { text: t('I don’t have holiday data for that country yet.') }
    const all = [...a, ...(b ?? [])].filter((h) => h.global !== false)
    const today = isoDay(now)
    const bills = holidayBills({ ...app, holidays: all }, now, 30).map(holidayBillText)
    const extra = bills.length ? `\n${bills.map((x) => `• ${x}`).join('\n')}` : ''
    if (day) {
      const iso = isoDay(day)
      const h = all.find((x) => x.date === iso)
      const weekend = day.getDay() === 0 || day.getDay() === 6
      const when = dayText(iso)
      const text = h
        ? t('Yes, {date} is **{name}**, so banks are closed.', { date: when, name: h.name })
        : weekend
          ? t('{date} is a weekend, so most banks are closed.', { date: when })
          : t('No, {date} is a normal working day in {country}.', { date: when, country })
      return { text: text + extra }
    }
    const next = all.filter((h) => h.date >= today).slice(0, 4)
    if (!next.length) return { text: t('I don’t have holiday data for that country yet.') }
    const days = (iso) => Math.round((new Date(`${iso}T12:00`) - new Date(`${today}T12:00`)) / 864e5)
    return {
      text:
        t('Next public holidays in {country}:', { country }) +
        '\n' +
        next
          .map(
            (h) =>
              `• **${h.name}**, ${dayText(h.date)} (${days(h.date) === 0 ? t('today') : days(h.date) === 1 ? t('tomorrow') : t('in {n} days', { n: days(h.date) })})`,
          )
          .join('\n') +
        extra,
    }
  })
}

/** Questions answered from the internet: rates, crypto prices, holidays. */
function liveData(s, app) {
  return holidayIntent(s, app) ?? convertIntent(s, app) ?? cryptoIntent(s, app)
}

/* ---------------- several requests in one message ---------------- */
const STEP_SPLIT = /\s*(?:[,;.]\s*)?(?:\band then\b|\bthen\b|\bafter that\b|\bafterwards\b|;)\s*/i
const IS_QUERY = /(what'?s left|how much (is |do i have )?left|what remains|tell me (my |the )?(balance|what)|my balance|show (me )?(the )?balance)/

function multi(parts, app) {
  const steps = []
  let wantsLeft = false
  for (const [i, part] of parts.entries()) {
    const ps = norm(part)
    if (IS_QUERY.test(ps)) {
      wantsLeft = true
      continue
    }
    const r = smart(part, ps, app) ?? core(part, app)
    if (!r.confirm) {
      // "lunch then coffee": not really two requests, so read the message as one
      if (!/\d/.test(part) && part.trim().split(/\s+/).length <= 3) return null
      return {
        text: t('I can do several things in a row, but I didn’t understand step {n}: “{text}”. Could you say that step another way?', {
          n: i + 1,
          text: part.trim(),
        }),
      }
    }
    steps.push({ part: part.trim(), r })
  }
  if (!steps.length) return null
  if (steps.length === 1 && !wantsLeft) return steps[0].r
  const effect = steps.reduce(
    (e, x) => ({ balance: e.balance + (x.r.confirm.effect?.balance ?? 0), free: e.free + (x.r.confirm.effect?.free ?? 0) }),
    { balance: 0, free: 0 },
  )
  const balanceAfter = app.balance + effect.balance
  const freeAfter = (app.pots?.length ? app.unassigned : app.balance) + effect.free
  return {
    text:
      `${t('Here’s the plan, in this order:')}\n${steps.map((x, k) => `• ${k + 1}. ${x.r.confirm.label}: ${x.r.confirm.note}`).join('\n')}` +
      (wantsLeft ? `\n${t('Then I’ll tell you what’s left.')}` : ''),
    confirm: {
      label: t('Do all {n}', { n: steps.length }),
      note: t('{n} steps, one after another', { n: steps.length }),
      effect,
      steps: steps.map((x) => x.r.confirm),
      run: () => steps.forEach((x) => x.r.confirm.run()),
      done:
        `${t('All done ✅')}\n${steps.map((x) => `• ${typeof x.r.confirm.done === 'function' ? x.r.confirm.done() : x.r.confirm.done}`).join('\n')}` +
        (wantsLeft
          ? `\n${app.pots?.length ? t('What’s left: **{balance}** in total, **{free}** unassigned.', { balance: money(balanceAfter), free: money(freeAfter) }) : t('What’s left: **{balance}**.', { balance: money(balanceAfter) })}`
          : ''),
    },
  }
}

/* ---------------- follow-ups that lean on the conversation ---------------- */
function followUp(raw, s, app, memory) {
  // "make it $80" / "actually 80" after an action
  if (
    memory.lastCommand &&
    (/^(make it|change (it|that) to|actually|no,? (make it|i meant)|instead|i meant)\b/.test(s) || /^\$?\d[\d,]*(\.\d+)?k?$/.test(s))
  ) {
    const token = raw.match(AMOUNT_TOKEN)?.[0]
    if (token)
      return respond(memory.lastCommand.replace('{amount}', token.trim().startsWith('$') ? token.trim() : `$${token.trim()}`), app, {
        ...memory,
        lastCommand: null,
      })
  }
  // "and last month?" / "what about transport" after a search
  if (
    memory.lastFilter &&
    (/^(and|what about|how about|same for|now|and for|ok and)\b/.test(s) ||
      (s.split(' ').length <= 3 &&
        !/\b(pay|send|request|move|add|set|make|switch|open|go|put|transfer|create|delete|clear|spent|bought|paid|dark|light)\b/.test(s)))
  ) {
    const now = nowFor(app)
    const range = parseRange(s, now)
    const fresh = filterFrom(s, app, now)
    const category = fresh.category
    if (range || category || fresh.words.length) {
      const next = { ...memory.lastFilter }
      if (range) next.range = range
      if (category) {
        next.category = category
        next.words = []
      }
      if (fresh.words.length) {
        next.words = fresh.words
        next.category = null
      }
      return finderReply(next, app)
    }
  }
  return null
}

/** Grace's reply to a message. `memory` carries context between messages in one chat. */
export function respond(typed, app, memory = {}) {
  // fix typos first (see typos.js); names on the account count as spelled right
  const raw = fixTypos(typed, accountWords(app)).text
  const s = norm(raw)
  const keep = (r, extra = {}) => ({ ...r, memory: { ...memory, ...extra, ...(r.memory ?? {}) } })

  const safe = safety(raw, s)
  if (safe) return keep(safe)

  const parts = raw.split(STEP_SPLIT).filter((x) => x.trim())
  if (parts.length > 1) {
    const r = multi(parts, app)
    if (r) return keep(r, { lastCommand: null })
  }

  const f = followUp(raw, s, app, memory)
  if (f) return keep(f)

  const r = liveData(s, app) ?? smart(raw, s, app) ?? core(raw, app)
  // remember an action with an amount, so "make it $80" can redo it
  const token = raw.match(AMOUNT_TOKEN)?.[0]
  const lastCommand = r.confirm && token && !r.confirm.steps ? raw.replace(token, '{amount}') : memory.lastCommand
  return keep(r, { lastCommand, lastFilter: r.memory?.lastFilter ?? (r.confirm ? null : memory.lastFilter) })
}
