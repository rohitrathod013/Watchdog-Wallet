/* ------------------------------------------------------------------
   How Grace talks about the on-device models: unusual spending, the
   month-end range, how sure she is, and learning categories from
   corrections. The models only propose; the user decides. Every
   answer carries a reason, a confidence and a "show your work" trace.
   ------------------------------------------------------------------ */
import { detectAnomalies } from './anomaly.js'
import { forecastMonth } from './forecast.js'
import { modelFor, predict, similarTo } from './categorize.js'
import { billDue, EXPENSE_CATEGORIES } from '../stats.js'
import { isoDay, money } from '../format.js'
import { t } from '../i18n.js'
import { dayLabel } from '../trace.js'

const DAY = 86400000
const nowOf = (app) => app.now ?? new Date()

/** The patterns the user said are fine, which stop alerting. */
export const dismissedOf = (verdicts = {}) =>
  Object.values(verdicts)
    .filter((v) => v?.verdict === 'benign' && v.pattern)
    .map((v) => v.pattern)
    .sort()

/** The detector's result for this account: the app's (kept fresh off the main thread), or worked out now. */
export const mlFlags = (app) => app.mlFlags ?? detectAnomalies(app.transactions ?? [], { dismissed: new Set(dismissedOf(app.mlVerdicts)) })

/** Flags the user hasn't answered yet. */
export function openFlags(app) {
  const r = mlFlags(app)
  if (r.status !== 'ok') return []
  const answered = app.mlVerdicts ?? {}
  return r.flags.filter((f) => !answered[f.key])
}

/** For when the chat opens: at most 2, recent, most serious first. Never a flood. */
export function proactiveFlags(app) {
  const since = nowOf(app).getTime() - 45 * DAY
  return openFlags(app)
    .filter((f) => new Date(f.tx.date).getTime() >= since)
    .slice(0, 2)
}

/* ---------------- the month-end range ---------------- */
export function forecastFor(app) {
  const now = nowOf(app)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const bills = (app.bills ?? []).map((b) => ({ ...b, dueDate: b.dueDate ?? isoDay(new Date(today.getTime() + (billDue(b, now).days ?? 0) * DAY)) }))
  return forecastMonth({ transactions: app.transactions ?? [], balance: app.balance ?? 0, bills, now })
}

/** "Most likely about $820 left. 80% chance it lands between $540 and $1,050. 7% chance you go below zero around Oct 26." */
export function rangeText(f) {
  const end = f.end
  const dip =
    f.pBelowZero >= 0.01 && f.dipDay
      ? t('{pct}% chance you go below zero, most likely around {date}.', {
          pct: Math.round(f.pBelowZero * 100),
          date: dayLabel(isoDay(new Date(end.getFullYear(), end.getMonth(), f.dipDay))),
        })
      : t('Less than a 1% chance you go below zero.')
  return [
    t('Most likely about **{p50}** left. 80% chance it lands between {p10} and {p90}.', { p50: money(f.p50), p10: money(f.p10), p90: money(f.p90) }),
    dip,
    f.rough ? t('Rough estimate: I only have {n} days of history, so I widened the range.', { n: f.historyDays }) : null,
  ]
    .filter(Boolean)
    .join(' ')
}

/* ---------------- categories ---------------- */
/** Grace's guess for a name, from this account's model. */
export const guessCategory = (app, name) => predict(modelFor(app.transactions ?? [], app.categoryCorrections ?? []), name)

const ALIASES = [
  ['Groceries', /\b(groceries|grocery|supermarket)\b/],
  ['Food & Dining', /\b(dining|food|restaurants?|eating out|takeaway|takeout|coffee|lunch|dinner)\b/],
  ['Transport', /\b(transport|travel to work|taxi|uber|fuel|gas|commute)\b/],
  ['Utilities', /\b(utilit(y|ies)|electricity|power|water)\b/],
  ['Phone & Internet', /\b(phone|internet|wifi|broadband|mobile)\b/],
  ['Subscriptions', /\b(subscriptions?|streaming)\b/],
  ['Entertainment', /\b(entertainment|fun|movies?|games?)\b/],
  ['Personal Care', /\b(personal care|haircut|beauty|salon)\b/],
  ['Gifts & Donations', /\b(gifts?|donations?|charity)\b/],
  ['Fitness', /\b(fitness|gym|sport)\b/],
]
/** A category named in what the user typed ("it's groceries"). */
export function categoryIn(s, extra = []) {
  const names = [...EXPENSE_CATEGORIES, ...extra].sort((a, b) => b.length - a.length)
  return names.find((n) => s.includes(n.toLowerCase())) ?? ALIASES.find(([, re]) => re.test(s))?.[0] ?? null
}

/* ---------------- the chat ---------------- */
const WHY =
  /\bwhy (did|was|is|would) (you|it|that|this) (flag|flagged|mark|marked|warn|think)|\bwhy (flag|flagged) (that|this|it)\b|\bwhy is (that|this|it) (unusual|suspicious|flagged)\b/
const FINE =
  /^(that'?s|it'?s|that was|it was|this is|that is)\s+(fine|ok|okay|alright|me|expected|normal|legit|legitimate|correct)\b|^(that was me|all good|no worries,? that'?s me)\b|\bmark (it|that|this) (as )?(fine|ok|okay|safe|benign)\b/
const PROBLEM =
  /^(that'?s|it'?s|this is|that is)\s+(not me|a problem|wrong charge|not mine|suspicious|fraud)\b|\bi didn'?t (make|buy|spend) (that|this|it)\b|\bmark (it|that|this) as (a )?problem\b/
const SURE = /\bhow (sure|confident|certain|accurate) (are you|is (that|this|it))\b|\bhow sure\b|\bconfidence\b/
const WRONG =
  /\b(that'?s|it'?s|this is|that is|category is) (wrong|not right|incorrect)\b|\bwrong category\b|\b(recategori[sz]e|re-categori[sz]e|change (the |its |that )?category|should be (under|in)|put (it|that|this) (under|in))\b|^(no,? )?(it'?s|its|it is|that'?s) (actually |really )?(a |an )?(groceries|grocery|dining|food|transport|utilities|shopping|entertainment|health|bills?|travel|education|pets?|kids|fitness|subscriptions?|personal care|insurance|taxes|housing|gifts?)\b/

const flagLine = (f) =>
  t('**{name}** · {amount} on {date}: {reason}', {
    name: f.tx.name,
    amount: money(-f.tx.amount),
    date: dayLabel(f.tx.date.slice(0, 10)),
    reason: f.reasons[0],
  })

/** The transaction a correction is about: the last one Grace talked about. */
function lastTx(app, memory) {
  const want = memory.lastTx
  if (!want) return null
  const list = app.transactions ?? []
  return (
    (want.id && list.find((x) => x.id === want.id)) ||
    list.filter((x) => x.name === want.name && Math.abs(x.amount - want.amount) < 0.005).sort((a, b) => b.date.localeCompare(a.date))[0] ||
    null
  )
}

/**
 * Grace's ML follow-ups: "why did you flag that?", "that's fine", "how sure are you?",
 * "that's wrong, it's groceries". Returns null when it isn't one of these.
 */
export function mlIntent(s, app, memory = {}) {
  const flag = memory.lastFlags?.[0] ?? null

  if (WHY.test(s)) {
    if (!flag) return { text: t('I haven’t flagged anything in this chat yet. Ask “anything unusual?” and I’ll check.') }
    return {
      text: `${t('I flagged **{name}** ({amount} on {date}) because:', { name: flag.tx.name, amount: money(-flag.tx.amount), date: dayLabel(flag.tx.date.slice(0, 10)) })}\n${flag.reasons.map((r) => `• ${r}`).join('\n')}\n${t('That’s a pattern check, not a verdict. You know your spending best.')}`,
      traces: flag.trace ? [flag.trace] : undefined,
      card: { type: 'flags', flags: [flag] },
      memory: { lastMl: { kind: 'flag', flag } },
    }
  }

  if (flag && FINE.test(s))
    return {
      text: t('Got it 👍 I’ve marked **{name}** as fine and won’t flag that pattern again.', { name: flag.tx.name }),
      run: () => app.setFlagVerdict?.(flag, 'benign'),
      memory: { lastFlags: memory.lastFlags.slice(1) },
      mood: 'happy',
    }
  if (flag && PROBLEM.test(s))
    return {
      text: t(
        'Thanks, I’ve noted **{name}** as a problem. If it’s a real card charge you don’t recognise, contact your bank: they can block the card and dispute it.',
        {
          name: flag.tx.name,
        },
      ),
      run: () => app.setFlagVerdict?.(flag, 'problem'),
      memory: { lastFlags: memory.lastFlags.slice(1) },
    }

  if (SURE.test(s)) {
    const last = memory.lastMl
    if (last?.kind === 'forecast')
      return {
        text: t(
          'I ran {sims} simulated months, each drawing your remaining days’ spending from your own past days. 8 in 10 of them ended between {p10} and {p90}; the middle one was {p50}. On synthetic test accounts the real result landed inside a range like this about 3 times in 4, so treat it as a guide, not a promise.',
          { sims: (last.sims ?? 1000).toLocaleString(), p10: money(last.p10), p50: money(last.p50), p90: money(last.p90) },
        ),
        traces: last.trace ? [last.trace] : undefined,
      }
    if (last?.kind === 'flag')
      return {
        text: t(
          'About {pct}% sure that’s worth a look. That number is a rule of thumb from how easily it stood out and how far it is from your usual, not a measured probability. I can’t know whether it was you.',
          { pct: Math.round(last.flag.confidence * 100) },
        ),
        traces: last.flag.trace ? [last.flag.trace] : undefined,
      }
    if (last?.kind === 'category' && last.guess?.category)
      return {
        text: t('About {pct}% sure it’s {category}, from the words in the name and what you’ve picked before. Under 60% I ask instead of guessing.', {
          pct: Math.round(last.guess.confidence * 100),
          category: t(last.guess.category),
        }),
      }
    return { text: t('Ask me something first, like “will I run out of money this month?” or “anything unusual?”, and I’ll tell you how sure I am.') }
  }

  if (WRONG.test(s)) {
    const to = categoryIn(
      s,
      (app.budgets ?? []).map((b) => b.name),
    )
    const tx = lastTx(app, memory)
    if (!to) return { text: t('Which category should it be? Say something like “it’s groceries”.') }
    if (!tx) return { text: t('Which transaction? Tell me about it first, like “I spent $30 at Trader Joe’s”, then I can fix its category.') }
    if (tx.category === to) return { text: t('**{name}** is already under {category} 👍', { name: tx.name, category: t(to) }) }
    const similar = similarTo(
      (app.transactions ?? []).filter((x) => x.id !== tx.id),
      tx.name,
      to,
    )
    return {
      text: t('Change **{name}** from {from} to **{to}**? I’ll remember it for next time.', { name: tx.name, from: t(tx.category), to: t(to) }),
      confirm: {
        label: t('Change to {category}', { category: t(to) }),
        note: t('{name} · {from} → {to}', { name: tx.name, from: t(tx.category), to: t(to) }),
        effect: { balance: 0, free: 0 },
        run: () => app.correctCategory?.({ ids: [tx.id], text: tx.name, from: tx.category, to }),
        done: t('Done ✅ {name} is now under {to}. I’ll use that next time.', { name: tx.name, to: t(to) }),
      },
      links: similar.length
        ? [
            {
              label:
                similar.length === 1
                  ? t('Also change 1 similar past transaction')
                  : t('Also change {n} similar past transactions', { n: similar.length }),
              once: true,
              run: () => app.correctCategory?.({ ids: similar.map((x) => x.id), text: tx.name, from: tx.category, to, similar: true }),
            },
          ]
        : undefined,
      memory: { lastMl: { kind: 'category', guess: { category: to, confidence: 1 } } },
    }
  }
  return null
}

/** The part of "anything unusual?" that comes from the pattern check. skip: transaction ids the rules already mentioned. */
export function unusualPart(app, skip = new Set()) {
  const r = mlFlags(app)
  if (r.status === 'insufficient_data')
    return {
      line: t('My pattern check needs {n} more transactions before it can learn what’s normal for you, so for now it’s just the simple checks.', {
        n: r.needed,
      }),
      flags: [],
    }
  const flags = openFlags(app)
    .filter((f) => !skip.has(f.txId))
    .slice(0, 5)
  if (!flags.length) return { line: null, flags: [] }
  return {
    line:
      flags.length === 1
        ? t('My pattern check also found 1 thing worth a look:')
        : t('My pattern check also found {n} things worth a look:', { n: flags.length }),
    flags,
  }
}

export { flagLine }
