'use client'

import * as React from 'react'
import type { createLinkOwner } from './linkLocation'

export type MatchContext = readonly [
  routeId: string,
  links?: ReturnType<typeof createLinkOwner>,
]

export const matchContext = React.createContext<MatchContext | undefined>(
  undefined,
)

// N.B. this only exists so we can conditionally call useContext on it when we are not interested in the nearest match
export const dummyMatchContext = React.createContext<MatchContext | undefined>(
  undefined,
)
