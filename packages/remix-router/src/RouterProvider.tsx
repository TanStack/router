/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { Matches } from './Matches'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Props for {@link RouterProvider} and {@link RouterContextProvider}.
 */
export interface RouterProviderProps {
  router: AnyRouter
}

/**
 * Props for {@link RouterContextProvider}. Identical to
 * {@link RouterProviderProps} but with explicit children.
 */
export interface RouterContextProviderProps extends RouterProviderProps {
  children?: RemixNode
}

/**
 * Mirrors `RouterContextProvider` from `@tanstack/react-router`. Places
 * the router in `remix/ui` context without rendering `<Matches>` — useful
 * when an app wants to opt out of the default tree (custom shell, custom
 * boundary).
 *
 * This is the canonical "context key" component. `useRouter(handle)`
 * looks up `handle.context.get(RouterContextProvider)`, so this must wrap
 * any subtree that reads from the router.
 */
export function RouterContextProvider(
  handle: Handle<RouterContextProviderProps, AnyRouter>,
) {
  return ({ router, children }: RouterContextProviderProps): RemixNode => {
    // Set the context value on every render so descendants pick up a
    // fresh `router` reference if the prop ever changes (HMR, tests).
    // Same render-time-set pattern as `<MatchContext>` — Remix UI
    // reuses same-type vnodes across navigations, so the setup phase
    // can't be the source of truth for prop-derived context values.
    handle.context.set(router)

    const Wrap = router.options.Wrap as
      | ((props: { children: RemixNode }) => RemixNode)
      | undefined
    if (Wrap) {
      // Wrap is a React-shape component (props -> RemixNode). Call it
      // directly rather than using JSX — the Remix UI compiler expects
      // factory-shaped (handle -> renderFn) components in JSX
      // position, but a router-options-supplied Wrap follows the
      // cross-binding contract.
      return Wrap({ children }) as RemixNode
    }
    return <>{children}</>
  }
}

/**
 * Top-level component that places the router into `remix/ui` context and
 * renders the active route match tree. Mirrors `RouterProvider` from
 * `@tanstack/react-router`.
 */
export function RouterProvider(handle: Handle<RouterProviderProps, AnyRouter>) {
  void handle
  return ({ router }: RouterProviderProps): RemixNode => (
    <RouterContextProvider router={router}>
      <Matches />
    </RouterContextProvider>
  )
}

/**
 * Alias for `RouterProviderProps` to match the React binding's name.
 */
export type RouterProps = RouterProviderProps
