/* ------------------------------------------------------------------
   Grace's brain — a small, local intent engine. It reads the live app
   state (balance, budgets, goals, bills…) and can act on it through the
   same functions the dashboard uses. Understands a bit of Roman Urdu.

   respond(text, app) → {
     text,                 // **bold**, newlines and "• " bullets
     mood?,                // 'happy' | 'idle'
     card?,                // { type: 'bars' | 'stats' | 'tx', … }
     confirm?,             // { label, note, run, done }  — needs a tap
     run?,                 // fires as soon as the reply lands
     links?,               // [{ label, run }]  — quick navigation
     chips?,               // follow-up prompts
   }
   ------------------------------------------------------------------ */
import { money, whole } from './format'
import { ASSISTANT, BRAND } from '../config'
import { CASHFLOW, CAT_COLORS, CURRENCIES, INCOME_SOURCES, PERIODS } from '../data/seed'

export const STARTERS = [
  'Give me a summary',
  'What’s my balance?',
  'Where did my money go?',
  'Any bills due?',
  'Send $50 to Maya',
  'How are my goals?',
  'Switch to dark mode',
  'Give me a saving tip',
]

const norm = (s) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim()

const parseAmount = (t) => {
  const m = t.match(/(?:\$|usd\s?)?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/)
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

const word = (t, w) => new RegExp(`\\b${w}\\b`).test(t)
const named = (t, name) => t.includes(name.toLowerCase()) || words(name).some((w) => word(t, w))

const findContact = (t, list) => list.find((c) => word(t, firstName(c.name).toLowerCase()))
const findGoal = (t, list) => list.find((g) => named(t, g.name))
const findBudget = (t, list) =>
  list.find((b) => named(t, b.name)) ??
  (/\b(groceries|grocery|restaurants?|coffee|khana)\b/.test(t) ? list.find((b) => b.id === 'food') : null) ??
  (/\b(rent|house|ghar)\b/.test(t) ? list.find((b) => b.id === 'housing') : null) ??
  (/\b(uber|fuel|gas|car|travel)\b/.test(t) ? list.find((b) => b.id === 'transport') : null)
const findBill = (t, list) => list.find((b) => named(t, b.name))

const pct = (a, b) => Math.round((a / b) * 100)
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
  'My budget and I have a great relationship — I ignore it and it judges me silently. 🙈',
  'I told my wallet a joke… it didn’t laugh. Too many **bills** on its mind. 😅',
]

export function respond(raw, app) {
  const t = norm(raw)
  const me = app.user.first
  const p = PERIODS[app.period]
  const cur = CURRENCIES[app.currency]
  const amount = parseAmount(t)
  const contact = findContact(t, app.contacts)
  const goal = findGoal(t, app.goals)
  const bill = findBill(t, app.bills)
  const budget = findBudget(t, app.budgets)
  const go =
    (...to) =>
    () =>
      app.go(...to)
  const balanceText = money(app.balance * cur.rate, cur.symbol, cur.dp)

  /* ---------------- small talk ---------------- */
  if (/^(hi+|hey+|hello|helo|yo|salam|assalam|aoa|hola|sup|good (morning|afternoon|evening))\b/.test(t) && t.split(' ').length <= 5) {
    return {
      text: `Hey ${me}! 👋 Great to see you. Want a quick money summary, or should I help you get something done?`,
      mood: 'happy',
      chips: ['Give me a summary', 'What can you do?', 'Any bills due?'],
    }
  }
  if (/(what can you do|help me|^help\b|how (do|can) you help|madad|kya kar sakt)/.test(t)) {
    return {
      text: 'Here’s how I can help:\n• **Answer** — balance, income, spending, budgets, goals, bills\n• **Move money** — send, request, pay bills, top up goals\n• **Drive the dashboard** — open pages, dark mode, colours, currency, period\nJust ask like you would a friend 🙂',
      chips: ['What’s my balance?', 'Pay my rent', 'Add $100 to Emergency Fund', 'Make it blue'],
    }
  }
  if (/(thank|thx|shukriya|shukria|great job|awesome|love you|you'?re the best|nice one)/.test(t)) {
    return { text: 'Anytime! 💛 I’ll be right here in the corner.', mood: 'happy' }
  }
  if (/(who are you|your name|what are you|kaun ho|tum kon)/.test(t)) {
    return {
      text: `I’m **${ASSISTANT.name}**, your ${BRAND.name} money buddy 🧸 I keep an eye on your accounts and can do things for you right here.`,
      mood: 'happy',
    }
  }
  if (/(joke|make me laugh|funny)/.test(t)) {
    return { text: JOKES[Math.floor(Math.random() * JOKES.length)], mood: 'happy', chips: ['Another one', 'Give me a saving tip'] }
  }
  if (/^another one$/.test(t)) return respond('joke', app)
  if (/(dance|jump|celebrate|party|be happy|khush)/.test(t)) {
    return { text: 'Wheee! 🎉 Every dollar saved deserves a little dance.', mood: 'happy' }
  }

  /* ---------------- appearance & controls ---------------- */
  if (/\bdark\b/.test(t) || /(lights? off|night mode)/.test(t)) {
    if (app.theme === 'dark') return { text: 'We’re already in dark mode 🌙' }
    return { text: 'Lights off 🌙 Switching to dark mode.', run: () => app.switchTheme('dark'), mood: 'happy' }
  }
  if (/\blight (mode|theme)|light karo|lights? on|day mode|\bwhite (mode|theme)/.test(t)) {
    if (app.theme === 'light') return { text: 'We’re already in light mode ☀️' }
    return { text: 'Good morning ☀️ Switching to light mode.', run: () => app.switchTheme('light'), mood: 'happy' }
  }
  const ACCENT = { orange: 'orange', blue: 'blue', green: 'green', violet: 'violet', purple: 'violet', rose: 'rose', pink: 'rose' }
  const accentWord = Object.keys(ACCENT).find((w) => new RegExp(`\\b${w}\\b`).test(t))
  if (accentWord && /(colou?r|accent|theme|make it|change|switch|karo|kar do|go)/.test(t)) {
    const next = ACCENT[accentWord]
    return { text: `Fresh coat of paint 🎨 Accent is now **${next}**.`, run: () => app.setAccent(next), mood: 'happy' }
  }
  if (/live/.test(t) && /(pause|stop|off|band|freeze)/.test(t)) {
    return { text: 'Paused live updates ⏸ Your numbers will stay still.', run: () => app.setLive(false) }
  }
  if (/live/.test(t) && /(resume|start|on\b|chalu|turn on)/.test(t)) {
    return { text: 'Live updates are back on 📡', run: () => app.setLive(true) }
  }
  const CUR = [
    [/(euro|\beur\b|€)/, 'EUR'],
    [/(pound|\bgbp\b|£|sterling)/, 'GBP'],
    [/(\byen\b|\bjpy\b|¥)/, 'JPY'],
    [/(dollar|\busd\b)/, 'USD'],
  ]
  const curHit = CUR.find(([re]) => re.test(t))
  if (curHit && /(show|switch|change|convert|in |to |balance|karo)/.test(t) && !/(send|transfer|pay|request|add|bhej)/.test(t)) {
    const c = CURRENCIES[curHit[1]]
    return {
      text: `Done — your balance is **${money(app.balance * c.rate, c.symbol, c.dp)}** in ${c.code}.`,
      run: () => app.setCurrency(c.code),
    }
  }
  const per = t.match(/(this|last|current) (week|month|quarter|year)/)
  if (per && /(show|switch|change|set|view|period|filter|for)/.test(t) && !/(spen|income|earn)/.test(t)) {
    const key = per[2]
    const np = PERIODS[key]
    return {
      text: `Switched the dashboard to **${np.label}**: income ${whole(np.income)}, expenses ${whole(np.expenses)}, net ${whole(np.net)}.`,
      run: () => app.setPeriod(key),
    }
  }

  /* ---------------- money actions ---------------- */
  if (/(request|ask .*(to pay|for)|mang|maang)/.test(t) && !/payment request page/.test(t)) {
    if (contact && amount) {
      return {
        text: `I’ll send ${contact.name} a request for **${money(amount)}**. Shall I?`,
        confirm: {
          label: `Request ${money(amount)}`,
          note: `From ${contact.name} · arrives instantly`,
          run: () => app.requestMoney({ from: contact.name, amount, note: `Sent by ${ASSISTANT.name}` }),
          done: `Request sent ✅ ${firstName(contact.name)} will see it right away.`,
        },
      }
    }
    if (contact)
      return {
        text: `How much should I ask ${firstName(contact.name)} for?`,
        chips: [50, 100, 250].map((v) => `Request $${v} from ${firstName(contact.name)}`),
      }
    return {
      text: 'Who should I send the request to?',
      chips: app.contacts.slice(0, 4).map((c) => `Request $${amount ?? 50} from ${firstName(c.name)}`),
      links: [{ label: 'Open Payment Request', run: () => app.openModal('request') }],
    }
  }

  if (/(new|create|add|make|start|set up) (a )?(new )?(savings )?goal/.test(t)) {
    return { text: 'Let’s set a new goal 🎯 I opened the form for you.', run: () => app.openModal('goal'), mood: 'happy' }
  }
  if (goal && amount && /(add|put|save|move|deposit|fund|top ?up|dal|daal|transfer)/.test(t)) {
    const room = goal.target - goal.saved
    if (room <= 0) return { text: `${goal.name} is already fully funded 🎉`, mood: 'happy' }
    const add = Math.min(amount, room)
    if (add > app.balance) return { text: `That’s more than your balance (${money(app.balance)}).` }
    return {
      text: `Moving **${money(add)}** into ${goal.name} takes it to **${pct(goal.saved + add, goal.target)}%**.${add < amount ? ` (Only ${whole(room)} was left to reach the target.)` : ''}`,
      confirm: {
        label: `Add ${money(add, '$', 0)}`,
        note: `To ${goal.name} · from your balance`,
        run: () => app.fundGoal(goal.id, add),
        done:
          goal.saved + add >= goal.target
            ? `Goal reached! 🎉 ${goal.name} is fully funded.`
            : `Done ✅ ${goal.name} is now at ${pct(goal.saved + add, goal.target)}%.`,
      },
    }
  }
  if (budget && amount && /(set|change|increase|raise|lower|reduce|make|limit|to \$?\d)/.test(t) && /budget|limit/.test(t)) {
    return {
      text: `Set your **${budget.name}** budget to **${whole(amount)}**? You’ve spent ${whole(budget.spent)} so far (${pct(budget.spent, amount)}% of the new limit).`,
      confirm: {
        label: `Set to ${whole(amount)}`,
        note: `Was ${whole(budget.limit)}`,
        run: () => app.setBudgetLimit(budget.id, amount),
        done: `Updated ✅ ${budget.name} now has a ${whole(amount)} monthly limit.`,
      },
      links: [{ label: 'Open Budget', run: go('budget') }],
    }
  }
  if (/\bpay\b|bhar|jama/.test(t) && !contact && (bill || /bills?/.test(t))) {
    const unpaid = app.bills.filter((b) => !b.paid)
    if (/all|every|sab/.test(t)) {
      if (!unpaid.length) return { text: 'Every bill is already paid 🎉', mood: 'happy' }
      const total = unpaid.reduce((s, b) => s + b.amount, 0)
      return {
        text: `You have **${unpaid.length} unpaid bills** totalling **${money(total)}**. Pay them all now?`,
        card: { type: 'bars', rows: unpaid.map((b) => ({ label: b.name, value: money(b.amount), p: 100, c: 'var(--accent)', note: `${b.due}` })) },
        confirm: {
          label: `Pay ${money(total)}`,
          note: `${unpaid.length} bills · from your balance`,
          run: () => unpaid.forEach((b) => app.payBill(b.id)),
          done: 'All paid ✅ Nothing due for the next three weeks.',
        },
      }
    }
    if (bill) {
      if (bill.paid) return { text: `${bill.name} is already paid for ${bill.due} ✅` }
      return {
        text: `${bill.name} is **${money(bill.amount)}**, due ${bill.due} (in ${bill.days} days). Pay it now?`,
        confirm: {
          label: `Pay ${money(bill.amount)}`,
          note: `${bill.name} · autopay account`,
          run: () => app.payBill(bill.id),
          done: `Paid ✅ ${bill.name} is settled ahead of ${bill.due}.`,
        },
      }
    }
  }
  if (/(send|transfer|bhej|\bpay\b)/.test(t) && !/(transfer page|transfer limits?)/.test(t) && (contact || amount)) {
    if (contact && amount) {
      if (amount > app.balance) return { text: `That’s more than your balance of ${money(app.balance)} 😬` }
      return {
        text: `Sending **${money(amount)}** to **${contact.name}**. Your balance will be ${money(app.balance - amount)}.`,
        confirm: {
          label: `Send ${money(amount)}`,
          note: `To ${contact.name} · instant · free`,
          run: () => app.sendMoney({ to: contact.name, amount, note: `Sent by ${ASSISTANT.name}` }),
          done: `Sent ✅ ${money(amount)} is on its way to ${firstName(contact.name)}.`,
        },
      }
    }
    if (contact) {
      return {
        text: `How much should I send to ${firstName(contact.name)}?`,
        chips: [50, 100, 250].map((v) => `Send $${v} to ${firstName(contact.name)}`),
      }
    }
    return { text: `Who should get **${money(amount)}**?`, chips: app.contacts.slice(0, 4).map((c) => `Send $${amount} to ${firstName(c.name)}`) }
  }
  if (/(send|transfer) (some )?money|paise bhej|bhejna/.test(t)) {
    return { text: 'Opening **Send Money** for you 💸', run: () => app.openModal('send') }
  }
  if (/(receive|account (number|details)|\biban\b|routing|\bqr\b|get paid|my details)/.test(t)) {
    return { text: 'Here are your account details — share the QR or the link to get paid 📥', run: () => app.openModal('receive') }
  }

  /* ---------------- navigation ---------------- */
  const wantsNav = /(open|go to|goto|take me|navigate|jump to|kholo|khol do|le chalo|visit|switch to)/.test(t)
  const nav = NAV.find((n) => n.re.test(t))
  if (nav && (wantsNav || /^(show )?(the )?\w+( page| tab)?$/.test(t))) {
    return { text: `Opening **${nav.label}** for you 👉`, run: () => app.go(...nav.to) }
  }

  /* ---------------- answers ---------------- */
  if (/(summary|overview|snapshot|how am i doing|how'?s my money|my finances|hisab|halat)/.test(t)) {
    const spent = app.budgets.reduce((s, b) => s + b.spent, 0)
    const limit = app.budgets.reduce((s, b) => s + b.limit, 0)
    const best = [...app.goals].sort((a, b) => b.saved / b.target - a.saved / a.target)[0]
    return {
      text: `Here’s your snapshot for **${p.label.toLowerCase()}** 📊\nYou’ve used **${pct(spent, limit)}%** of your budget${best ? `, and **${best.name}** is your closest goal at **${pct(best.saved, best.target)}%**` : ''}.`,
      card: {
        type: 'stats',
        items: [
          { label: 'Balance', value: balanceText },
          { label: 'Income', value: whole(p.income), note: signedPct(p.incomeDelta) },
          { label: 'Expenses', value: whole(p.expenses), note: signedPct(p.expensesDelta) },
          { label: 'Net profit', value: whole(p.net), note: signedPct(p.netDelta) },
        ],
      },
      chips: ['Where did my money go?', 'Give me a saving tip'],
    }
  }
  if (/(balance|how much (money )?(do )?i (have|got)|kitna paisa|kitne paise|paise kitne|balance kitna)/.test(t)) {
    return {
      text: `Your total balance is **${balanceText}** — up **+12.4%** vs last week. Nice work, ${me}! 💪`,
      mood: 'happy',
      chips: ['Show it in euros', 'Where did my money go?'],
    }
  }
  if (budget && /(spen|spent|kharch|budget|how much|cost|on )/.test(t)) {
    const r = budget.spent / budget.limit
    const verdict =
      r > 1
        ? `that’s **${whole(budget.spent - budget.limit)} over** your ${whole(budget.limit)} budget 😬`
        : `${whole(budget.limit - budget.spent)} left of your ${whole(budget.limit)} budget${r > 0.9 ? ' — getting close!' : ' 👍'}`
    return {
      text: `You’ve spent **${whole(budget.spent)}** on ${budget.name} this month — ${verdict}`,
      card: { type: 'bars', rows: [{ label: budget.name, value: `${pct(budget.spent, budget.limit)}%`, p: Math.min(100, r * 100), c: tone(r) }] },
      chips: [`Set ${budget.name.split(' ')[0].toLowerCase()} budget to $${Math.ceil((budget.spent * 1.15) / 50) * 50}`],
      links: [{ label: 'Open Budget', run: go('budget') }],
    }
  }
  if (/(income|earn|kamai|salary|freelance|business)/.test(t)) {
    const total = INCOME_SOURCES.reduce((s, x) => s + x.value, 0)
    return {
      text: `You earned **${money(p.income)}** ${p.label.toLowerCase()} (${signedPct(p.incomeDelta)} ${p.vs.toLowerCase()}). Year to date, here’s where it comes from:`,
      card: {
        type: 'bars',
        rows: INCOME_SOURCES.map((s, i) => ({
          label: s.name,
          value: whole(s.value),
          p: pct(s.value, total),
          c: ['var(--solid)', 'var(--green)', 'var(--accent)'][i],
        })),
      },
      links: [{ label: 'Open Reports', run: go('dashboard', { tab: 'reports' }) }],
    }
  }
  if (/(biggest|largest|most expensive|highest|sabse bara)/.test(t)) {
    const out = app.transactions.filter((x) => x.amount < 0).sort((a, b) => a.amount - b.amount)
    const top = out[0]
    return {
      text: top ? `Your biggest expense was **${top.name}** — **${money(-top.amount)}** (${top.category}).` : 'No expenses yet!',
      card: { type: 'tx', rows: out.slice(0, 3) },
    }
  }
  if (/(where.*(money|it).*(go|went)|expense|spent|spending|spend\b|kharch|breakdown)/.test(t)) {
    const total = app.budgets.reduce((s, b) => s + b.spent, 0)
    const top = [...app.budgets].sort((a, b) => b.spent - a.spent)
    return {
      text: `You spent **${money(p.expenses)}** ${p.label.toLowerCase()} (${signedPct(p.expensesDelta)}). **${top[0].name}** is the biggest slice:`,
      card: {
        type: 'bars',
        rows: top.map((b, i) => ({
          label: b.name,
          value: whole(b.spent),
          p: pct(b.spent, total),
          c: CAT_COLORS[app.budgets.indexOf(b) % CAT_COLORS.length],
          k: i,
        })),
      },
      chips: ['Am I over budget?', 'Give me a saving tip'],
    }
  }
  if (/(profit|\bnet\b|how much (did )?i save|savings rate)/.test(t)) {
    return {
      text: `Your net profit is **${money(p.net)}** ${p.label.toLowerCase()} (${signedPct(p.netDelta)}). That’s a **${((p.net / p.income) * 100).toFixed(1)}%** savings rate — excellent 🙌`,
      mood: 'happy',
    }
  }
  if (/(budget|over ?spen|over budget|limit)/.test(t)) {
    const spent = app.budgets.reduce((s, b) => s + b.spent, 0)
    const limit = app.budgets.reduce((s, b) => s + b.limit, 0)
    const over = app.budgets.filter((b) => b.spent > b.limit)
    return {
      text: `You’ve used **${pct(spent, limit)}%** of your ${whole(limit)} budget. ${over.length ? `**${over.map((b) => b.name).join(', ')}** ${over.length > 1 ? 'are' : 'is'} over the limit.` : 'Every category is within its limit 🎉'}`,
      card: {
        type: 'bars',
        rows: [...app.budgets]
          .sort((a, b) => b.spent / b.limit - a.spent / a.limit)
          .map((b, k) => ({
            label: b.name,
            value: `${whole(b.spent)} / ${whole(b.limit)}`,
            p: Math.min(100, (b.spent / b.limit) * 100),
            c: tone(b.spent / b.limit),
            k,
          })),
      },
      links: [{ label: 'Open Budget', run: go('budget') }],
    }
  }
  if (/(tip|advice|save more|saving tip|bachat|how (can|do|should) i save|suggest|recommend)/.test(t)) {
    const tips = []
    const over = app.budgets.filter((b) => b.spent > b.limit)
    over.forEach((b) => tips.push(`**${b.name}** is ${whole(b.spent - b.limit)} over — try a 48-hour pause before non-essential buys.`))
    const subs = app.bills.filter((b) => ['stream', 'music', 'gym'].includes(b.kind))
    if (subs.length) tips.push(`Your subscriptions cost **${money(subs.reduce((s, b) => s + b.amount, 0))}/mo** — cancel one you rarely use.`)
    const g = [...app.goals].sort((a, b) => a.saved / a.target - b.saved / b.target)[0]
    if (g) tips.push(`An extra **$25 a week** into ${g.name} adds ${whole(25 * 52)} a year.`)
    tips.push('Move savings on payday, not at month end — what you don’t see, you don’t spend.')
    return {
      text: `A few ideas for you 💡\n${tips
        .slice(0, 3)
        .map((x) => `• ${x}`)
        .join('\n')}`,
      chips: ['Am I over budget?', 'How are my goals?'],
    }
  }

  if (/(goal|saving|target|emergency|vacation|tesla)/.test(t)) {
    if (goal) {
      const left = Math.max(0, goal.target - goal.saved)
      const months = goal.monthly ? Math.ceil(left / goal.monthly) : null
      return {
        text: `**${goal.name}** is at **${pct(goal.saved, goal.target)}%** — ${whole(goal.saved)} of ${whole(goal.target)}. ${left ? `${whole(left)} to go${months ? `, about **${months} months** at ${whole(goal.monthly)}/mo` : ''}.` : 'Fully funded 🎉'}`,
        chips: left ? [`Add $100 to ${goal.name}`, `Add $500 to ${goal.name}`] : [],
      }
    }
    if (!app.goals.length) return { text: 'You don’t have any goals yet. Want to start one?', chips: ['Create a new goal'] }
    return {
      text: `You’re saving for **${app.goals.length} goals**. Here’s the progress:`,
      card: {
        type: 'bars',
        rows: app.goals.map((g, k) => ({ label: g.name, value: `${pct(g.saved, g.target)}%`, p: pct(g.saved, g.target), c: 'var(--accent)', k })),
      },
      chips: [`Add $100 to ${app.goals[0].name}`, 'Create a new goal'],
    }
  }
  if (/(bill|due|upcoming|subscription|rent\b)/.test(t)) {
    const unpaid = app.bills.filter((b) => !b.paid)
    if (!unpaid.length) return { text: 'No bills due — everything’s paid 🎉', mood: 'happy' }
    const total = unpaid.reduce((s, b) => s + b.amount, 0)
    return {
      text: `**${unpaid.length} bills** coming up, **${money(total)}** in total. ${unpaid[0].name} is next — due ${unpaid[0].due}.`,
      card: {
        type: 'bars',
        rows: unpaid.map((b, k) => ({
          label: `${b.name} · ${b.due}`,
          value: money(b.amount),
          p: Math.max(8, 100 - b.days * 5),
          c: b.days <= 5 ? 'var(--red)' : 'var(--accent)',
          k,
        })),
      },
      chips: ['Pay all my bills', `Pay ${unpaid[0].name.toLowerCase()}`],
    }
  }
  if (/(transaction|recent|history|last (payment|purchase|transfer)|latest)/.test(t)) {
    return {
      text: 'Here are your latest transactions:',
      card: { type: 'tx', rows: app.transactions.slice(0, 4) },
      links: [{ label: 'See all transactions', run: go('dashboard', { tab: 'transactions' }) }],
    }
  }
  if (/(cash ?flow|money in|money out)/.test(t)) {
    const inn = CASHFLOW.income.reduce((s, v) => s + v, 0) * 1000
    const out = CASHFLOW.expenses.reduce((s, v) => s + v, 0) * 1000
    return {
      text: `Over the last 12 months **${whole(inn)}** came in and **${whole(out)}** went out — you kept **${whole(inn - out)}** 💚`,
      mood: 'happy',
    }
  }
  return {
    text: `Hmm, I’m not sure about that one yet 🤔 Try asking about your balance, spending, budgets, goals or bills — or tell me to send money, pay a bill or switch the theme.`,
    chips: ['What can you do?', 'Give me a summary', 'Any bills due?'],
  }
}
