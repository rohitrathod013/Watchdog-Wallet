/* ==================================================================
   Template settings: rebrand the whole dashboard from this one file.
   Colours live in src/styles/base.css (:root tokens), demo data in
   src/data/seed.js, and the logo mark in src/components/Brand.jsx.
   ================================================================== */

export const BRAND = {
  /** Shown in the top bar, modals, cards and exported file names. */
  name: 'Watchdog Wallet',
  /** Domain used for the demo payment link and the user's email. */
  domain: 'watchdogwallet.io',
}

/** The copyright line in the footer of every page and the login screen. */
export const COPYRIGHT = {
  owner: 'Rohit Rathod',
  since: 2026,
}

/** The demo profile, used when accounts (Supabase below) are not set up. */
export const USER = {
  first: 'Rohit',
  name: 'Rohit Rathod',
}

/**
 * Accounts and per-user storage. Create a free project at supabase.com, run
 * supabase/schema.sql in its SQL editor, then provide the two values from
 * Project Settings > API, either as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * (.env.local locally, repository variables for GitHub Pages) or pasted here.
 * The anon key is meant to be public: row level security keeps each user's data private.
 * Leave both empty to run the dashboard as a single-user demo with no login.
 */
export const SUPABASE = {
  url: import.meta.env.VITE_SUPABASE_URL || 'https://jwrdfciewgxklturgcbp.supabase.co',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_wMz68SJQaKFkDKMbfRts6Q_xDH8ivsg',
}

export const THEME = {
  /** 'auto' | 'light' | 'dark': first visit only; the choice is remembered after that.
      'auto' is light from sunrise to sunset where the user is, and dark at night. */
  defaultTheme: 'auto',
  /** The daytime hours for 'auto' when the user's location isn't known yet (24-hour clock, local time). */
  day: { from: 7, to: 19 },
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
