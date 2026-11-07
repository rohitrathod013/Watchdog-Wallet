/* ------------------------------------------------------------------
   Grace's test set: every line is a message and what Grace must do with
   it. Run with `npm test`. GitHub runs it before every deploy, so a
   change that breaks an answer never reaches the live site.
   ------------------------------------------------------------------ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { respond } from '../src/lib/assistant'
import { accountWords, fixTypos } from '../src/lib/typos'
import { clearLiveCache } from '../src/lib/live'
import { demoStats, computeStats, DEFAULT_BUDGETS } from '../src/lib/stats'
import * as seed from '../src/data/seed'

/* ---------------- fake accounts ---------------- */
function makeApp(base) {
  const calls = []
  const spy =
    (name) =>
    (...args) =>
      calls.push({ name, args })
  const pots = base.pots ?? []
  const inPots = pots.reduce((s, p) => s + p.amount, 0)
  const app = {
    user: { first: 'Rohit', name: 'Rohit Rathod' },
    period: 'month',
    currency: 'USD',
    theme: 'light',
    contacts: [],
    goals: [],
    bills: [],
    transactions: [],
    activity: [],
    ...base,
    pots,
    inPots,
    unassigned: (base.balance ?? 0) - inPots,
    calls,
  }
  for (const f of [
    'sendMoney',
    'requestMoney',
    'payBill',
    'fundGoal',
    'setBudgetLimit',
    'addTransaction',
    'addMoney',
    'moveMoney',
    'addGoal',
    'openModal',
    'go',
    'switchTheme',
    'setAccent',
    'setLive',
    'setCurrency',
    'setPeriod',
    'logActivity',
    'watch',
    'unwatch',
    'invest',
    'sellHolding',
    'lockNow',
    'setGuard',
  ])
    app[f] = spy(f)
  if (!app.stats) app.stats = computeStats(app.transactions, app.budgets ?? [], app.now)
  app.budgets = app.stats.budgets ?? app.budgets
  return app
}

const demo = () =>
  makeApp({
    balance: seed.BALANCE_USD,
    transactions: seed.TRANSACTIONS,
    goals: seed.GOALS,
    budgets: seed.BUDGETS,
    bills: seed.BILLS,
    contacts: seed.CONTACTS,
    pots: seed.POTS,
    stats: demoStats(seed.BUDGETS),
    now: new Date(2026, 9, 28, 18),
  })

const tx = (id, date, name, amount, category, extra = {}) => ({
  id,
  date,
  name,
  amount,
  category,
  kind: 'transfer',
  method: 'Cash',
  status: 'Completed',
  ...extra,
})
const RICH_NOW = new Date(2026, 9, 20, 12)
const rich = () =>
  makeApp({
    now: RICH_NOW,
    balance: 2400,
    contacts: [
      { id: 'c1', name: 'Nikhil Sharma', hue: 1 },
      { id: 'c2', name: 'Ayush Kumar', hue: 2 },
    ],
    goals: [{ id: 'g1', name: 'New Laptop', icon: 'laptop', saved: 400, target: 1500, monthly: 150, due: 'Mar 2027' }],
    bills: [
      { id: 'b1', name: 'Electricity', amount: 80, dueDate: '2026-10-24', kind: 'fuel', paid: false },
      { id: 'b2', name: 'Rent', amount: 1200, dueDate: '2026-10-30', kind: 'home', paid: false },
    ],
    pots: [
      { id: 'p1', name: 'Savings', icon: 'safe', amount: 600 },
      { id: 'p2', name: 'Travel', icon: 'plane', amount: 300 },
    ],
    budgets: DEFAULT_BUDGETS,
    transactions: [
      tx('a1', '2026-08-01T09:00', 'Salary', 3000, 'Salary'),
      tx('a2', '2026-08-05T19:00', 'Dinner', -60, 'Food & Dining'),
      tx('a3', '2026-08-12T09:00', 'Netflix', -12.99, 'Entertainment', { kind: 'stream' }),
      tx('b1', '2026-09-01T09:00', 'Salary', 3000, 'Salary'),
      tx('b2', '2026-09-08T19:00', 'Groceries', -90, 'Food & Dining'),
      tx('b3', '2026-09-12T09:00', 'Netflix', -12.99, 'Entertainment', { kind: 'stream' }),
      tx('b4', '2026-09-14T10:00', 'Uber', -25, 'Transport'),
      tx('c1', '2026-10-01T09:00', 'Salary', 3000, 'Salary'),
      tx('c2', '2026-10-06T20:00', 'Dinner', -300, 'Food & Dining'),
      tx('c3', '2026-10-12T09:00', 'Netflix', -15.49, 'Entertainment', { kind: 'stream' }),
      tx('c4', '2026-10-13T08:00', 'Uber', -22, 'Transport'),
      tx('c5', '2026-10-14T08:05', 'Uber', -22, 'Transport'),
      tx('c6', '2026-10-15T15:00', 'Headphones', -240, 'Shopping'),
      tx('c7', '2026-10-17T12:00', 'Client project', 800, 'Freelance'),
      tx('c8', '2026-10-19T13:00', 'Lunch', -18, 'Food & Dining'),
    ],
  })

const empty = () => makeApp({ balance: 0, budgets: DEFAULT_BUDGETS, now: new Date(2026, 10, 6, 12) })

/* ---------------- helpers ---------------- */
const plain = (r) => (r.text ?? '').replace(/\*\*/g, '')
const ask = (app, text, memory) => respond(text, app, memory)
const confirmAndRun = (app, r) => {
  expect(r.confirm, `expected a confirm step for: ${plain(r)}`).toBeTruthy()
  r.confirm.run()
  return app.calls
}

/* ================================================================== */
describe('safety', () => {
  const cases = [
    'my password is hunter2',
    'my pin is 4321',
    'here is my card 4111 1111 1111 1111',
    'cvv 123',
    'the otp is 993812',
    'my one-time code is 123456',
  ]
  for (const c of cases)
    it(`refuses secrets: "${c}"`, () => {
      const r = ask(demo(), c)
      expect(r.mask).toBe(true)
      expect(plain(r)).toMatch(/don’t share passwords/)
      expect(r.confirm).toBeFalsy()
    })

  it('does not treat "change my password please" as sharing one', () => {
    const r = ask(demo(), 'how do I change my password please')
    expect(r.mask).toBeFalsy()
  })
  for (const c of ['I think this is fraud', 'my card was stolen', 'I want to dispute a charge', 'someone used my account', 'I got scammed'])
    it(`hands off fraud and disputes: "${c}"`, () => {
      const r = ask(demo(), c)
      expect(plain(r)).toMatch(/contact your bank/)
      expect(r.confirm).toBeFalsy()
    })
  for (const c of ['should I buy bitcoin', 'which stocks should I invest in', 'is tesla a good investment', 'best crypto to buy'])
    it(`gives information, not investment advice: "${c}"`, () => {
      const r = ask(demo(), c)
      expect(plain(r)).toMatch(/can’t give investment advice/)
      expect(r.confirm).toBeFalsy()
    })
  it('points locked-out users to password reset', () => {
    expect(plain(ask(demo(), 'I forgot my password'))).toMatch(/Forgot password/)
  })
})

/* ================================================================== */
describe('never acts on ambiguous requests', () => {
  for (const c of ['send money', 'send $50', 'request money', 'pay', 'move money'])
    it(`asks first: "${c}"`, () => {
      const app = demo()
      const r = ask(app, c)
      expect(r.confirm).toBeFalsy()
      expect(app.calls.filter((x) => !['openModal', 'go'].includes(x.name))).toHaveLength(0)
    })
})

/* ================================================================== */
describe('answers about your own data', () => {
  const cases = [
    ['what’s my balance?', /total balance is \$128,430\.50/],
    ['give me a summary', /snapshot/],
    ['where did my money go?', /You spent \$5,000\.00/],
    ['how much did I earn this month', /came in|You earned/],
    ['am I over budget?', /Shopping is over the limit/],
    ['how are my goals?', /saving for 3 goals/],
    ['any bills due?', /bills coming up/],
    ['how much is in my pots?', /in 5 pots/],
    ['what is my net profit', /net profit is/],
    ['how much did I spend on food?', /Food & Dining/],
  ]
  for (const [q, want] of cases)
    it(q, () => {
      expect(plain(ask(demo(), q))).toMatch(want)
    })
})

/* ================================================================== */
describe('finding transactions', () => {
  const cases = [
    ['what did I spend on food this month', /Found 2 transactions/, (r) => r.card?.type === 'tx'],
    ['what did I spend on food last week', /No transactions last week/],
    ['show uber charges this month', /2 transactions/],
    ['find transactions over $200', /over \$200/],
    ['what did I spend yesterday', /Found|No transactions/],
    ['show my spending in september', /Found 3 transactions/],
    ['how much did I spend on transport last month', /\$25\.00 went out/],
    ['show netflix payments', /3 transactions/],
    ['list purchases under $20', /under \$20/],
    ['how much did I earn this month', /You earned|came in/],
    ['what did I buy in august', /Found 2 transactions/],
  ]
  for (const [q, want, extra] of cases)
    it(q, () => {
      const r = ask(rich(), q)
      expect(plain(r)).toMatch(want)
      if (extra) expect(extra(r)).toBe(true)
    })

  it('remembers the search for "and last month?"', () => {
    const app = rich()
    const r1 = ask(app, 'show uber charges this month')
    const r2 = ask(app, 'and last month?', r1.memory)
    expect(plain(r2)).toMatch(/1 transaction/)
  })
  it('remembers the search for "what about food"', () => {
    const app = rich()
    const r1 = ask(app, 'what did I spend this month')
    const r2 = ask(app, 'what about food', r1.memory)
    expect(plain(r2)).toMatch(/on Food & Dining/)
  })
  it('does not treat a command after a search as a follow-up', () => {
    const app = rich()
    const r1 = ask(app, 'what did I spend this month')
    const r2 = ask(app, 'pay rent', r1.memory)
    expect(r2.confirm?.label).toMatch(/Pay/)
  })
})

/* ================================================================== */
describe('why is my spending up?', () => {
  it('compares with last month and names the biggest changes', () => {
    const t = plain(ask(rich(), 'why is my spending up this month?'))
    expect(t).toMatch(/more than this time last month/)
    expect(t).toMatch(/Food & Dining up/)
    expect(t).toMatch(/Dinner/)
  })
  it('works on an empty account', () => {
    expect(plain(ask(empty(), 'why is my spending up'))).toMatch(/no spending/)
  })
})

/* ================================================================== */
describe('alerts, forecast, unusual charges, subscriptions', () => {
  it('lists heads-ups', () => {
    const t = plain(ask(rich(), 'any alerts?'))
    expect(t).toMatch(/Electricity/)
    expect(t).toMatch(/charged twice/)
  })
  it('warns when a bill can’t be covered', () => {
    const app = rich()
    app.unassigned = 50
    expect(plain(ask(app, 'anything I should know?'))).toMatch(/short/)
  })
  it('is quiet on an empty account', () => {
    expect(plain(ask(empty(), 'any alerts'))).toMatch(/All quiet/)
  })
  it('forecasts the end of the month', () => {
    const t = plain(ask(rich(), 'what will my balance be at the end of the month?'))
    expect(t).toMatch(/By October 31/)
    expect(t).toMatch(/\$1,280\.00 in bills/)
  })
  it('forecast handles an empty account', () => {
    expect(plain(ask(empty(), 'forecast my month'))).toMatch(/\$0\.00/)
  })
  it('spots a duplicate charge', () => {
    expect(plain(ask(rich(), 'any unusual charges?'))).toMatch(/Uber was charged twice/)
  })
  it('spots a big one-off spend', () => {
    expect(plain(ask(rich(), 'anything unusual?'))).toMatch(/Headphones|Dinner/)
  })
  it('spots a subscription price rise', () => {
    expect(plain(ask(rich(), 'show my subscriptions'))).toMatch(/Netflix went up from \$12\.99 to \$15\.49/)
  })
  it('totals subscriptions per month and year', () => {
    expect(plain(ask(rich(), 'what am I paying for every month?'))).toMatch(/a month \(\$186 a year\)/)
  })
  it('says it can’t cancel subscriptions', () => {
    expect(plain(ask(rich(), 'list my subscriptions'))).toMatch(/can’t cancel/)
  })
  it('nothing unusual on the demo apart from what is there', () => {
    expect(plain(ask(demo(), 'any duplicate charges?'))).toBeTruthy()
  })
})

/* ================================================================== */
describe('can I afford it?', () => {
  it('yes for something small', () => {
    expect(plain(ask(rich(), 'can I afford $150?'))).toMatch(/^Yes/)
  })
  it('no, with the trade-off, for something too big right now', () => {
    const t = plain(ask(rich(), 'can I afford $5000 this month?'))
    expect(t).toMatch(/Not comfortably/)
    expect(t).toMatch(/short/)
  })
  it('counts future months for a later date', () => {
    const t = plain(ask(rich(), 'can I afford a $1,200 trip in March?'))
    expect(t).toMatch(/by March/)
  })
  it('mentions pausing goals when short', () => {
    expect(plain(ask(rich(), 'can I afford $9000 next month'))).toMatch(/goal contributions/)
  })
  it('works on an empty account', () => {
    expect(plain(ask(empty(), 'can I afford $100'))).toMatch(/Not comfortably/)
  })
})

/* ================================================================== */
describe('goal planning', () => {
  it('gives a weekly amount and offers to create the goal', () => {
    const app = rich()
    const r = ask(app, 'save $5k by June for a car')
    expect(plain(r)).toMatch(/a week/)
    expect(r.confirm.label).toMatch(/Create this goal/)
    confirmAndRun(app, r)
    expect(app.calls.find((c) => c.name === 'addGoal').args[0]).toMatchObject({ target: 5000 })
  })
  it('suggests a budget to trim when short', () => {
    const app = rich()
    const r = ask(app, 'I need to save $10000 by december')
    expect(plain(r)).toMatch(/short/)
  })
  it('names the goal from the sentence', () => {
    const r = ask(rich(), 'save $2000 by march for a holiday')
    expect(r.confirm.note).toMatch(/Holiday/)
  })
})

/* ================================================================== */
describe('actions with a confirm step', () => {
  const cases = [
    ['send $50 to Nikhil', 'sendMoney', (a) => a[0].amount === 50 && a[0].to === 'Nikhil Sharma'],
    ['request $20 from Ayush', 'requestMoney', (a) => a[0].amount === 20],
    ['pay the electric bill', 'payBill', (a) => a[0] === 'b1'],
    ['pay rent', 'payBill', (a) => a[0] === 'b2'],
    ['pay all my bills', 'payBill', (a) => a.length === 2],
    ['add $100 to New Laptop', 'fundGoal', (a) => a[0] === 'g1' && a[1] === 100],
    ['set food budget to $500', 'setBudgetLimit', (a) => a[1] === 500],
    ['move $200 to savings', 'moveMoney', (a) => a[0].to === 'p1' && a[0].amount === 200 && a[0].from === 'unassigned'],
    ['put $50 into travel', 'moveMoney', (a) => a[0].to === 'p2'],
    ['take $100 out of travel', 'moveMoney', (a) => a[0].from === 'p2' && a[0].to === 'unassigned'],
    ['move $100 from savings to travel', 'moveMoney', (a) => a[0].from === 'p1' && a[0].to === 'p2'],
    ['I spent $300 for dinner', 'addTransaction', (a) => a[0].amount === -300 && a[0].category === 'Food & Dining'],
    ['spent 45 on an uber yesterday', 'addTransaction', (a) => a[0].category === 'Transport'],
    ['paid $12 for netflix', 'addTransaction', (a) => a[0].category === 'Entertainment'],
    ['bought new shoes for $90', 'addTransaction', (a) => a[0].name === 'Shoes' && a[0].category === 'Shopping'],
    ['I got paid $2000', 'addMoney', (a) => a[0].amount === 2000 && a[0].category === 'Salary'],
    ['received $150 from a freelance client', 'addMoney', (a) => a[0].category === 'Freelance'],
    ['got $50 as a birthday gift', 'addMoney', (a) => a[0].category === 'Gift'],
    ['spent $30 on groceries from my travel pot', 'addTransaction', (a) => a[0].potId === 'p2'],
  ]
  for (const [q, fn, check] of cases)
    it(`${q} → ${fn}`, () => {
      const app = rich()
      const r = ask(app, q)
      confirmAndRun(app, r)
      const call = app.calls.filter((c) => c.name === fn)
      expect(call.length, `no ${fn} call`).toBeGreaterThan(0)
      expect(check(fn === 'payBill' && q.includes('all') ? call : call[0].args)).toBe(true)
    })

  it('nothing moves before you confirm', () => {
    const app = rich()
    ask(app, 'send $50 to Nikhil')
    expect(app.calls).toHaveLength(0)
  })
  it('won’t move more than a pot has', () => {
    const r = ask(rich(), 'move $900 from travel to savings')
    expect(r.confirm).toBeFalsy()
    expect(plain(r)).toMatch(/only has \$300\.00/)
  })
  it('won’t send more than the balance', () => {
    const r = ask(rich(), 'send $99999 to Nikhil')
    expect(r.confirm).toBeFalsy()
  })
  it('shows the amount and recipient in the confirm', () => {
    const r = ask(rich(), 'send $75 to Ayush')
    expect(r.confirm.label).toMatch(/\$75\.00/)
    expect(r.confirm.note).toMatch(/Ayush Kumar/)
  })
  it('"make it $80" redoes the last action with a new amount', () => {
    const app = rich()
    const r1 = ask(app, 'send $50 to Nikhil')
    const r2 = ask(app, 'make it $80', r1.memory)
    confirmAndRun(app, r2)
    expect(app.calls.find((c) => c.name === 'sendMoney').args[0].amount).toBe(80)
  })
  it('"actually 25" also changes the amount', () => {
    const app = rich()
    const r1 = ask(app, 'I spent $300 for dinner')
    const r2 = ask(app, 'actually 25', r1.memory)
    confirmAndRun(app, r2)
    expect(app.calls.find((c) => c.name === 'addTransaction').args[0].amount).toBe(-25)
  })
})

/* ================================================================== */
describe('several steps in one message', () => {
  it('moves, pays and reports what’s left', () => {
    const app = rich()
    const r = ask(app, 'Move $200 to savings, then pay the electric bill, then tell me what’s left')
    expect(r.confirm.label).toMatch(/Do all 2/)
    expect(plain(r)).toMatch(/1\. Move \$200\.00/)
    expect(plain(r)).toMatch(/2\. Pay \$80\.00/)
    r.confirm.run()
    expect(app.calls.map((c) => c.name)).toEqual(['moveMoney', 'payBill'])
    expect(r.confirm.done.replace(/\*\*/g, '')).toMatch(/What’s left: \$2,320\.00 in total, \$1,220\.00 unassigned/)
  })
  it('logs spending and sends money in one go', () => {
    const app = rich()
    const r = ask(app, 'I spent $20 on lunch and then send $10 to Ayush')
    r.confirm.run()
    expect(app.calls.map((c) => c.name)).toEqual(['addTransaction', 'sendMoney'])
  })
  it('refuses the whole plan when one step is unclear', () => {
    const app = rich()
    const r = ask(app, 'pay rent then do the thing with the stuff for $40')
    expect(r.confirm).toBeFalsy()
    expect(plain(r)).toMatch(/didn’t understand step 2/)
  })
  it('does not split "lunch then coffee" into steps', () => {
    const r = ask(rich(), 'I spent $20 on lunch then coffee')
    expect(r.confirm.label).toMatch(/Add expense/)
  })
})

/* ================================================================== */
describe('help with the site and what words mean', () => {
  const cases = [
    ['where do I export a CSV?', /Export CSV/],
    ['how do I add money', /Add money/],
    ['how do I create a pot', /New pot/],
    ['what is unassigned', /isn’t in any pot/],
    ['how do I add a bill', /Upcoming Bills/],
    ['how can I add a contact', /Add contact/],
    ['how do I change the language', /language button/],
    ['how do I change the theme', /Settings/],
    ['how do I change my budget', /Monthly limit/],
    ['how do I delete my data', /Clear my data/],
    ['how do I add an expense', /Add transaction/],
    ['what is a fee', /charge for a service/],
    ['what is an overdraft', /below zero/],
    ['what does pending mean', /isn’t finished/],
    ['what is apr', /whole year/],
    ['what is a chargeback', /reverses a card payment/],
    ['what is autopay', /automatically/],
    ['what is net profit', /income minus your expenses/],
    ['what is a savings rate', /didn’t spend/],
    ['explain cash flow', /coming in versus/],
    ['what is an emergency fund', /surprises/],
    ['what can you do', /Find transactions|Find/],
  ]
  for (const [q, want] of cases)
    it(q, () => {
      expect(plain(ask(demo(), q))).toMatch(want)
    })
  it('a definition question about "my budget" gives the status, not a definition', () => {
    expect(plain(ask(demo(), "what's my budget"))).not.toMatch(/a limit you set/)
  })
})

/* ================================================================== */
describe('audit trail', () => {
  it('explains the last action', () => {
    const app = rich()
    app.activity = [
      {
        id: 'x',
        at: '2026-10-20T10:00:00Z',
        action: 'Send $50.00',
        detail: 'To Nikhil Sharma',
        reason: 'You asked “send $50 to Nikhil”.',
        request: 'send $50 to Nikhil',
      },
    ]
    const t = plain(ask(app, 'why did you do that?'))
    expect(t).toMatch(/Send \$50\.00/)
    expect(t).toMatch(/Why: You asked/)
  })
  it('says so when nothing has been done', () => {
    expect(plain(ask(empty(), 'what did you do?'))).toMatch(/haven’t done anything/)
  })
})

/* ================================================================== */
describe('everything else still works', () => {
  const cases = [
    ['hi', /Great to see you/],
    ['switch to dark mode', /dark mode/],
    ['make it blue', /blue/],
    ['show it in euros', /in EUR/],
    ['open analytics', /Analytics/],
    ['tell me a joke', /./],
    ['give me a saving tip', /ideas/],
    ['who are you', /Grace/],
    ['thank you', /Anytime/],
    ['pause live updates', /Paused/],
    ['blah blah nonsense', /not sure/],
  ]
  for (const [q, want] of cases)
    it(q, () => {
      expect(plain(ask(demo(), q))).toMatch(want)
    })
})

/* ================================================================== */
describe('empty accounts never crash', () => {
  const qs = [
    'what’s my balance?',
    'give me a summary',
    'where did my money go?',
    'am I over budget?',
    'how are my goals?',
    'any bills due?',
    'how much is in my pots?',
    'what did I spend last week',
    'any alerts?',
    'forecast my month',
    'any unusual charges?',
    'show my subscriptions',
    'can I afford $50',
    'save $1000 by june',
    'send $10 to Maya',
    'move $10 to savings',
    'why is my spending up',
    'I spent $5 on coffee',
    'what is a fee',
  ]
  for (const q of qs)
    it(q, () => {
      const r = ask(empty(), q)
      expect(typeof r.text).toBe('string')
      expect(r.text.length).toBeGreaterThan(0)
      expect(r.text).not.toMatch(/NaN|undefined|Infinity/)
    })
})

/* ================================================================== */
describe('typos (Fuse.js)', () => {
  // each pair should get exactly the same answer
  const pairs = [
    ['whats my balnce', 'whats my balance'],
    ['send $50 to varsah', 'send $50 to varsha'],
    ['send $20 to nikil', 'send $20 to nikhil'],
    ['I spnet $30 on dinnr', 'I spent $30 on dinner'],
    ['show my subscritpions', 'show my subscriptions'],
    ['any unusal charges?', 'any unusual charges?'],
    ['forcast my month', 'forecast my month'],
    ['what did I spend on fod this month', 'what did I spend on food this month'],
    ['can I aford $500', 'can I afford $500'],
    ['any bils due?', 'any bills due?'],
    ['give me a sumary', 'give me a summary'],
    ['swich to dark mode', 'switch to dark mode'],
    ['whats my bslance', 'whats my balance'],
    ['how much did I spend on groceriess', 'how much did I spend on groceries'],
  ]
  for (const [typo, right] of pairs)
    it(`"${typo}" works like "${right}"`, () => {
      const a = ask(demo(), typo)
      const b = ask(demo(), right)
      expect(plain(a)).toBe(plain(b))
      expect(Boolean(a.confirm)).toBe(Boolean(b.confirm))
    })

  it('records the corrected description', () => {
    const app = demo()
    const calls = confirmAndRun(app, ask(app, 'I spent $30 on dinnr'))
    expect(JSON.stringify(calls)).toMatch(/Dinner/)
  })

  for (const ok of [
    'I spent $20 on sushi',
    'I spent $12 on wine',
    'send $50 to Varsha',
    'what did I spend last week?',
    'move $200 to travel, then pay rent',
    'kal 300 ka khana kharch kiya',
    'balance kitna hai',
    'I bought a lamp for $40',
    'I got scammed',
    'my password is hunter2',
    'I paid $80 in tax',
    'the app might crash on the trail',
    'refuses to load, remembers nothing',
  ])
    it(`leaves correct text alone: "${ok}"`, () => {
      expect(fixTypos(ok, accountWords(demo())).fixes).toEqual([])
    })

  it('knows names on the account', () => {
    const app = demo()
    app.contacts = [...app.contacts, { id: 'cx', name: 'Priyanka Shah' }]
    expect(fixTypos('send $5 to priyanka', accountWords(app)).fixes).toEqual([])
    expect(fixTypos('send $5 to priyanak', accountWords(app)).text).toBe('send $5 to priyanka')
  })
})

/* ================================================================== */
describe('live data (rates, crypto, holidays)', () => {
  const RATES = { amount: 1, base: 'USD', date: '2026-11-06', rates: { EUR: 0.9, GBP: 0.75, JPY: 150, INR: 90, CAD: 1.4 } }
  const COINS_DATA = {
    bitcoin: { usd: 75000, usd_24h_change: 1.5, eur: 67500, eur_24h_change: 1.2 },
    ethereum: { usd: 2200, usd_24h_change: -2.25, eur: 1980, eur_24h_change: -2 },
    solana: { usd: 150, usd_24h_change: 0.5, eur: 135, eur_24h_change: 0.4 },
  }
  const HOLIDAYS = [
    { date: '2026-11-11', name: 'Veterans Day', global: true, types: ['Public', 'Bank'] },
    { date: '2026-11-26', name: 'Thanksgiving Day', global: true, types: ['Public'] },
    { date: '2026-12-25', name: 'Christmas Day', global: true, types: ['Public'] },
  ]
  let urls = []
  beforeEach(() => {
    urls = []
    clearLiveCache()
    vi.stubGlobal('fetch', async (url) => {
      urls.push(String(url))
      const body = url.includes('frankfurter') ? RATES : url.includes('coingecko') ? COINS_DATA : url.includes('/2026/') ? HOLIDAYS : []
      return { ok: true, status: 200, json: async () => structuredClone(body) }
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  const live = async (app, text) => {
    const r = ask(app, text)
    expect(r.later, `expected an online lookup for: ${text}`).toBeTypeOf('function')
    return r.later()
  }

  it('converts "$100 in euros"', async () => {
    const r = await live(demo(), 'what’s $100 in euros?')
    expect(plain(r)).toMatch(/\$100\.00 is €90\.00/)
    expect(plain(r)).toMatch(/1 USD = 0\.9 EUR/)
  })
  it('converts "100 euros to dollars" the right way round', async () => {
    expect(plain(await live(demo(), '100 euros to dollars'))).toMatch(/€100\.00 is \$111\.11/)
  })
  it('converts between two other currencies', async () => {
    expect(plain(await live(demo(), 'convert 50 pounds to rupees'))).toMatch(/£50\.00 is ₹6,000\.00/)
  })
  it('answers "usd to eur" with the rate', async () => {
    expect(plain(await live(demo(), 'usd to eur'))).toMatch(/\$1\.00 is €0\.90/)
  })
  it('does not mistake canadian dollars for US dollars', async () => {
    expect(plain(await live(demo(), '100 canadian dollars in euros'))).toMatch(/CA\$100\.00 is €64\.29/)
  })
  it('keeps "show it in euros" as a display switch', () => {
    const r = ask(demo(), 'show it in euros')
    expect(r.later).toBeFalsy()
    expect(r.run).toBeTypeOf('function')
  })
  for (const c of ['send $50 to Nikhil', 'I spent 20 euros on lunch', 'move $200 to travel', 'pay rent'])
    it(`money actions are not conversions: "${c}"`, () => expect(ask(demo(), c).later).toBeFalsy())

  it('caches rates instead of calling again', async () => {
    await live(demo(), 'usd to eur')
    await live(demo(), 'usd to gbp')
    expect(urls.filter((u) => u.includes('frankfurter'))).toHaveLength(1)
  })

  it('gives a crypto price with the 24-hour change', async () => {
    const r = await live(demo(), 'bitcoin price')
    expect(plain(r)).toMatch(/Bitcoin is \$75,000\.00 \(\+1\.5% in 24 hours\)/)
    expect(plain(r)).toMatch(/not advice/)
  })
  it('shows crypto in the dashboard currency', async () => {
    const app = demo()
    app.currency = 'EUR'
    expect(plain(await live(app, 'how is eth doing'))).toMatch(/Ethereum is €1,980\.00 \(−2\.0% in 24 hours\)/)
  })
  it('lists the main coins for "crypto prices"', async () => {
    const r = await live(demo(), 'crypto prices')
    expect(r.card.items.map((i) => i.label)).toEqual(['BTC', 'ETH', 'SOL'])
  })
  it('still refuses crypto advice', () => {
    const r = ask(demo(), 'should I buy bitcoin')
    expect(r.later).toBeFalsy()
    expect(plain(r)).toMatch(/can’t give investment advice/)
  })

  it('lists upcoming holidays', async () => {
    const r = await live(demo(), 'any bank holidays soon?') // demo "today" is Oct 28 2026
    expect(plain(r)).toMatch(/Veterans Day/)
    expect(plain(r)).toMatch(/Thanksgiving Day/)
  })
  it('answers "are banks open on <day>"', async () => {
    const app = demo()
    app.now = new Date(2026, 10, 9, 12) // Monday Nov 9; Wednesday is the 11th
    expect(plain(await live(app, 'are banks open on wednesday in the us'))).toMatch(/Yes, .* is Veterans Day/)
    expect(plain(await live(app, 'are banks open tomorrow in the us'))).toMatch(/No, .* normal working day/)
    expect(plain(await live(app, 'is saturday a holiday in the us'))).toMatch(/weekend/)
  })
  it('warns when a bill falls on a bank holiday', async () => {
    const app = rich()
    app.now = new Date(2026, 10, 6, 12)
    app.bills = [{ id: 'b9', name: 'Gym', amount: 40, dueDate: '2026-11-11' }]
    expect(plain(await live(app, 'next holiday in the us'))).toMatch(/Gym is due on Veterans Day/)
  })
  it('a holiday you pay for is spending, not a date question', () => {
    expect(ask(demo(), 'I spent $500 on a holiday').later).toBeFalsy()
    expect(ask(demo(), 'save $2000 for a holiday by june').later).toBeFalsy()
  })

  it('stays friendly when offline', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    expect(plain(await live(demo(), 'litecoin price'))).toMatch(/can’t reach that service/)
  })
})

/* ================================================================== */
describe('any coin or stock', () => {
  const SEARCH = {
    pepe: [{ id: 'pepe', name: 'Pepe', symbol: 'pepe', market_cap_rank: 45 }],
    chainlink: [{ id: 'chainlink', name: 'Chainlink', symbol: 'link', market_cap_rank: 15 }],
    nvidia: [{ id: 'nvidia-xstock', name: 'NVIDIA xStock', symbol: 'nvdax', market_cap_rank: null }],
    apple: [{ id: 'apple-token', name: 'Apple Token', symbol: 'apple', market_cap_rank: 4000 }],
    zzzz: [],
  }
  const MARKETS = {
    pepe: {
      id: 'pepe',
      name: 'Pepe',
      symbol: 'pepe',
      current_price: 0.0000071,
      price_change_percentage_24h: 4.2,
      sparkline_in_7d: { price: [1, 2] },
    },
    chainlink: {
      id: 'chainlink',
      name: 'Chainlink',
      symbol: 'link',
      current_price: 14.5,
      price_change_percentage_24h: -1.1,
      sparkline_in_7d: { price: [1, 2] },
    },
    bitcoin: {
      id: 'bitcoin',
      name: 'Bitcoin',
      symbol: 'btc',
      current_price: 75000,
      price_change_percentage_24h: 1,
      sparkline_in_7d: { price: [1, 2] },
    },
  }
  const STOCKS = {
    NVDA: { symbol: 'NVDA', name: 'NVIDIA Corp', currency: 'USD', price: 190.5, change: 2.5, high: 192, low: 187, open: 188, prev: 185.9 },
    AAPL: { symbol: 'AAPL', name: 'Apple Inc', currency: 'USD', price: 228.4, change: -0.6, high: 230, low: 226.1, open: 229, prev: 229.8 },
  }
  const STOCK_SEARCH = {
    nvidia: [{ symbol: 'NVDA', name: 'NVIDIA CORP', type: 'Common Stock' }],
    apple: [{ symbol: 'AAPL', name: 'APPLE INC', type: 'Common Stock' }],
    aapl: [{ symbol: 'AAPL', name: 'APPLE INC', type: 'Common Stock' }],
  }
  let stocksStatus = 200
  beforeEach(() => {
    clearLiveCache()
    stocksStatus = 200
    vi.stubGlobal('fetch', async (u) => {
      const url = new URL(String(u))
      const ok = (body, status = 200) => ({ ok: status < 300, status, json: async () => structuredClone(body) })
      if (url.pathname.endsWith('/search')) return ok({ coins: SEARCH[url.searchParams.get('query')] ?? [] })
      if (url.pathname.endsWith('/coins/markets'))
        return ok(
          url.searchParams
            .get('ids')
            .split(',')
            .map((id) => MARKETS[id])
            .filter(Boolean),
        )
      if (url.pathname.endsWith('/functions/v1/stocks')) {
        if (stocksStatus !== 200) return ok({ error: 'not set up' }, stocksStatus)
        const q = url.searchParams.get('q')
        if (q) return ok({ results: STOCK_SEARCH[q.toLowerCase()] ?? [] })
        return ok({
          quotes: url.searchParams
            .get('symbols')
            .split(',')
            .map((s) => STOCKS[s])
            .filter(Boolean),
        })
      }
      return ok({})
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  const live = async (app, text) => {
    const r = ask(app, text)
    expect(r.later, `expected an online lookup for: ${text}`).toBeTypeOf('function')
    return r.later()
  }
  const withList = () => {
    const app = demo()
    app.watchlist = { crypto: ['bitcoin'], stocks: ['AAPL'] }
    return app
  }

  it('prices any coin by name', async () => {
    const r = await live(withList(), 'price of pepe')
    expect(plain(r)).toMatch(/Pepe \(PEPE\) is \$0\.0000071 \(\+4\.2% in 24 hours\)/)
    expect(r.chips.map((c) => c.q)).toContain('watch crypto pepe')
  })
  it('understands "how is chainlink doing"', async () => {
    expect(plain(await live(withList(), 'how is chainlink doing'))).toMatch(/Chainlink \(LINK\) is \$14\.50/)
  })
  it('prices any US stock', async () => {
    const r = await live(withList(), 'nvidia stock price')
    expect(plain(r)).toMatch(/NVIDIA Corp \(NVDA\) is \$190\.50 \(\+2\.5% today\)/)
    expect(plain(r)).toMatch(/range: \$187\.00 to \$192\.00/)
  })
  it('prefers the company over an obscure token with the same name', async () => {
    expect(plain(await live(withList(), 'apple price'))).toMatch(/Apple Inc \(AAPL\)/)
  })
  it('reads cashtags like $AAPL as stocks', async () => {
    expect(plain(await live(withList(), 'what about $AAPL'))).toMatch(/Apple Inc \(AAPL\) is \$228\.40/)
  })
  it('says so when nothing matches', async () => {
    expect(plain(await live(withList(), 'price of zzzz coin'))).toMatch(/couldn’t find a coin or stock called “zzzz”/)
  })
  it('explains the setup when stocks are not switched on', async () => {
    stocksStatus = 404
    expect(plain(await live(withList(), 'tesla stock price'))).toMatch(/Stock prices aren’t switched on yet/)
  })
  it('lists the stocks on the watchlist', async () => {
    const r = await live(withList(), 'my stocks')
    expect(plain(r)).toMatch(/Apple Inc \(AAPL\): \$228\.40, −0\.6%/)
  })
  it('adds a coin to the watchlist from a sentence', async () => {
    const app = withList()
    const r = await live(app, 'add chainlink to my watchlist')
    expect(plain(r)).toMatch(/Added Chainlink \(LINK\) to your watchlist/)
    r.run()
    expect(app.calls).toContainEqual({ name: 'watch', args: ['crypto', 'chainlink'] })
  })
  it('adds from the chip without going online', () => {
    const app = withList()
    const r = ask(app, 'watch stocks NVDA')
    expect(r.later).toBeFalsy()
    r.run()
    expect(app.calls).toContainEqual({ name: 'watch', args: ['stocks', 'NVDA'] })
  })
  it('removes something already on the list', () => {
    const app = withList()
    const r = ask(app, 'remove AAPL from my watchlist')
    r.run()
    expect(app.calls).toContainEqual({ name: 'unwatch', args: ['stocks', 'AAPL'] })
  })
  for (const c of ['what’s the price of rent', 'food price', 'should I buy nvidia stock', 'I spent $40 on gas', 'show my balance', 'gold price'])
    it(`leaves other questions alone: "${c}"`, () => {
      const r = ask(withList(), c)
      expect(r.later).toBeFalsy()
    })
})

/* ================================================================== */
describe('investing (recorded, valued live)', () => {
  const COINS_SEARCH = {
    bitcoin: [{ id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', market_cap_rank: 1 }],
    eth: [{ id: 'ethereum', name: 'Ethereum', symbol: 'eth', market_cap_rank: 2 }],
    nvidia: [],
    apple: [{ id: 'apple-token', name: 'Apple Token', symbol: 'apple', market_cap_rank: 4000 }],
  }
  const MARKETS = {
    bitcoin: { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', current_price: 80000, price_change_percentage_24h: 1 },
    ethereum: { id: 'ethereum', name: 'Ethereum', symbol: 'eth', current_price: 2000, price_change_percentage_24h: -1 },
  }
  const STOCKS = {
    AAPL: { symbol: 'AAPL', name: 'Apple Inc', currency: 'USD', price: 250, change: 1, high: 251, low: 247 },
    NVDA: { symbol: 'NVDA', name: 'NVIDIA Corp', currency: 'USD', price: 200, change: 2, high: 201, low: 195 },
  }
  const STOCK_SEARCH = {
    apple: [{ symbol: 'AAPL', name: 'APPLE INC', type: 'Common Stock' }],
    nvidia: [{ symbol: 'NVDA', name: 'NVIDIA CORP', type: 'Common Stock' }],
  }
  beforeEach(() => {
    clearLiveCache()
    vi.stubGlobal('fetch', async (u) => {
      const url = new URL(String(u))
      const ok = (body) => ({ ok: true, status: 200, json: async () => structuredClone(body) })
      if (url.pathname.endsWith('/search')) return ok({ coins: COINS_SEARCH[url.searchParams.get('query')] ?? [] })
      if (url.pathname.endsWith('/coins/markets'))
        return ok(
          url.searchParams
            .get('ids')
            .split(',')
            .map((id) => MARKETS[id])
            .filter(Boolean),
        )
      if (url.pathname.endsWith('/functions/v1/stocks')) {
        const q = url.searchParams.get('q')
        if (q) return ok({ results: STOCK_SEARCH[q.toLowerCase()] ?? [] })
        return ok({
          quotes: url.searchParams
            .get('symbols')
            .split(',')
            .map((x) => STOCKS[x])
            .filter(Boolean),
        })
      }
      return ok({})
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  const live = async (app, text) => {
    const r = ask(app, text)
    expect(r.later, `expected an online lookup for: ${text}`).toBeTypeOf('function')
    return r.later()
  }
  const investor = () => {
    const app = makeApp({ balance: 5000, now: new Date(2026, 10, 6, 12) })
    app.holdings = [
      { id: 'h1', kind: 'crypto', asset: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', qty: 0.05, cost: 3000 },
      { id: 'h2', kind: 'stocks', asset: 'AAPL', name: 'Apple Inc', symbol: 'AAPL', qty: 4, cost: 1100 },
    ]
    return app
  }

  it('buys a dollar amount of a coin, after a confirm', async () => {
    const app = investor()
    const r = await live(app, 'buy $200 of bitcoin')
    expect(plain(r)).toMatch(/Buy 0\.0025 BTC \(Bitcoin\) for \$200\.00 at \$80,000\.00 each/)
    expect(r.confirm.note).toMatch(/no real trade is placed/)
    expect(app.calls.find((c) => c.name === 'invest')).toBeFalsy()
    r.confirm.run()
    expect(app.calls).toContainEqual({
      name: 'invest',
      args: [{ kind: 'crypto', asset: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', amount: 200, price: 80000 }],
    })
  })
  it('invests in a stock by name', async () => {
    const r = await live(investor(), 'invest $500 in nvidia')
    expect(plain(r)).toMatch(/Buy 2\.5 NVDA \(NVIDIA CORP\) for \$500\.00/)
  })
  it('buys a number of shares', async () => {
    const r = await live(investor(), 'buy 2 shares of apple')
    expect(plain(r)).toMatch(/Buy 2 AAPL .* for \$500\.00/)
  })
  it('asks how much when no amount is given', async () => {
    const r = await live(investor(), 'buy bitcoin')
    expect(plain(r)).toMatch(/How much would you like to put into Bitcoin/)
    expect(r.chips.map((c) => c.q)).toContain('buy $100 of bitcoin')
  })
  it('will not spend more than is unassigned', async () => {
    expect(plain(await live(investor(), 'buy $9000 of eth'))).toMatch(/you only have \$5,000\.00 unassigned/)
  })
  it('sells half a holding with the profit shown', async () => {
    const app = investor()
    const r = await live(app, 'sell half my bitcoin')
    expect(plain(r)).toMatch(/Sell 0\.025 BTC for about \$2,000\.00\? That’s \$500\.00 profit/)
    r.confirm.run()
    expect(app.calls).toContainEqual({ name: 'sellHolding', args: [{ id: 'h1', qty: 0.025, price: 80000 }] })
  })
  it('sells everything and shows a loss', async () => {
    expect(plain(await live(investor(), 'sell my apple shares'))).toMatch(/Sell 4 AAPL for about \$1,000\.00\? That’s \$100\.00 loss/)
  })
  it('says so when there is nothing to sell', () => {
    expect(plain(ask(investor(), 'sell my dogecoin'))).toMatch(/don’t have any dogecoin recorded/)
  })
  it('sums up the portfolio', async () => {
    const r = await live(investor(), 'how are my investments')
    expect(plain(r)).toMatch(/worth \$5,000\.00, \+\$900\.00 \(\+22\.0%\)/)
  })
  it('still refuses to recommend', () => {
    for (const q of ['should I buy bitcoin', 'what stocks should I buy?', 'is apple a good investment'])
      expect(plain(ask(investor(), q))).toMatch(/can’t give investment advice/)
    expect(plain(ask(investor(), 'invest in crypto'))).toMatch(/can’t recommend what to buy/)
  })
  it('does not mistake shopping for investing', () => {
    expect(ask(investor(), 'buy coffee for $5').later).toBeFalsy()
    expect(ask(investor(), 'I bought a laptop for $900').later).toBeFalsy()
  })
})

/* ================================================================== */
describe('Grace on guard', () => {
  const guarded = (guard = { lock: 15, limit: 500, newPayee: true, privacy: false }) => {
    const app = demo()
    app.guard = guard
    return app
  }

  it('locks the app on request', () => {
    const app = guarded()
    const r = ask(app, 'lock the app')
    expect(plain(r)).toMatch(/Locked/)
    r.run()
    expect(app.calls).toContainEqual({ name: 'lockNow', args: ['manual'] })
  })
  it('runs a security check with what is off', () => {
    const r = ask(guarded({ lock: 0, limit: 500, newPayee: true, privacy: false }), 'am I safe?')
    expect(plain(r)).toMatch(/2 of 4 protections are on/)
    expect(plain(r)).toMatch(/Auto-lock: off/)
    expect(plain(r)).toMatch(/Large payment guard from \$500/)
    expect(r.chips.map((c) => c.q)).toEqual(['turn on auto-lock', 'turn on privacy blur'])
  })
  it('praises a fully guarded account', () => {
    expect(plain(ask(guarded({ lock: 5, limit: 300, newPayee: true, privacy: true }), 'security check'))).toMatch(
      /4 of 4[\s\S]*Everything is guarded/,
    )
  })
  it('changes guard settings from a sentence', () => {
    const cases = [
      ['auto-lock after 5 minutes', { lock: 5 }],
      ['turn off auto-lock', { lock: 0 }],
      ['set my guard limit to $300', { limit: 300 }],
      ['turn off the payment guard', { limit: 0 }],
      ['turn on privacy blur', { privacy: true }],
      ['turn off first payment warnings', { newPayee: false }],
    ]
    for (const [q, patch] of cases) {
      const app = guarded()
      const r = ask(app, q)
      r.run()
      expect(app.calls, q).toContainEqual({ name: 'setGuard', args: [patch] })
    }
  })
  it('needs a second tap for payments at or above the limit', () => {
    const r = ask(guarded(), 'send $600 to Nikhil')
    expect(r.confirm.guard).toBe(true)
    expect(r.confirm.note).toMatch(/At or above your \$500 guard limit/)
  })
  it('leaves small payments as one tap', () => {
    expect(ask(guarded(), 'send $50 to Nikhil').confirm.guard).toBeFalsy()
  })
  it('has no extra step when the guard is off', () => {
    expect(ask(guarded({ lock: 0, limit: 0, newPayee: false, privacy: false }), 'send $600 to Nikhil').confirm.guard).toBeFalsy()
  })
  for (const c of [
    'someone called and asked me to buy gift cards',
    'the bank texted me to move my money to a safe account',
    'a caller wants me to install anydesk',
    'I won a lottery but need to pay a release fee',
    'this guy says he can double my bitcoin',
    'is this a scam?',
    'tech support called and asked for my code',
  ])
    it(`warns about scams: "${c}"`, () => {
      const r = ask(guarded(), c)
      expect(plain(r)).toMatch(/sounds like a scam/)
      expect(r.confirm).toBeFalsy()
    })
  for (const c of ['I spent $50 on a gift card', 'my landlord asked me to pay rent', 'Maya wants me to send $20', 'what is a chargeback'])
    it(`no scam warning for: "${c}"`, () => {
      expect(plain(ask(guarded(), c))).not.toMatch(/sounds like a scam/)
    })
})

/* ================================================================== */
describe('account deletion and deactivation', () => {
  const account = () => {
    const app = demo()
    app.demo = false
    return app
  }
  for (const c of ['delete my account', 'please close my account', 'remove my profile'])
    it(`never deletes from chat: "${c}"`, () => {
      const app = account()
      const r = ask(app, c)
      expect(plain(r)).toMatch(/can’t delete your account from chat/)
      expect(r.confirm).toBeFalsy()
      expect(r.run).toBeFalsy()
      r.links[0].run()
      expect(app.calls).toContainEqual({ name: 'openModal', args: ['account'] })
    })
  it('points to deactivation', () => {
    expect(plain(ask(account(), 'deactivate my account'))).toMatch(/deactivate your account in Account settings/)
  })
  it('explains there is nothing to delete in the demo', () => {
    const app = demo()
    app.demo = true
    expect(plain(ask(app, 'delete my account'))).toMatch(/This is the demo/)
  })
})
