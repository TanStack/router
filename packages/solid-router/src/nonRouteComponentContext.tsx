import * as Solid from 'solid-js'
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
    ? /* @__PURE__ */ Solid.createContext<NonRouteComponentContextValue>()
    : undefined

export function renderInNonRouteComponentContext(
  render: () => Solid.JSX.Element,
  component: 'pendingComponent',
  route: AnyRoute,
): Solid.JSX.Element
export function renderInNonRouteComponentContext(
  render: () => Solid.JSX.Element,
  component: 'errorComponent' | 'notFoundComponent',
): Solid.JSX.Element
export function renderInNonRouteComponentContext(
  render: () => Solid.JSX.Element,
  component: NonRouteComponent,
  route?: AnyRoute,
) {
  const Context = nonRouteComponentContext!
  const value: NonRouteComponentContextValue =
    component === 'pendingComponent'
      ? { component, route: route! }
      : { component }
  return <Context.Provider value={value}>{render()}</Context.Provider>
}
