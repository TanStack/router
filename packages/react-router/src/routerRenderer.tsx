'use client'

import * as React from 'react'
import type { ErrorRouteComponent, NotFoundRouteComponent } from './route'

export interface RouterRenderer {
  errorComponent: ErrorRouteComponent
  notFoundComponent: NotFoundRouteComponent
  scrollRestorationComponent?: React.ComponentType
}

const routerRendererContext = React.createContext<RouterRenderer | undefined>(
  undefined,
)

export function RouterRendererProvider({
  renderer,
  children,
}: {
  renderer: RouterRenderer
  children: React.ReactNode
}) {
  return (
    <routerRendererContext.Provider value={renderer}>
      {children}
    </routerRendererContext.Provider>
  )
}

export function useRouterRenderer(): RouterRenderer | undefined {
  return React.useContext(routerRendererContext)
}
