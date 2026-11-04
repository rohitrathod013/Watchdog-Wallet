/* ==================================================================
   Template settings — rebrand the whole dashboard from this one file.
   Colours live in src/styles/base.css (:root tokens), demo data in
   src/data/seed.js, and the logo mark in src/components/Brand.jsx.
   ================================================================== */

export const BRAND = {
  /** Shown in the top bar, modals, cards and exported file names. */
  name: 'Watchdog Wallet',
  /** Domain used for the demo payment link and the user's email. */
  domain: 'watchdogwallet.io',
}

export const USER = {
  first: 'Rohit',
  name: 'Rohit Rathod',
}

export const THEME = {
  /** 'light' | 'dark' — first visit only; the choice is remembered after that. */
  defaultTheme: 'light',
  /** 'orange' | 'blue' | 'green' | 'violet' | 'rose' */
  defaultAccent: 'orange',
}

export const ASSISTANT = {
  /** Set to false to remove the mascot and chat panel entirely. */
  enabled: true,
  /** The assistant's name, used in the chat and the hello bubble. */
  name: 'Grace',
  /** Play the fly-in → celebrate → dock intro on page load. */
  intro: true,
}

export const FEATURES = {
  /** Start with the small real-time drift in the balance switched on. */
  liveUpdates: true,
}
