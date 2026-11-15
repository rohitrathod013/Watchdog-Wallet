/* Which version of the bank and card terms (components/Terms.jsx) is current, and whether the user agreed to it. */
import { useApp } from './store'

/** Change this when the terms change: everyone is asked to agree again. */
export const TERMS_VERSION = '2026-11-14'
export const TERMS_UPDATED = 'November 14, 2026'

/** Whether the signed-in user agreed to the current terms, and a way to record it. */
export function useTerms() {
  const { terms, acceptTerms, demo } = useApp()
  return { agreed: Boolean(demo) || terms?.version === TERMS_VERSION, agree: () => acceptTerms?.(TERMS_VERSION) }
}
