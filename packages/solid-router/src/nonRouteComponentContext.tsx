import * as Solid from 'solid-js'
import type { JSX } from '@solidjs/web'

export type NonRouteComponent =
  | 'pendingComponent'
  | 'errorComponent'
  | 'notFoundComponent'

// Solid 2's `useContext` throws for a default-less context with no mounted
// provider, so default to `null` to keep the unset read falsy instead.
export const nonRouteComponentContext =
  process.env.NODE_ENV !== 'production'
    ? /* @__PURE__ */ Solid.createContext<NonRouteComponent | null>(null)
    : undefined

export function renderInNonRouteComponentContext(
  render: () => JSX.Element,
  component: NonRouteComponent,
) {
  // In Solid 2 the context object itself is the provider component.
  const Context = nonRouteComponentContext!
  return <Context value={component}>{render()}</Context>
}
