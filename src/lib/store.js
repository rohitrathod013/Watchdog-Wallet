import { createContext, useContext } from 'react'

/** Everything a page needs from the app shell: shared data, setters, navigation and toasts. */
export const AppContext = createContext(null)

export const useApp = () => useContext(AppContext)

/** The intro offset of the stage a component is rendered in (see Stage in ui.jsx). */
export const StageContext = createContext(0)

export const useStageBase = () => useContext(StageContext)

/** When a counting number inside the current stage should start. */
export const useLead = () => (useStageBase() ? 1050 : 250)

/** False while a Reveal is still waiting to scroll into view. */
export const RevealContext = createContext(true)
