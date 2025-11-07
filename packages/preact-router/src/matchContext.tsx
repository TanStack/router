import { createContext } from 'preact'

export const matchContext = createContext<string | undefined>(undefined)

// N.B. this only exists so we can conditionally call useContext on it when we are not interested in the nearest match
export const dummyMatchContext = createContext<string | undefined>(undefined)
