/* ------------------------------------------------------------------
   Watchdog scam shield: a small hand-written set of 20 scams and 20
   normal messages. The precision and recall printed here are on this
   set only, not on real traffic.
   ------------------------------------------------------------------ */
import { describe, expect, it } from 'vitest'
import { billJump, combine, distance, findLinks, lookalike, payeeChecks, registrable, scan } from '../src/lib/shield'

const SCAMS = [
  [
    'gift card boss',
    'Hi, it’s your manager. I need you to buy 5 Google Play gift cards for a client today and send me the codes on the back. Keep this between us for now.',
  ],
  ['gift card IRS', 'This is the IRS. You owe back taxes and will be arrested within 24 hours unless you pay with iTunes gift cards.'],
  [
    'safe account',
    'This is your bank’s fraud department. Your account has been compromised. Move your money to a safe account immediately: sort code 20-11-45, account 4432 1190. Do not tell anyone at the branch.',
  ],
  [
    'fake invoice',
    'Dear customer, please note our bank details have changed. Kindly pay invoice #4471 ($8,450.00) into the new account below. Do not use the old account.',
  ],
  ['invoice urgency', 'FINAL NOTICE: your invoice is overdue. Pay to our new account today or your service will be suspended.'],
  ['delivery fee', 'USPS: Your package could not be delivered. Pay the $1.99 redelivery fee at https://usps-redelivery.top/track to reschedule.'],
  ['dhl customs', 'DHL: your parcel is held at customs. A customs fee of $3.50 is required within 12 hours: bit.ly/3xYz9q'],
  ['royal mail', 'Royal Mail: we missed you. Pay a small fee to release your parcel: http://185.22.41.9/royalmail'],
  [
    'relative trouble',
    'Hi mum it’s me, I lost my phone so this is my new number. I need money urgently for rent, can you send £400 now? Don’t tell dad.',
  ],
  ['grandparent jail', 'Grandma, I’m in trouble, I’m in jail and need bail money. Please don’t tell anyone, just send it by Western Union.'],
  ['paypal lookalike', 'Your PayPal account is locked. Verify now at http://paypa1.com/login to restore access.'],
  [
    'amazon lookalike',
    'Amazon: unusual sign-in detected. Confirm your details at amazon-billing-support.net within 24 hours or your account will be closed.',
  ],
  ['subdomain trick', 'Netflix: your payment failed. Update your card at https://netflix.com.account-update.xyz/billing'],
  ['link mismatch', 'Please review your statement: [https://www.chase.com/statements](http://chase-secure-docs.click/login)'],
  ['crypto giveaway', 'Elon’s official giveaway! Send 0.1 BTC to this wallet and get 0.2 BTC back. Guaranteed returns, limited time!!!'],
  ['crypto investment', 'Join our trading group and double your money in a week. Deposit USDT to the wallet address below.'],
  ['tech support', 'Microsoft Support: your computer is infected. Call now and install AnyDesk so our technician can fix it.'],
  ['otp request', 'Hi, I accidentally sent my verification code to your number. Can you send me the code you just received?'],
  ['lottery', 'Congratulations! You have won the National Lottery prize of $1,000,000. Pay the processing fee to claim your prize.'],
  ['punycode', 'Your Apple ID will be disabled today. Sign in at https://xn--pple-43d.com to keep it.'],
]

const NORMAL = [
  ['bill reminder', 'Your Con Edison bill of $96.40 is due on Nov 20. You can pay in the app or on our website.'],
  ['split dinner', 'Hey! Can you send me $32 for dinner last night? No rush.'],
  [
    'bank alert no link',
    'Chase: A $45.00 purchase at Target was made on your card ending 1234. If this wasn’t you, call the number on the back of your card.',
  ],
  ['real otp', 'Your Watchdog Wallet verification code is 482910. Don’t share this code with anyone. We will never call you to ask for it.'],
  ['receipt', 'Thanks for shopping with us! Please keep this receipt for your records. Total: $23.18'],
  ['rent reminder', 'Reminder: rent of $1,850 is due on the 1st. Pay the usual way, thanks!'],
  ['amazon shipped', 'Your Amazon order #112-883 has shipped and will arrive Thursday. Track it at amazon.com/orders'],
  ['friend link', 'Look at this article, it’s great: https://www.nytimes.com/2026/11/01/business/saving.html'],
  ['gym', 'Your gym membership renews on Dec 1 for $29.99. Reply STOP to cancel reminders.'],
  ['payday', 'Payday! Your salary of $4,500 has been deposited.'],
  ['group trip', 'Goa trip: villa is $300 each. I’ll split it in the app so we can settle later.'],
  ['doctor', 'Reminder: your appointment with Dr. Lee is tomorrow at 10:30 am. Call us if you need to reschedule.'],
  ['netflix price', 'Netflix: your plan price changes to $17.99 from your next billing date. No action is needed.'],
  ['mum normal', 'Hi mum, landed safely! Will call you tonight.'],
  ['zelle friend', 'Sent you $20 on Zelle for the movie tickets.'],
  [
    'fraud alert real',
    'Bank of America: we declined a suspicious charge. If you recognise it, reply YES. We will never ask for your PIN or password.',
  ],
  ['newsletter', 'Our weekly newsletter: 5 ways to cut your grocery bill. Read more at https://www.bbc.co.uk/food'],
  ['utility estimate', 'Your electricity usage this month is estimated at 320 kWh. View details in your account.'],
  ['coworker', 'Can you keep this receipt for the team lunch and submit it with your expenses?'],
  ['secret party', 'Shh, we’re planning a surprise party for Sam on Saturday, keep it a secret!'],
]

describe('the labelled set', () => {
  const scams = SCAMS.map(([name, text]) => ({ name, ...scan(text) }))
  const normals = NORMAL.map(([name, text]) => ({ name, ...scan(text) }))
  const flagged = (r) => r.level !== 'low'
  const tp = scams.filter(flagged).length
  const fp = normals.filter(flagged).length
  const precision = tp / (tp + fp)
  const recall = tp / scams.length
  console.log(
    `Scam shield on the hand-written set (${SCAMS.length} scams, ${NORMAL.length} normal, not real traffic): precision ${(precision * 100).toFixed(1)}%, recall ${(recall * 100).toFixed(1)}%`,
  )

  for (const r of scams)
    it(`flags the scam “${r.name}” (${r.score}, ${r.level})`, () => {
      expect(['medium', 'high'], r.reasons.map((x) => x.code).join(',')).toContain(r.level)
      expect(r.reasons.length).toBeGreaterThan(0)
      for (const reason of r.reasons) {
        expect(reason.evidence.length).toBeGreaterThan(0)
        expect(reason.weight).toBeGreaterThan(0)
      }
    })
  it('lets at most 2 normal messages reach medium, and none reach high', () => {
    const raised = normals.filter(flagged)
    expect(raised.length, raised.map((r) => `${r.name} ${r.score} ${r.reasons.map((x) => x.code)}`).join(' | ')).toBeLessThanOrEqual(2)
    expect(normals.filter((r) => r.level === 'high')).toEqual([])
  })
})

describe('combining', () => {
  it('“keep this secret” plus gift cards is high; “please keep this receipt” is low', () => {
    expect(scan('Buy some gift cards for me and keep this secret.').level).toBe('high')
    const r = scan('Please keep this receipt.')
    expect(r.level).toBe('low')
    expect(r.score).toBe(0)
  })
  it('one signal is never high, and diminishing returns apply', () => {
    for (const w of [5, 15, 25, 35, 45]) expect(combine([{ code: 'x', weight: w }]).level).not.toBe('high')
    expect(combine([{ code: 'a', weight: 45 }]).score).toBe(45)
    expect(
      combine([
        { code: 'a', weight: 45 },
        { code: 'b', weight: 35 },
      ]).score,
    ).toBe(64)
    // the same signal twice counts once
    expect(
      combine([
        { code: 'a', weight: 45 },
        { code: 'a', weight: 45 },
      ]).score,
    ).toBe(45)
  })
  it('writing tells never count alone, and an impersonation alone is minor', () => {
    expect(scan('Dear customer, kindly note our office hours!!!').score).toBe(0)
    expect(scan('This is your bank. Our branch hours are changing.').level).toBe('low')
  })
  it('says “looks risky”, never that it is certainly a scam', () => {
    const r = scan('Send me 3 gift cards now and don’t tell anyone.')
    const words = [...r.reasons.map((x) => x.label), ...r.advice].join(' ')
    expect(words).not.toMatch(/\bis a scam\b|\bdefinitely\b|\bcertainly\b/i)
  })
})

describe('each signal on its own', () => {
  const codes = (text) => scan(text).reasons.map((r) => r.code)
  it.each([
    ['urgency', 'Act now: your account will be suspended within 24 hours.'],
    ['payment', 'Pay with gift cards only.'],
    ['payment', 'Send the bitcoin to my wallet address.'],
    ['payment', 'Please send it by wire transfer today.'],
    ['secrecy', 'Don’t tell anyone about this.'],
    ['impersonation', 'This is Amazon customer support.'],
    ['credentials', 'Please confirm your PIN to verify your account.'],
    ['remote', 'Install TeamViewer so we can help.'],
    ['prize', 'You have won a giveaway!'],
    ['fee', 'A customs fee is needed to release your parcel.'],
    ['bankChange', 'Our bank details have changed, please pay to the new account.'],
    ['shortLink', 'Track it here: bit.ly/abc123'],
    ['ipLink', 'Log in at http://192.168.10.4/login'],
    ['punycode', 'Visit https://xn--80ak6aa92e.com'],
    ['lookalike', 'Sign in at paypa1.com'],
    ['mismatch', '<a href="http://evil.example.xyz">www.wellsfargo.com</a>'],
    ['writing', 'Dear customer, KINDLY VERIFY YOUR ACCOUNT NOW or it will be suspended.'],
  ])('%s: %s', (code, text) => expect(codes(text)).toContain(code))
  it('shows the exact matched words as evidence', () => {
    const r = scan('Hello. Please buy 3 Steam cards and text me the codes.')
    expect(r.reasons.find((x) => x.code === 'payment').evidence).toMatch(/buy 3 Steam cards/)
  })
})

describe('links, read as text only', () => {
  it('finds full, www and bare links, and shown-vs-real pairs', () => {
    const hosts = findLinks('a https://x.com/a, www.y.org and z.net/p plus [chase.com](http://bad.click)').map((l) => l.host)
    expect(hosts).toEqual(expect.arrayContaining(['bad.click', 'x.com', 'y.org', 'z.net']))
  })
  it('knows the registered part of a host', () => {
    expect(registrable('login.paypal.co.uk')).toBe('paypal.co.uk')
    expect(registrable('a.b.example.com')).toBe('example.com')
  })
  it('spots lookalikes but leaves the real sites alone', () => {
    expect(lookalike('paypa1.com')?.brand).toBe('paypal')
    expect(lookalike('arnazon.com')?.brand).toBe('amazon')
    expect(lookalike('micros0ft-support.com')?.brand).toBe('microsoft')
    expect(lookalike('paypal.com.verify-id.top')?.how).toBe('subdomain')
    expect(lookalike('paypal.com')).toBeNull()
    expect(lookalike('www.amazon.co.uk'.replace('www.', ''))).toBeNull()
    expect(lookalike('nytimes.com')).toBeNull()
    expect(lookalike('groups.com')).toBeNull()
  })
  it('edit distance', () => {
    expect(distance('paypal', 'paypa1')).toBe(1)
    expect(distance('varsha', 'varsah')).toBe(2)
    expect(distance('abc', 'abcdefgh', 2)).toBe(3)
  })
})

describe('account-aware checks', () => {
  const ctx = {
    contacts: [{ name: 'Varsha Hunjan' }, { name: 'Sam Lee' }],
    bills: [{ name: 'Electricity', amount: 90 }],
    guard: { limit: 500 },
    transactions: [
      { name: 'Transfer to Sam Lee', amount: -40, date: '2026-10-01', status: 'Completed' },
      { name: 'Transfer to Sam Lee', amount: -60, date: '2026-10-15', status: 'Completed' },
      { name: 'Electricity', amount: -88, date: '2026-10-04', status: 'Completed' },
      { name: 'Coffee', amount: -5, date: '2026-10-05', status: 'Completed' },
    ],
  }
  const codes = (pay) => payeeChecks(ctx, pay).map((r) => r.code)
  it('a payee never paid before', () => {
    expect(codes({ payee: 'Varsha Hunjan', amount: 20 })).toContain('newPayee')
    expect(codes({ payee: 'Sam Lee', amount: 50 })).not.toContain('newPayee')
  })
  it('more than 3× the usual, and over the guard limit', () => {
    expect(codes({ payee: 'Sam Lee', amount: 151 })).toContain('bigAmount')
    expect(codes({ payee: 'Sam Lee', amount: 149 })).not.toContain('bigAmount')
    expect(codes({ payee: 'Sam Lee', amount: 600 })).toContain('overLimit')
  })
  it('a name a letter or two off a contact', () => {
    expect(codes({ payee: 'Varsah Hunjan', amount: 10 })).toContain('nearContact')
    expect(codes({ payee: 'Varsha Hunjan', amount: 10 })).not.toContain('nearContact')
    expect(codes({ payee: 'Tom Ford', amount: 10 })).not.toContain('nearContact')
  })
  it('a bill more than 20% above the last one', () => {
    expect(billJump(ctx, { name: 'Electricity', amount: 110 })?.code).toBe('billJump')
    expect(billJump(ctx, { name: 'Electricity', amount: 100 })).toBeNull()
  })
  it('feeds into scan() when a payee is given', () => {
    const r = scan('', { ...ctx, payee: 'Varsah Hunjan', amount: 900 })
    expect(r.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(['nearContact', 'newPayee', 'bigAmount', 'overLimit']))
    expect(r.level).toBe('high')
  })
})

describe('edge cases', () => {
  it('empty and junk input', () => {
    for (const x of ['', '   ', null, undefined, 42]) {
      const r = scan(x)
      expect(r.score).toBe(0)
      expect(r.level).toBe('low')
      expect(r.advice.length).toBeGreaterThan(0)
    }
  })
  it('very long text stays quick and bounded', () => {
    const long = 'Normal words about the weekend. '.repeat(5000) + ' buy gift cards and don’t tell anyone'
    const start = Date.now()
    const r = scan(long)
    expect(Date.now() - start).toBeLessThan(1000)
    expect(r.score).toBeGreaterThanOrEqual(0)
  })
  it('Spanish, Arabic and Roman Urdu', () => {
    expect(scan('Urgente: su cuenta suspendida. Compre tarjetas de regalo y no se lo digas a nadie.').level).toBe('high')
    expect(scan('عاجل: اشترِ بطاقات هدايا ولا تخبر أحدا').level).toBe('high')
    expect(scan('Jaldi bhejo, gift card bhejo aur kisi ko mat batana').level).toBe('high')
    expect(scan('Hola, ¿cenamos el viernes?').level).toBe('low')
  })
  it('emoji don’t break anything', () => {
    expect(scan('🎉🎉 You have won a prize!! 🎁 claim your reward 👉 bit.ly/x').level).not.toBe('low')
    expect(scan('😂👍').score).toBe(0)
  })
})
