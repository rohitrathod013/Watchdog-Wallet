# Watchdog Wallet

**Live site:** https://rohitrathod013.github.io/Watchdog-Wallet/

Watchdog Wallet is a personal finance dashboard with accounts, five languages and **Grace**, a German Shepherd puppy assistant who can answer questions about your money and act on it.

Sign up to track your own balance, transactions, budgets, goals and bills, or click **Explore the demo** on the login screen to look around with sample data and no account.

---

## Features

### Accounts

- Sign up, log in, email confirmation and password reset, powered by [Supabase](https://supabase.com).
- Every account has its own private dashboard, saved automatically. Row level security means no one can read anyone else's data.
- A new account starts empty: $0, with no transactions, goals, bills or contacts.
- **Clear my data** in the account menu resets an account.
- **Explore the demo** opens a full sample dashboard without an account. Nothing in the demo is saved.

### Your money

- **Add transaction**: record money in or out with a description, category and date.
- **Add contact**, **Add bill** and **Add Goal**.
- **Send money** and **request money** from your contacts. **Pay bills** and **top up goals** in one tap.
- All charts and totals are worked out from your own transactions: income, expenses, net profit, savings rate, earnings by month, 12-month cash flow, spending by category, budget usage and a 52-week spending heatmap.
- Currency switcher (USD, EUR, GBP, JPY) and period switcher (week, month, quarter, year).
- Export transactions and reports as CSV.

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
- **Wallet**: your card, balances by currency and bills.
- **Budget**: category budgets with a one-tap smart rebalance.

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
- **Talks back**: the speaker button in the chat header reads every reply aloud, and questions asked with the microphone are always answered out loud.
- **Forgives typos**: "whats my balnce", "I spnet $30 on dinnr" and "send $50 to varsah" all work. [Fuse.js](https://www.fusejs.io) matches each unknown word against Grace's vocabulary and the names on your account (`src/lib/typos.js`), with strict rules so real words like "tax" or "crash" are never changed.
- Understands some Roman Urdu, such as "balance kitna hai" and "kal 300 ka khana kharch kiya".
- **Tested**: `npm test` runs 220+ example questions with expected answers (`tests/grace.test.js`), and GitHub runs them before every deploy.

### Languages

English, Español, Français, Deutsch and العربية. Everything is translated, including Grace's replies. Arabic switches the whole layout to right-to-left. The chosen language is remembered.

### Look and feel

- Light and dark mode with a liquid theme transition, and 5 accent colours.
- Staggered entrances, counting numbers, self-drawing charts and sections that reveal as you scroll.
- Reduce motion setting, and respect for the system reduced-motion preference.
- Works on phones (tested down to 360px wide), tablets and desktops.

## Tech stack

React 19, Vite 8, Framer Motion 12, Supabase (auth and database), Fuse.js (Grace's typo matching), and plain CSS with design tokens. No UI kit and no chart library: every chart is hand-built SVG.

## Getting started

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
```

The app connects to the Supabase project set in `src/config.js`. To use your own project, see the next section.

## Setting up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It creates the `user_state` table, one private row per user.
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
  pages/               Dashboard, Analytics, Transfer, Wallet, Budget
  views/               Dashboard tabs: Overview, Transactions, Budgets, Reports
  components/
    Auth.jsx           log in, sign up, password reset, demo entry
    Cards.jsx          every dashboard card, with empty states
    Charts.jsx         earning bars, line chart, donut, heatmap, sparkline
    Modals.jsx         send, receive, request, goal, transaction, contact, bill
    TopBar.jsx         navigation, notifications, settings, language, account
    Assistant.jsx      Grace's chat panel
    Buddy.jsx          Grace's on-page movement (Framer Motion)
    BuddyArt.jsx       Grace: a German Shepherd puppy in layered SVG
    ui.jsx             CountUp, Stage, Reveal, Modal, Popover, Segmented, Ring…
  lib/
    supabase.js        Supabase client, loading and saving each user's data
    stats.js           charts and totals worked out from transactions
    insights.js        search, forecasts, unusual charges, subscriptions, afford and goal plans
    assistant.js       Grace's intent engine
    typos.js           typo correction with Fuse.js
    live.js            exchange rates, crypto and stock prices, search and holidays, with caching
    i18n.js            translation helper
    format.js          money and date helpers
    themeTransition.js liquid theme switch
  i18n/                es, fr, de, ar translations
  data/seed.js         demo data
  styles/              base (tokens), shell, dashboard, pages, assistant, auth, mobile
supabase/schema.sql    database table and security rules
supabase/functions/stocks/  Edge Function that fetches stock prices with a hidden Finnhub key
tests/grace.test.js    Grace's test set
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build at `/Watchdog-Wallet/`, like the live site |
| `npm test` | Grace's test set (220+ questions) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

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
