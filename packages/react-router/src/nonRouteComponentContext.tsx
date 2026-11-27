'use client'

import * as React from 'react'
import type { AnyRoute } from '@tanstack/router-core'

export type NonRouteComponent =
  | 'pendingComponent'
  | 'errorComponent'
  | 'notFoundComponent'

export type NonRouteComponentContextValue =
  | {
      component: 'pendingComponent'
      route: AnyRoute
    }
  | {
      component: 'errorComponent' | 'notFoundComponent'
      route?: undefined
    }

export const nonRouteComponentContext =
  process.env.NODE_ENV !== 'production'
    ? React.createContext<NonRouteComponentContextValue | undefined>(undefined)
    : undefined

export function wrapInNonRouteComponentContext(
  element: React.ReactElement,
  component: 'pendingComponent',
  route: AnyRoute,
): React.ReactElement
export function wrapInNonRouteComponentContext(
  element: React.ReactElement,
  component: 'errorComponent' | 'notFoundComponent',
): React.ReactElement
export function wrapInNonRouteComponentContext(
  element: React.ReactElement,
  component: NonRouteComponent,
  route?: AnyRoute,
): React.ReactElement {
  const Context = nonRouteComponentContext!
  const value: NonRouteComponentContextValue =
    component === 'pendingComponent'
      ? { component, route: route! }
      : { component }
  return <Context.Provider value={value}>{element}</Context.Provider>
}
