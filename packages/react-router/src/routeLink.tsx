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

export const RouteLink = React.forwardRef<unknown, Record<string, unknown>>(
  function RouteLink(props, ref) {
    const LinkComponent = React.useContext(routeLinkContext)

    if (!LinkComponent) {
      throw new Error(
        'Route.Link must be rendered inside a TanStack Router provider.',
      )
    }

    return React.createElement(LinkComponent, { ...props, ref })
  },
)
