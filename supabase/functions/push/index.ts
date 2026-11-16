// Watchdog Wallet: push notifications, even when the app is closed.
//
// Called two ways, both with the header  x-push-secret: <PUSH_WEBHOOK_SECRET>
//   1. Database Webhooks (Supabase > Database > Webhooks), on INSERT into
//      messages, connections, money_requests and transfers. The body is
//      { type: 'INSERT', table, record }; the right people get a notification.
//   2. Once a day for bills: POST /functions/v1/push?task=bills (from pg_cron or
//      any scheduler). Everyone with an unpaid bill due tomorrow gets a reminder.
//
// Secrets (Edge Functions > Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto: or https: URL of whoever runs the site), PUSH_WEBHOOK_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Turn OFF "Verify JWT" for this function: it checks PUSH_WEBHOOK_SECRET instead.
import webpush from 'npm:web-push@3.6.7'

const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const SITE = Deno.env.get('SITE_URL') ?? 'https://rohitrathod013.github.io/Watchdog-Wallet/'
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? SITE, Deno.env.get('VAPID_PUBLIC_KEY') ?? '', Deno.env.get('VAPID_PRIVATE_KEY') ?? '')

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`

/** A REST call with the service key (it bypasses row level security, so this only runs here, on the server). */
async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const nameOf = async (id: string) => {
  const rows = await rest(`profiles?id=eq.${id}&select=name,email`)
  return rows?.[0]?.name || rows?.[0]?.email?.split('@')[0] || 'Someone'
}

/** Send one notification to every device of these people; forget devices the browser says are gone. */
async function notify(userIds: string[], note: { title: string; body: string; tag?: string; url?: string }) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return 0
  const all = await rest(`push_subscriptions?user_id=in.(${ids.join(',')})&select=endpoint,p256dh,auth,user_id,seen_at`)
  // someone with the app open and on screen (on any device) in the last minute already sees it in the app
  const recent = Date.now() - 60 * 1000
  const busy = new Set((all ?? []).filter((s: any) => s.seen_at && Date.parse(s.seen_at) > recent).map((s: any) => s.user_id))
  const subs = (all ?? []).filter((s: any) => !busy.has(s.user_id))
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...note, url: note.url ?? SITE }), { TTL: 60 * 60 * 12 })
      sent++
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }).catch(() => null)
      else console.error(`push: ${err?.statusCode ?? ''} ${err?.body ?? err?.message ?? err}`)
    }
  }
  return sent
}

const preview = (r: any) =>
  r.kind === 'media' ? (r.body || '📎 Sent a file') : r.kind === 'payment' ? 'Sent a payment' : r.kind === 'request' ? 'Asked for money' : r.kind === 'split' ? `Split “${r.body}”` : String(r.body ?? '').slice(0, 120)

async function fromWebhook(table: string, r: any) {
  if (table === 'messages') {
    // "I paid my share": the person owed is asked to confirm it
    if (r.kind === 'system' && String(r.body ?? '').startsWith('claimed:')) {
      const [amount, owed, method] = String(r.body).slice(8).split('|')
      return notify([owed], {
        title: 'Confirm a payment',
        body: `${await nameOf(r.sender)} says they paid you ${money(amount)}${method === 'other' ? ' another way' : ''}. Confirm it in Watchdog Wallet.`,
        tag: `claim-${r.sender}`,
        url: `${SITE}#/friends`,
      })
    }
    // a child asks to spend: the parent is asked to approve; the answer goes back to the child
    const sys = String(r.body ?? '')
    if (r.kind === 'system' && r.recipient && /^(spendask|spendok|spendno|familyinvite):/.test(sys)) {
      const [what, rest = ''] = [sys.slice(0, sys.indexOf(':')), sys.slice(sys.indexOf(':') + 1)]
      const cut = rest.indexOf('|')
      const amount = money(rest.slice(0, cut))
      const title = rest.slice(cut + 1)
      const who = await nameOf(r.sender)
      const msg =
        what === 'spendask'
          ? { title: 'Approve spending?', body: `${who} asks to spend ${amount} on ${title}.` }
          : what === 'spendok'
            ? { title: 'Approved', body: `${who} approved ${amount} for ${title}.` }
            : what === 'spendno'
              ? { title: 'Declined', body: `${who} declined ${amount} for ${title}.` }
              : { title: 'Family invite', body: `${who} asked to link your account as their child's.` }
      return notify([r.recipient], { ...msg, tag: `family-${r.sender}`, url: `${SITE}#/friends` })
    }
    if (r.kind === 'system') return 0
    const who = await nameOf(r.sender)
    if (r.group_id) {
      const members = await rest(`group_members?group_id=eq.${r.group_id}&select=user_id`)
      const group = (await rest(`groups?id=eq.${r.group_id}&select=name`))?.[0]?.name ?? 'Group'
      return notify(
        members.map((m: any) => m.user_id).filter((id: string) => id !== r.sender),
        { title: group, body: `${who}: ${preview(r)}`, tag: `g-${r.group_id}`, url: `${SITE}#/friends` },
      )
    }
    return notify([r.recipient], { title: who, body: preview(r), tag: `c-${r.sender}`, url: `${SITE}#/friends` })
  }
  if (table === 'connections' && r.status === 'pending')
    return notify([r.addressee], { title: 'Friend request', body: `${await nameOf(r.requester)} wants to be friends on Watchdog Wallet`, tag: 'friends', url: `${SITE}#/friends` })
  if (table === 'money_requests' && !r.split_id)
    return notify([r.payer], { title: 'Money request', body: `${await nameOf(r.requester)} asked you for ${money(r.amount)}${r.note ? `: ${r.note}` : ''}`, url: `${SITE}#/friends` })
  if (table === 'transfers')
    return notify([r.recipient], { title: 'Money received', body: `${await nameOf(r.sender)} sent you ${money(r.amount)}${r.note ? `: ${r.note}` : ''}`, url: `${SITE}#/friends` })
  return 0
}

/** Bills due tomorrow, for everyone who has push on. */
async function billReminders() {
  const subs = await rest('push_subscriptions?select=user_id')
  const users = [...new Set((subs ?? []).map((s: any) => s.user_id))]
  if (!users.length) return 0
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const rows = await rest(`user_state?user_id=in.(${users.join(',')})&select=user_id,data->bills`)
  let sent = 0
  for (const row of rows ?? []) {
    const due = (row.bills ?? []).filter((b: any) => !b.paid && String(b.dueDate ?? '').slice(0, 10) === tomorrow)
    if (!due.length) continue
    const total = due.reduce((s: number, b: any) => s + Number(b.amount ?? 0), 0)
    sent += await notify([row.user_id], {
      title: due.length === 1 ? `${due[0].name} is due tomorrow` : `${due.length} bills are due tomorrow`,
      body: due.length === 1 ? `${money(due[0].amount)}. Open Watchdog Wallet to pay it.` : `${money(total)} in total: ${due.map((b: any) => b.name).join(', ')}`,
      tag: `bills-${tomorrow}`,
    })
  }
  return sent
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  if (!SECRET || req.headers.get('x-push-secret') !== SECRET) return json({ error: 'Not allowed' }, 401)
  try {
    if (new URL(req.url).searchParams.get('task') === 'bills') return json({ sent: await billReminders() })
    const body = await req.json().catch(() => ({}))
    if (body?.type !== 'INSERT' || !body?.record) return json({ sent: 0 })
    return json({ sent: await fromWebhook(String(body.table), body.record) })
  } catch (err: any) {
    console.error(`push: ${err?.message ?? err}`)
    return json({ error: String(err?.message ?? err) }, 500)
  }
})
