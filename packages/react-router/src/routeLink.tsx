'use client'

import * as React from 'react'

export type RouteLinkComponent = React.ElementType

const routeLinkContext = React.createContext<RouteLinkComponent | undefined>(
  undefined,
)

export function RouteLinkProvider({
  component,
  children,
}: {
  component: RouteLinkComponent
  children: React.ReactNode
}) {
  return (
    <routeLinkContext.Provider value={component}>
      {children}
    </routeLinkContext.Provider>
  )
}

export function useRouteLinkComponent() {
  return React.useContext(routeLinkContext)
}
