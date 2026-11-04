# Watchdog Wallet — Animated Finance Dashboard

A polished React fintech dashboard with fluid, choreographed animations and **Grace**, a German Shepherd puppy assistant mascot. Grace flies in when the page loads, lives in the corner, and opens a chat that can answer questions about the dashboard data and act on it.

No backend and no API keys. It runs on demo data and is ready to connect to your own.

---

## Features

**Pages and views**

- **Dashboard** with four folder-style tabs:
  - Overview: balance, earnings chart, KPIs, profit split, financial report card, savings goals, cash-flow line chart, spending donut, quick transfer, transactions, bills, budget health and a 52-week spending heatmap
  - Transactions: search, filters, sorting, CSV export
  - Budgets: limit sliders
  - Reports: downloadable reports
- **Analytics**: KPI sparklines, cash flow, earnings, spending, heatmap
- **Transfer**: quick transfer, recent transfers, limits
- **Wallet**: flippable 3D cards, multi-currency balances, bills
- **Budget**: category budgets with smart rebalance

**Interactions**

- Working modals: Send Money, Receive Money (QR code), Payment Request, New Goal
- Every action updates the shared state: balance, transactions, notifications and toasts
- Live mode: the balance drifts in real time
- Currency switcher: USD, EUR, GBP, JPY
- Period switcher: week, month, quarter, year

**Motion**

- Staggered entrances
- Numbers that count up
- Bars, lines and donuts that draw themselves
- Sections that reveal as you scroll
- A sliding navigation indicator
- Spring physics on modals and toasts

**Theming**

- Light and dark mode with a liquid "blob" theme transition
- 5 accent colours
- Reduced-motion support

**Grace, the AI assistant mascot**

- Built with Framer Motion. On load he flies in, does a happy hop, then docks bottom-right. He blinks, follows the cursor and waves.
- The chat panel answers questions about balance, income, spending, budgets, goals and bills.
- It can also take actions: send or request money, pay bills, top up goals, change budgets, switch theme, accent, currency or period, and open pages.
- Money actions always ask for confirmation first.
- Understands some Roman Urdu ("balance kitna hai", "dark karo").
- Press **/** anywhere to open the chat.

**Responsive**: desktop down to 375px phones.

**Fast**: about 86 KB gzipped initial JS. The secondary pages and the assistant load on demand.

## Tech stack

React 19 · Vite 8 · Framer Motion 12 · plain CSS with design tokens · no UI kit and no chart library (all charts are hand-built SVG).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in /dist
npm run preview    # serve the production build locally
```

Requires Node 20.19+ or 22.12+.

## Make it yours

### 1. Brand, user and assistant: `src/config.js`

```js
export const BRAND = { name: 'Watchdog Wallet', domain: 'watchdogwallet.io' }
export const USER = { first: 'Rohit', name: 'Rohit Rathod' }
export const THEME = { defaultTheme: 'light', defaultAccent: 'orange' }
export const ASSISTANT = { enabled: true, name: 'Grace', intro: true }
export const FEATURES = { liveUpdates: true }
```

- `ASSISTANT.enabled: false` removes the mascot and the chat completely.
- `ASSISTANT.intro: false` keeps Grace but skips the fly-in, so it starts in the corner.

Also update the page `<title>` and meta tags in `index.html`.

### 2. Logo

- The logo mark is the `Logo` component in `src/components/Brand.jsx`, an SVG with a single path. Replace that path with your own.
- Replace `public/favicon.svg` to match.

### 3. Colours and fonts: `src/styles/base.css`

- All colours are CSS variables on `:root`. Dark mode overrides them in `[data-theme='dark']`, and each accent in `[data-accent='…']`.
- To add an accent, add a `[data-accent='yours']` block, then add it to the `ACCENTS` list in `src/components/TopBar.jsx`.
- The font is Inter, loaded in `index.html`. Change `--font` to use another one.

### 4. Data: `src/data/seed.js`

All demo data lives in this one file: transactions, budgets, goals, bills, contacts, cards, chart series and reports. Swap the arrays for your API responses; the shapes are plain objects.

The app state and every action live in `src/App.jsx` (`sendMoney`, `payBill`, `fundGoal` and so on). Point those at your backend when you connect real data.

### 5. Grace's answers: `src/lib/assistant.js`

The assistant is a local intent engine, so there are no API costs and it works offline.

- Each intent is a regex plus a reply.
- A reply can include a card (bars, stats or transactions), a confirm button, quick links and follow-up chips.
- To support a new question, add a block before the fallback at the bottom of `respond()`.
- To use a real LLM instead, send the user's message and a summary of the app state to your model inside the `ask()` function in `src/components/Assistant.jsx`.

## Project structure

```
src/
  config.js            ← rebrand here
  App.jsx              app state, actions, routing, lazy loading
  pages/               Dashboard, Analytics, Transfer, Wallet, Budget
  views/               Dashboard tabs: Overview, Transactions, Budgets, Reports
  components/
    Cards.jsx          every dashboard card
    Charts.jsx         earning bars, line chart, donut, heatmap, sparkline
    TopBar.jsx         navigation, notifications, settings, language, account
    Modals.jsx         send / receive / request / new goal
    Buddy.jsx          Grace's on-page choreography (Framer Motion)
    BuddyArt.jsx       Grace herself: a German Shepherd puppy in layered SVG with fur filters
    Assistant.jsx      chat panel
    ui.jsx             CountUp, Stage, Reveal, Modal, Popover, Segmented, Ring…
  lib/
    assistant.js       Grace's intent engine
    themeTransition.js liquid theme switch
    format.js          money and date helpers
  data/seed.js         demo data
  styles/              base (tokens), shell, dashboard, pages, assistant
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Deploying

`npm run build` produces a static site in `dist/` that works on any static host: Vercel, Netlify, Cloudflare Pages or GitHub Pages. Routing uses URL hashes (`#/wallet`), so no server rewrites are needed.

## Browser support

Supported: the latest Chrome, Edge, Safari and Firefox.

The liquid theme switch uses the View Transitions API. Browsers without it get a smooth colour fade instead.

## Credits

- Icons: custom SVG paths in `src/components/Icon.jsx`
- Font: [Inter](https://rsms.me/inter/) (SIL Open Font License)
- Animation: [Framer Motion](https://motion.dev) (MIT)
