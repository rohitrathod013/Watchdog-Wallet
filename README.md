# Watchdog Wallet

**Live site:** https://rohitrathod013.github.io/Watchdog-Wallet/

Watchdog Wallet is a personal finance dashboard with accounts, friends you can chat with and pay back, card top-ups, five languages and **Grace**, a German Shepherd puppy assistant who can answer questions about your money and act on it.

Sign up to track your own balance, transactions, budgets, goals and bills, or click **Explore the demo** on the login screen to look around with sample data and no account.

---

## Features

### Accounts

- Sign up, log in, email confirmation and password reset, powered by [Supabase](https://supabase.com).
- Every account has its own private dashboard, saved automatically. Row level security means no one can read anyone else's data.
- A new account starts empty: $0, with no transactions, goals, bills or contacts.
- **Clear my data** in the account menu resets an account.
- **Your profile** (account menu): a profile photo (cropped square, and shown to your friends), your name, your **email** (a confirmation link goes to the new address and nothing changes until it's clicked), your **phone number** and your **address**.
- **Account settings** (account menu):
  - **Download my data**: everything in the account as a JSON file.
  - **Deactivate account**: pauses the account and logs out. The data is kept, and logging in again shows a **Reactivate** button.
  - **Delete account**: removes the login and all its data for good, after typing DELETE and the password. Grace never does this from chat; she opens Account settings instead.
- **Explore the demo** opens a full sample dashboard without an account. Nothing in the demo is saved.

### Your money

- **Add transaction**: record money in or out with a description, category and date.
- **Pay by card**: top up your balance with a card through Stripe Checkout (see [Card payments](#card-payments-stripe)).
- **Add contact**, **Add bill** and **Add Goal**.
- **Send money** and **request money** from your contacts. **Pay bills** and **top up goals** in one tap.
- All charts and totals are worked out from your own transactions: income, expenses, net profit, savings rate, earnings by month, 12-month cash flow, spending by category, budget usage and a 52-week spending heatmap.
- Currency switcher (USD, EUR, GBP, JPY) and period switcher (week, month, quarter, year).
- Export transactions and reports as CSV.

### Friends

- **Add friends** by the email they signed up with, or share your **invite link**. They accept, and you're connected.
- **Chat** with each friend, live, with a badge on the Friends tab for unread messages and requests:
  - messages from the same person are grouped with one timestamp, with **Today**, **Yesterday** or date dividers between days;
  - your latest message shows **Sent**, then **Seen** once your friend has opened the chat;
  - a **typing…** indicator while your friend writes (a live signal, nothing is stored);
  - messages appear the moment you send them, and a failed one can be retried with a tap;
  - the message box grows as you type: **Enter** sends, **Shift+Enter** adds a line;
  - an **emoji** picker and **quick replies** (👍, Thanks!, On my way, Sounds good, Paid you back 💸);
  - links are clickable, and emoji-only messages show large;
  - **photos and videos** (big photos are shrunk before upload, and open full screen with a tap), **files** like PDFs, and **voice notes** with a waveform you can scrub through. Pick them with **+**, take a photo with the camera on a phone, paste or drag a picture in, or tap the **mic**. Files can be up to 10 MB;
  - scrolled up to read? A **new messages** button takes you back down.
- Payments, requests and splits show as cards in the chat, with **Pay** and **Decline** right there. **Send**, **Request** and **Split** are also in the chat header and the **+** menu.
- The chat is a fixed-height window that fits the screen: only the messages scroll. On phones it takes the whole screen.
- **Send money** to a friend: it leaves your balance and lands in theirs, and both of you see it in your transactions.
- **Request money**: your friend gets a card in the chat and pays it in one tap, or declines.
- **Split a bill** like dinner or rent: pick friends, include your own share or not, and each friend gets a request for an equal share (leftover cents go to you). You can also add the full bill to your own spending.
- **Who owes who**: each friend shows "owes you" or "you owe" from the open requests.
- **Groups** of up to 25 people for a trip, a flat or a team:
  - start one with **New group**, give it a name and pick friends;
  - the same chat as with one friend (photos, videos, files, voice notes, typing…), with each person's name on their messages and **Seen by** on yours;
  - **Split a bill** with the group: every member gets a request for their share and pays it right in the group, even if they aren't your friend directly. The person who paid sees who has paid and who hasn't;
  - admins can rename the group and add or remove people; anyone can leave, and if the last admin leaves, the longest member takes over.
- Grace's payment guard (large-payment check, first-payment warning) works on friend payments too.

### Markets and investing

At the bottom of the Overview tab:

- **Watchlist**: Crypto and Stocks tabs with live prices and the 24-hour change. Search **any coin** CoinGecko lists or **any US stock or ETF**, and add or remove it. Coins show a 7-day trend line; stocks show where the price sits in today's range. Each account keeps its own list.
- **My Investments**: press **Buy** on anything in the watchlist to record a purchase from your unassigned money or a pot. Holdings are valued live, with profit or loss per holding and in total, and **Sell** puts the money back in your balance.
- **Exchange Rates**: European Central Bank rates against your dashboard currency, with a quick converter.

Investing here is **tracked, not traded**: Watchdog Wallet records what you bought and follows its value, but places no real orders, so buy through your broker or exchange as well. Buys and sells are saved with the status "Invested", so they never count as income or spending in the charts.

### Pages

- **Dashboard**, with four tabs:
  - **Overview**: balance, earnings, KPIs, savings goals, cash flow, spending, quick transfer, recent transactions, bills, budget health and the spending heatmap.
  - **Transactions**: search, filters, sorting and CSV export.
  - **Budgets**: monthly limits per category.
  - **Reports**: income by source and downloadable statements.
- **Analytics**: KPI sparklines, cash flow, earnings, spending and the heatmap.
- **Transfer**: quick transfer, recent transfers and transfer limits.
- **Friends**: friend requests, groups, your friends with who owes who, invite link, and a chat with each friend or group.
- **Wallet**: your card, balances by currency and bills.
- **Budget**: category budgets with a one-tap smart rebalance.

### Grace, the guard dog

Grace wears a guard cap and a gold shield badge, and she guards the account (**Grace's guard** in the account menu, or ask her for a "security check"):

- **Auto-lock**: after a set time with no activity (15 minutes by default) the app locks behind Grace, and unlocking a real account needs its password again. A reload doesn't get past the lock, and Grace's chat is shut while it's locked. **Lock now** is in the account menu, or say "lock the app".
- **Large payment guard**: payments at or above your limit ($500 by default) need an extra step, a tick box in the payment windows or a second tap on Grace's confirm button.
- **First payment warning**: before you pay someone for the first time, Grace asks you to check it's really them.
- **Privacy blur**: optional. Blurs your numbers whenever you switch to another tab or app, for screen sharing.
- **Scam warnings**: messages like "someone asked me to buy gift cards", "move my money to a safe account" or "install AnyDesk" get a clear warning and what to do.
- Settings are saved per account, and Grace can change them: "auto-lock after 5 minutes", "set my guard limit to $300", "turn on privacy blur".

### Grace, the assistant

- Flies in when the page loads, then sits in the corner, blinks, follows the pointer and waves. Press **/** anywhere to open the chat, or tap the microphone to speak.
- **Answers from your own data**: balance, income, spending, budgets, goals, bills and pots.
- **Finds transactions**: "what did I spend on food last week", "show Uber charges this month", "anything over $100". Follow-ups like "and last month?" keep the context.
- **Explains changes**: "why is my spending up?" compares with last month and names the categories and purchases behind it.
- **Warns before you ask**: bills you can't cover, budgets near the limit, duplicate charges and subscription price rises show up when the chat opens.
- **Forecasts** your end-of-month balance from bills still due and your usual daily spending, and lists your **subscriptions** with monthly and yearly totals.
- **Plans**: "can I afford a $1,200 trip in March?" answers with the trade-off; "save $5k by June" gives a weekly amount, which budget to trim, and can create the goal.
- **Takes actions with a confirm step**: record spending or income from a sentence ("I spent $300 on dinner"), send or request money, pay bills, move money between pots, top up goals and change budgets. Several in a row work too ("move $200 to savings, then pay the electric bill, then tell me what's left"), and "make it $80" changes the last amount.
- **Helps with the site** ("where do I export a CSV?") and explains terms like fees, overdrafts, APR, pending or chargebacks.
- **Stays safe**: it never asks for or keeps passwords, PINs or card numbers (they're hidden on screen), gives information rather than investment advice, and points fraud, disputes and locked accounts to the bank or password reset.
- **Keeps an audit trail**: every change Grace makes is saved in **Grace's activity** (account menu) with what you asked and why, and "why did you do that?" explains the last one.
- **Live data, no keys needed** (`src/lib/live.js`, cached so free limits are never hit):
  - **Exchange rates** from the European Central Bank via [Frankfurter](https://frankfurter.dev): "what's $100 in euros?", "50 pounds to rupees", "usd to eur". The currency switcher uses the same live rates.
  - **Crypto prices** from [CoinGecko](https://www.coingecko.com) for any listed coin: "bitcoin price", "price of chainlink", "how is pepe doing".
  - **Stock prices** for any US stock or ETF via Finnhub (needs the [one-time setup](#stock-prices)): "nvidia stock price", "$AAPL", "my stocks".
  - **Watchlist and investing**: "add chainlink to my watchlist", "buy $200 of bitcoin", "buy 2 shares of apple", "sell half my ethereum", "how are my investments". Buying and selling always ask for a confirm, and Grace still won't recommend what to buy.
  - **Public holidays** from [Nager.Date](https://date.nager.at): "any bank holidays soon?", "are banks open on Monday?", "holidays in the UK". Grace also warns when a bill falls on a bank holiday.
- **Reads receipts and bills**: tap the 🧾 button next to the message box (or paste a picture) and send Grace a photo. She reads it right in your browser with [Tesseract.js](https://tesseract.projectnaptha.com) (free, the photo isn't uploaded), finds the shop, total, date and any due date, and offers to **add it as spending** in the right category, or as a **bill** with its due date so she can remind you. Nothing is added until you confirm. Clear, straight-on photos of printed receipts work best; the reader downloads once (a few MB) the first time.
- **Talks back**: the speaker button in the chat header reads every reply aloud, and questions asked with the microphone are always answered out loud.
- **Forgives typos**: "whats my balnce", "I spnet $30 on dinnr" and "send $50 to varsah" all work. [Fuse.js](https://www.fusejs.io) matches each unknown word against Grace's vocabulary and the names on your account (`src/lib/typos.js`), with strict rules so real words like "tax" or "crash" are never changed.
- Understands some Roman Urdu, such as "balance kitna hai" and "kal 300 ka khana kharch kiya".
- **Tested**: `npm test` runs 240+ example questions with expected answers (`tests/grace.test.js`), plus checks for Grace's voice and the Friends money maths, and GitHub runs them all before every deploy.

### Languages

English, Español, Français, Deutsch and العربية. Everything is translated, including Grace's replies. Arabic switches the whole layout to right-to-left. The chosen language is remembered.

### Look and feel

- Light and dark mode with a liquid theme transition, and 5 accent colours.
- Staggered entrances, counting numbers, self-drawing charts and sections that reveal as you scroll.
- Reduce motion setting, and respect for the system reduced-motion preference.
- Works on phones (tested down to 360px wide), tablets and desktops.

## Tech stack

React 19, Vite 8, Framer Motion 12, Supabase (auth, database, storage, Realtime and Edge Functions), Stripe Checkout (card top-ups), Fuse.js (Grace's typo matching), Tesseract.js (Grace reading receipts), and plain CSS with design tokens. No UI kit and no chart library: every chart is hand-built SVG.

## Getting started

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
```

The app connects to the Supabase project set in `src/config.js`. To use your own project, see the next section.

## Setting up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It creates the `user_state` table (one private row per user), the `delete_my_account` function that **Delete account** uses, and everything **Friends** needs (see [Friends, chat and shared money](#friends-chat-and-shared-money)). It's safe to run again after updates.
3. In **Authentication > URL Configuration**:
   - set **Site URL** to where the site lives, for example `https://rohitrathod013.github.io/Watchdog-Wallet/`;
   - add `http://localhost:5173/` to **Redirect URLs** for local testing.
4. Copy the **Project URL** and the **Publishable key** (or the legacy **anon** key) from **Project Settings > API Keys**, and put them in one of these places:
   - `SUPABASE` in `src/config.js`, or
   - a `.env.local` file (copy `.env.example`) as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, or
   - GitHub repository variables with the same names (**Settings > Secrets and variables > Actions > Variables**).

The publishable/anon key is meant to be public, and row level security keeps each account private. Never put the **secret** or **service_role** key in the app.

To run without accounts, leave both values empty in `src/config.js` and don't set the variables. The site then opens straight into the demo with no login.

**Before real users sign up:** Supabase's built-in email service only sends a few emails per hour. Connect your own provider under **Authentication > Emails > SMTP Settings**.

## Stock prices

Crypto prices and exchange rates work with no setup. Stock prices need an API key, and a key in the website could be copied by anyone, so it lives in a small Supabase Edge Function ([`supabase/functions/stocks`](supabase/functions/stocks/index.ts)) instead. Until it's set up, the Stocks tab and Grace explain that stock prices aren't switched on.

1. Get a free API key at [finnhub.io/register](https://finnhub.io/register) (60 calls a minute; the function caches answers so you stay under it).
2. In the Supabase dashboard, open **Edge Functions > Secrets** and add a secret named `FINNHUB_KEY` with your key.
3. Open **Edge Functions > Deploy a new function > Via Editor**, name it `stocks`, paste the contents of `supabase/functions/stocks/index.ts` and deploy.
4. In the function's **Settings**, turn **off** "Verify JWT with legacy secret" (the site calls it with the publishable key, which isn't a JWT) and save.

With the Supabase CLI instead: `supabase secrets set FINNHUB_KEY=your-key` then `supabase functions deploy stocks` (`supabase/config.toml` already turns off JWT verification).

Finnhub's free plan covers US stocks and ETFs.

## Friends, chat and shared money

Friends work between real accounts, so they live in Supabase. If you set up Supabase before this feature, run the latest [`supabase/schema.sql`](supabase/schema.sql) again (**SQL Editor > New query > paste > Run**). It's safe to run more than once: it only adds what's missing. Until then, the Friends page shows a setup note.

- Row level security shows each person only their own friends, messages, requests and transfers. People who aren't friends can't see each other, chat or send money.
- Money only moves through SQL functions (`send_to_friend`, `request_from_friend`, `create_split`) that check both people are friends, the amount is between $0.01 and $10,000, and a request is still open, so it can't be paid twice.
- Each transfer is added to both people's balances exactly once: the transaction keeps the transfer's id.
- Live updates use Supabase Realtime; the script adds the tables to the `supabase_realtime` publication for you.
- Photos, videos, files and voice notes go in a private Storage bucket, `chat-media`, which the script creates. Files sit in a folder per pair of friends, only those two can open them, and links to them expire after an hour.
- Groups live in `groups` and `group_members`; only members can see a group, its messages and its files (`<sender>/g-<group id>/` in the bucket). The functions `create_group`, `add_group_members`, `remove_group_member`, `leave_group` and `rename_group` enforce the 25-person limit and the admin rules.
- Deleting an account removes its profile, friendships, messages, requests, transfers and uploaded files.

The demo shows a "create an account" card on the Friends page, because friends need two real accounts.

## Profile: email verification and photos

Changing the email in **Your profile** goes through Supabase Auth, so it's always verified:

- **Email**: Supabase sends a confirmation link to the new address (and to the old one too, if **Authentication > Providers > Email > Secure email change** is on). The email only changes once the link is clicked. Links come back to the **Site URL** set in [Setting up Supabase](#setting-up-supabase).
- **Photo**: stored in a public `avatars` bucket (created by `schema.sql`), one folder per user, so only you can change yours. Photos are cropped to a 320px square JPEG before upload.
- **Phone and address**: saved on your login (`user_metadata`) as you type them, visible only to you.

## Card payments (Stripe)

**Add money > Pay by card** tops up the balance with a card payment on Stripe's own Checkout page, so card numbers never touch the site. The Stripe secret key lives only in a Supabase Edge Function ([`supabase/functions/payments`](supabase/functions/payments/index.ts)). It creates the payment page and, when Stripe sends the user back, checks that the payment is paid and belongs to that account. Each payment is saved with its Stripe id, so it can't be counted twice. Card payments only show for signed-in accounts, not the demo.

1. Create a free account at [stripe.com](https://stripe.com) and stay in **Test mode**. Open **Developers > API keys** and copy the **Secret key** (`sk_test_...`).
2. In the Supabase dashboard, open **Edge Functions > Secrets** and add a secret named `STRIPE_SECRET_KEY` with that key.
3. Open **Edge Functions > Deploy a new function > Via Editor**, name it `payments`, paste the contents of `supabase/functions/payments/index.ts` and deploy.
4. In the function's **Settings**, turn **off** "Verify JWT with legacy secret" (the function checks the signed-in user itself) and save.

With the Supabase CLI instead: `supabase secrets set STRIPE_SECRET_KEY=sk_test_...` then `supabase functions deploy payments`.

In test mode, pay with card `4242 4242 4242 4242`, any future expiry date and any CVC. No real money moves. Stripe only sends people back to `https://rohitrathod013.github.io` or a local dev server; to allow another site, add a `SITE_ORIGINS` secret (comma-separated origins). Going live later means swapping in the live secret key (`sk_live_...`) after Stripe approves the account.

## Make it yours

### Brand, demo profile and assistant: `src/config.js`

```js
export const BRAND = { name: 'Watchdog Wallet', domain: 'watchdogwallet.io' }
export const USER = { first: 'Rohit', name: 'Rohit Rathod' } // the demo profile
export const SUPABASE = { url: '…', anonKey: '…' }
export const THEME = { defaultTheme: 'light', defaultAccent: 'orange' }
export const ASSISTANT = { enabled: true, name: 'Grace', intro: true }
export const FEATURES = { liveUpdates: true }
```

- `ASSISTANT.enabled: false` removes the mascot and the chat completely.
- `ASSISTANT.intro: false` keeps Grace but skips the fly-in.
- Update the page `<title>` and meta tags in `index.html` too.

### Logo and profile photo

- The logo is the `Logo` component in `src/components/Brand.jsx`. Replace its SVG path, and `public/favicon.svg` to match.
- `public/avatar.jpg` is the demo profile's photo. Signed-in users see their initials.

### Colours and fonts: `src/styles/base.css`

- All colours are CSS variables on `:root`. Dark mode overrides them in `[data-theme='dark']`, and each accent in `[data-accent='…']`.
- To add an accent, add a `[data-accent='yours']` block and add it to `ACCENTS` in `src/components/TopBar.jsx`.
- The font is Inter, loaded in `index.html`. Change `--font` to use another.

### Demo data: `src/data/seed.js`

The sample dashboard shown in the demo: transactions, budgets, goals, bills, contacts, cards, chart series and reports.

### Translations: `src/i18n/`

- One file per language (`es.js`, `fr.js`, `de.js`, `ar.js`). The English text is the key, so `t('Total Balance')` looks up `'Total Balance'`. Placeholders like `{name}` are filled in for you.
- Anything without a translation shows in English, so nothing breaks while you add text.
- To add a language, create a file, then register it in `src/lib/i18n.js` and `LANGUAGES` in `src/data/seed.js`.

### Grace's answers: `src/lib/assistant.js`

A local intent engine: no API costs, and it works offline.

- Each intent is a pattern plus a reply. A reply can include a card (bars, stats or transactions), a confirm button, quick links and follow-up chips.
- To support a new question, add a block before the fallback at the end of `respond()`.
- To use a real AI model instead, call it from `ask()` in `src/components/Assistant.jsx` with the user's message and a summary of the app state.

## Project structure

```
src/
  config.js            brand, demo profile, Supabase, theme, assistant
  App.jsx              app state, actions, accounts, routing, lazy loading
  pages/               Dashboard, Analytics, Transfer, Friends, Wallet, Budget
  views/               Dashboard tabs: Overview, Transactions, Budgets, Reports
  components/
    Auth.jsx           log in, sign up, password reset, demo entry
    Cards.jsx          every dashboard card, with empty states
    Charts.jsx         earning bars, line chart, donut, heatmap, sparkline
    Modals.jsx         send, receive, request, add money (and pay by card), goal, transaction, contact, bill, invest
    FriendModals.jsx   pay a friend, request from a friend, split a bill
    ChatMedia.jsx      photos, videos, files and voice notes in the chat, and the photo viewer
    Account.jsx        account settings: download, deactivate, delete
    Profile.jsx        your profile: photo, name, email, phone, address
    TopBar.jsx         navigation, notifications, settings, language, account
    Assistant.jsx      Grace's chat panel
    Guard.jsx          lock screen and guard settings
    Buddy.jsx          Grace's on-page movement (Framer Motion)
    BuddyArt.jsx       Grace: a German Shepherd puppy in layered SVG
    ui.jsx             CountUp, Stage, Reveal, Modal, Popover, Segmented, Ring…
  lib/
    supabase.js        Supabase client, loading and saving each user's data
    social.js          friends, chat, requests and splits in Supabase, plus the chat layout helpers
    media.js           photo, video, file and voice note uploads, signed links, voice recording
    profile.js         profile photo, name, email change (verified), phone and address
    receipt.js         Grace reading receipts and bills from a photo (Tesseract.js) and offering to add them
    useSocial.js       the Friends state: live updates, and each transfer counted once
    payments.js        card top-ups through the payments Edge Function
    voice.js           Grace's voice
    stats.js           charts and totals worked out from transactions
    insights.js        search, forecasts, unusual charges, subscriptions, afford and goal plans
    assistant.js       Grace's intent engine
    typos.js           typo correction with Fuse.js
    guard.js           guard defaults shared by the app and Grace
    live.js            exchange rates, crypto and stock prices, search and holidays, with caching
    i18n.js            translation helper
    format.js          money and date helpers
    themeTransition.js liquid theme switch
  i18n/                es, fr, de, ar translations
  data/seed.js         demo data
  styles/              base (tokens), shell, dashboard, pages, assistant, auth, friends, mobile
supabase/schema.sql    tables, security rules and functions (accounts, deletion, friends)
supabase/functions/stocks/    Edge Function that fetches stock prices with a hidden Finnhub key
supabase/functions/payments/  Edge Function for Stripe card top-ups, with a hidden Stripe key
tests/                 Grace's questions, her voice, receipts, and the Friends and groups maths
```

## Scripts

| Command           | What it does                                                          |
| ----------------- | --------------------------------------------------------------------- |
| `npm run dev`     | Start the dev server with hot reload                                  |
| `npm run build`   | Production build into `dist/`                                         |
| `npm run preview` | Serve the production build at `/Watchdog-Wallet/`, like the live site |
| `npm test`        | Grace's test set (240+ questions)                                     |
| `npm run lint`    | ESLint                                                                |
| `npm run format`  | Prettier                                                              |

## Deploying

Every push to `main` deploys automatically. The GitHub Actions workflow in `.github/workflows/deploy.yml` builds the site and publishes it to the `gh-pages` branch, which GitHub Pages serves.

For your own fork:

1. In **Settings > Pages**, set **Source** to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.
2. If your repository isn't called `Watchdog-Wallet`, change `base` in `vite.config.js` to `/your-repo-name/`.

`dist/` also works on any other static host, such as Vercel, Netlify or Cloudflare Pages. Pages use URL hashes (`#/wallet`), so no server rewrites are needed.

## Browser support

The latest Chrome, Edge, Safari and Firefox, on desktop and mobile. The liquid theme switch uses the View Transitions API; other browsers get a smooth colour fade instead.

## Credits

- Icons: custom SVG paths in `src/components/Icon.jsx`
- Font: [Inter](https://rsms.me/inter/) (SIL Open Font License)
- Animation: [Framer Motion](https://motion.dev) (MIT)
- Accounts and database: [Supabase](https://supabase.com)
- Typo matching: [Fuse.js](https://www.fusejs.io) (Apache 2.0)
- Exchange rates: [Frankfurter](https://frankfurter.dev) (European Central Bank data)
- Crypto prices: [CoinGecko](https://www.coingecko.com)
- Stock prices: [Finnhub](https://finnhub.io)
- Public holidays: [Nager.Date](https://date.nager.at)

## Copyright

© 2026 Rohit Rathod · Watchdog Wallet. All rights reserved.

