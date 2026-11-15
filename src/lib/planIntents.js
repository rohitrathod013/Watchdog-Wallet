/* ------------------------------------------------------------------
   Grace and the planning tools: locked budgets ("can I spend $60 on
   dinner?", "how much is free to spend?", "lock my groceries budget"),
   rollover ("turn on rollover for groceries", "what carried over?") and
   repeating transactions ("what's coming out this week?").
   Each returns a reply, or null when the message isn't one of these.
   ------------------------------------------------------------------ */
import { checkPayment, setAside } from './envelopes'
import { EVERY_LABEL } from './recurring'
import { nextDays, dayOf } from './upcoming'
import { categoryIn } from './ml/grace.js'
import { makeTrace } from './trace'
import { money } from './format'
import { t } from './i18n'

const chip = (q, key = q, vars) => ({ q, label: t(key, vars) })
const parseAmount = (s) => {
  const m = s.match(/(?:\$|usd\s?)?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)
  return n > 0 ? n : null
}
const names = (rows) => rows.map((r) => t(r.name)).join(', ')
const dayText = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
// a date in the future ("by March", "next month") is a planning question: the usual afford answer handles it
const LATER = /\b(by|in|until|before|next) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|month|year|summer|winter|spring)/
const SPEND_Q = /\b(can i (afford|spend|buy|get|pay( for)?)|afford|is it ok(ay)? (to|if i) (spend|buy|pay))\b/

/** The budget a message names: by its own name, or the category it's about. */
function budgetIn(s, budgets) {
  const own = [...budgets].sort((a, b) => b.name.length - a.name.length).find((b) => s.includes(b.name.toLowerCase()))
  if (own) return own
  const cat = categoryIn(s, budgets.map((b) => b.name))
  return cat ? budgets.find((b) => b.name === cat) : null
}

function spendCheck(s, app) {
  const amount = parseAmount(s)
  if (!amount || LATER.test(s)) return null
  const budgets = app.budgets ?? []
  const aside = setAside(budgets, app.balance ?? 0)
  if (!aside.any) return null
  const category = categoryIn(s, budgets.map((b) => b.name))
  const c = checkPayment({ budgets, balance: app.balance ?? 0, amount, category: category ?? '', card: true })
  const others = aside.rows.filter((r) => r.left > 0 && r.name !== c.budget?.name)
  const trace = makeTrace(
    t('Can this go on your card?'),
    t('A card payment uses its own category’s locked budget first, then free money. Free money = balance − everything locked for budgets.'),
    [],
    [
      t('Balance: {amount}', { amount: money(app.balance ?? 0) }),
      ...aside.rows.map((r) => t('Locked for {name}: {amount}', { name: t(r.name), amount: money(r.left) })),
      t('Free to spend: {amount}', { amount: money(aside.free) }),
      ...(c.budget ? [t('From the {name} budget: {amount}', { name: t(c.budget.name), amount: money(c.fromBudget) })] : []),
      t('From free money: {amount}', { amount: money(c.fromFree) }),
    ],
    null,
    { value: c.ok ? amount : 0 },
  )
  const what = category ? t('{amount} on {category}', { amount: money(amount), category: t(category) }) : money(amount)
  if (c.ok && c.budget && c.fromBudget > 0)
    return {
      text:
        c.fromFree > 0
          ? t('Yes. **{what}** takes the {left} left in your locked {name} budget plus {extra} of free money. You’d have {free} free after.', {
              what,
              left: money(c.fromBudget),
              name: t(c.budget.name),
              extra: money(c.fromFree),
              free: money(c.free - c.fromFree),
            })
          : t('Yes. **{what}** comes out of your locked {name} budget, leaving {left} in it. Your free money stays at {free}.', {
              what,
              name: t(c.budget.name),
              left: money(c.budget.left - c.fromBudget),
              free: money(c.free),
            }),
      mood: 'happy',
      traces: [trace],
      chips: [chip('How much is free to spend?')],
    }
  if (c.ok)
    return {
      text:
        t('Yes, from free money. **{what}** would leave you {free} free to spend.', { what, free: money(c.free - c.fromFree) }) +
        (others.length ? ` ${t('{locked} stays locked for {names}.', { locked: money(others.reduce((x, r) => x + r.left, 0)), names: names(others) })}` : ''),
      mood: 'happy',
      traces: [trace],
      chips: [chip('How much is free to spend?')],
    }
  const blocked = c.blockedBy
  return {
    text:
      t('Not by card. **{what}** would dip into money locked for {names}, so it would be declined.', { what, names: names(blocked) }) +
      ` ${
        c.budget
          ? t('You can use {left} from {name} plus {free} free money.', { left: money(c.budget.left), name: t(c.budget.name), free: money(c.free) })
          : t('Free to spend: {free}.', { free: money(c.free) })
      }`,
    traces: [trace],
    chips: blocked.slice(0, 2).map((r) => chip(`Unlock my ${r.name} budget`, 'Unlock {name}', { name: t(r.name) })),
  }
}

function freeMoney(app) {
  const aside = setAside(app.budgets ?? [], app.balance ?? 0)
  if (!aside.any)
    return {
      text: t('Nothing is locked, so all of your {balance} is free to spend. Lock a budget on the Budget page to keep its money for that category only.', {
        balance: money(app.balance ?? 0),
      }),
      links: [{ label: t('Open Budget'), run: () => app.go?.('budget') }],
    }
  return {
    text: `${t('**{free}** is free to spend. {locked} is locked:', { free: money(aside.free), locked: money(aside.total) })}\n${aside.rows
      .map((r) => `• ${t('{name}: {amount}', { name: t(r.name), amount: money(r.left) })}`)
      .join('\n')}\n${t('Card payments for anything else, and transfers, can only use the free money.')}`,
    traces: [
      makeTrace(
        t('Free to spend'),
        t('Balance − what’s left in each locked budget this month.'),
        [],
        [t('Balance: {amount}', { amount: money(app.balance ?? 0) }), ...aside.rows.map((r) => t('Locked for {name}: {amount}', { name: t(r.name), amount: money(r.left) }))],
        null,
        { value: aside.free },
      ),
    ],
    chips: [chip('Can I spend $50 on dinner?')],
  }
}

/** "lock my groceries budget", "unlock groceries", "turn on rollover for groceries". */
function budgetAction(s, app) {
  const lock = /\b(un)?lock\b/.test(s) && /\bbudget\b|\b(groceries|grocery|dining|food|shopping|transport|housing|entertainment|health)\b/.test(s)
  const roll = /\b(roll ?over|carry (it )?over|carry forward)\b/.test(s) && /\b(turn|switch|set|start|stop|enable|disable|on|off|for)\b/.test(s)
  if (!lock && !roll) return null
  const budgets = app.budgets ?? []
  const b = budgetIn(s, budgets)
  if (!b)
    return {
      text: t('Which budget? You have: {names}.', { names: names(budgets) }),
      chips: budgets.slice(0, 3).map((x) => chip(`${roll ? 'Turn on rollover for' : 'Lock my'} ${x.name}${roll ? '' : ' budget'}`, x.name)),
    }
  if (roll) {
    const want = !/\b(off|stop|disable|no more|don'?t)\b/.test(s)
    if (Boolean(b.rollover) === want)
      return { text: want ? t('Rollover is already on for {name}.', { name: t(b.name) }) : t('Rollover is already off for {name}.', { name: t(b.name) }) }
    return {
      text: want
        ? t('Turn on rollover for **{name}**? Whatever it doesn’t use each month is added to the next.', { name: t(b.name) })
        : t('Turn off rollover for **{name}**? It goes back to {limit} each month.', { name: t(b.name), limit: money(b.baseLimit ?? b.limit) }),
      confirm: {
        label: want ? t('Turn on rollover') : t('Turn off rollover'),
        note: t(b.name),
        run: () => app.toggleBudgetRollover?.(b.id),
        done: want ? t('Done ✅ {name} now carries over what’s left.', { name: t(b.name) }) : t('Done ✅ Rollover is off for {name}.', { name: t(b.name) }),
      },
    }
  }
  const want = !/\bunlock\b/.test(s)
  if (Boolean(b.locked) === want)
    return { text: want ? t('{name} is already locked.', { name: t(b.name) }) : t('{name} isn’t locked.', { name: t(b.name) }) }
  const left = Math.max(0, (b.limit ?? 0) - (b.spent ?? 0))
  return {
    text: want
      ? t('Lock **{name}**? The {left} left in it can then only go on {name} with your card. Other card payments and transfers can’t touch it.', {
          name: t(b.name),
          left: money(left),
        })
      : t('Unlock **{name}**? Its {left} can then be spent on anything.', { name: t(b.name), left: money(left) }),
    confirm: {
      label: want ? t('Lock budget') : t('Unlock budget'),
      note: t(b.name),
      run: () => app.toggleBudgetLock?.(b.id),
      done: want ? t('Locked 🔒 {name} money is kept for {name}.', { name: t(b.name) }) : t('Unlocked. {name} money can go on anything now.', { name: t(b.name) }),
    },
  }
}

function carried(app) {
  const on = (app.budgets ?? []).filter((b) => b.rollover)
  if (!on.length)
    return {
      text: t('No budget has rollover on. With it on, whatever a budget doesn’t use is added to next month.'),
      chips: (app.budgets ?? []).slice(0, 2).map((b) => chip(`Turn on rollover for ${b.name}`, 'Rollover for {name}', { name: t(b.name) })),
    }
  return {
    text: `${t('Rollover is on for {n}:', { n: on.length })}\n${on
      .map(
        (b) =>
          `• ${
            b.carry > 0
              ? t('**{name}**: {limit} limit + {carry} carried over = {total} this month', {
                  name: t(b.name),
                  limit: money(b.baseLimit ?? b.limit),
                  carry: money(b.carry),
                  total: money(b.limit),
                })
              : t('**{name}**: nothing carried over yet', { name: t(b.name) })
          }`,
      )
      .join('\n')}`,
  }
}

function coming(s, app) {
  const now = app.now ?? new Date()
  const month = /\b(this month|rest of the month|till the end of the month|before (payday|the end of the month))\b/.test(s)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const days = month ? Math.round((end - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000) + 1 : 7
  const list = nextDays(app, days, now)
  const span = month ? t('before the month ends') : t('in the next 7 days')
  if (!list.length)
    return {
      text:
        t('Nothing scheduled {span}.', { span }) +
        ((app.recurring ?? []).length ? '' : ` ${t('Set up rent, salary or subscriptions under Repeating on the Transactions tab and I’ll keep track.')}`),
      links: [{ label: t('Repeating transactions'), run: () => app.openModal?.('recurring') }],
    }
  const out = list.filter((x) => x.amount < 0).reduce((n, x) => n - x.amount, 0)
  const income = list.filter((x) => x.amount > 0).reduce((n, x) => n + x.amount, 0)
  return {
    text:
      `${t('Coming up {span}:', { span })}\n${list
        .map((x) => `• ${dayText(x.day)}: **${x.name}** ${x.amount < 0 ? '−' : '+'}${money(Math.abs(x.amount))}${x.source === 'bill' ? ` (${t('bill')})` : ''}`)
        .join('\n')}\n` +
      (income ? t('{out} going out and {income} coming in.', { out: money(out), income: money(income) }) : t('{out} going out in total.', { out: money(out) })),
    traces: [
      makeTrace(
        t('Coming up'),
        t('Repeating transactions’ next dates and unpaid bills’ due dates in the range.'),
        [],
        list.map((x) => `${x.day}: ${x.name} ${x.amount < 0 ? '−' : '+'}${money(Math.abs(x.amount))}`),
        { from: dayOf(now), to: list[list.length - 1].day },
        { value: income - out },
      ),
    ],
    chips: [chip(month ? 'What’s coming out this week?' : 'What’s coming out this month?'), chip('Forecast my month')],
  }
}

function repeatsList(app) {
  const rules = app.recurring ?? []
  return {
    text: `${t('You have {n} repeating transactions:', { n: rules.length })}\n${rules
      .map(
        (r) =>
          `• **${r.name}** ${r.amount < 0 ? '−' : '+'}${money(Math.abs(r.amount))}, ${t(EVERY_LABEL[r.every]).toLowerCase()}, ${
            r.active ? t('next on {date}', { date: dayText(r.next) }) : t('Paused').toLowerCase()
          }`,
      )
      .join('\n')}`,
    links: [{ label: t('Manage repeating'), run: () => app.openModal?.('recurring') }],
  }
}

export function planIntent(s, app) {
  if (app.stats?.demo) return null
  // "how do I lock a budget?", "what is rollover?": explained by the help answers, not acted on
  const howTo = /^(how|where|what is|what are|what does|why)\b/.test(s) && !/\bhow much\b/.test(s)
  if (SPEND_Q.test(s)) return spendCheck(s, app)
  if (/\b(how much (is |money is |do i have )?(free|unlocked)( to spend)?|free (money|to spend)|what'?s locked|how much is locked|locked (money|budgets?))\b/.test(s)) return freeMoney(app)
  const act = howTo ? null : budgetAction(s, app)
  if (act) return act
  if (!howTo && /\b(roll ?over|carried over|carry ?over)\b/.test(s)) return carried(app)
  if (
    /\b(what'?s|what is|what will be|anything) (coming (up|out)|going out|due( soon)?)\b|\bupcoming (payments|bills|charges|transactions)\b|\b(payments|charges|bills) (coming up|due) (this|next) (week|month)\b|\bwhat (comes|goes) out\b/.test(
      s,
    )
  )
    return coming(s, app)
  if (!howTo && (app.recurring ?? []).length && /\b(my )?(repeating|recurring|scheduled) (transactions|payments|rules)\b|\bstanding orders?\b|\bwhat repeats\b/.test(s)) return repeatsList(app)
  return null
}
