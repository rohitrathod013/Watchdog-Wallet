/* ------------------------------------------------------------------
   Grace's brain: a small, local intent engine. It reads the live app
   state (balance, budgets, goals, bills…) and can act on it through the
   same functions the dashboard uses. Understands a bit of Roman Urdu.

   Replies are written in the current language (see i18n.js). Chips are
   { q, label }: the label is shown translated, while q is the English
   command sent back in, so a tapped chip works in every language.

   respond(text, app) → {
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
import { t } from './i18n'
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
const findBill = (s, list) => list.find((b) => named(s, b.name))

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
  ['Entertainment', /\b(movie|movies|cinema|netflix|spotify|concert|game|games|gaming|party|show|tickets?|club)\b/],
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

export function respond(raw, app) {
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
  if (/^another one$/.test(s)) return respond('joke', app)
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
          run: () => unpaid.forEach((b) => app.payBill(b.id)),
          done: t('All paid ✅ Nothing due for the next three weeks.'),
        },
      }
    }
    if (bill) {
      const name = t(bill.name)
      const due = tDue(bill.due)
      if (bill.paid) return { text: t('{name} is already paid for {date} ✅', { name, date: due }) }
      return {
        text: t('{name} is **{amount}**, due {date} (in {n} days). Pay it now?', { name, amount: money(bill.amount), date: due, n: bill.days }),
        confirm: {
          label: t('Pay {amount}', { amount: money(bill.amount) }),
          note: t('{name} · autopay account', { name }),
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
        date: tDue(unpaid[0].due),
      }),
      card: {
        type: 'bars',
        rows: unpaid.map((b, k) => ({
          label: `${t(b.name)} · ${tDue(b.due)}`,
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
const tDue = (d) => d.replace(/^([A-Z][a-z]{2})/, (m) => t(m))
