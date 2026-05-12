/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { Outlet } from './Outlet'
import { Transitioner } from './Transitioner'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter } from './useRouter'
import { subscribeStore } from './subscribe'
import type { Handle, RemixNode } from '@remix-run/ui'

const isClient = typeof document !== 'undefined'

/**
 * Render the root match tree.
 *
 * Wires up:
 * - The `<Transitioner>` (only on the client — server renders are one-shot).
 * - A top-level `<CatchBoundary>` unless `disableGlobalCatchBoundary` is set.
 * - `router.options.InnerWrap` around the body of the catch boundary.
 *   Mirrors React/Solid: lets apps inject providers (theme, query client,
 *   …) that need to live INSIDE the router context but only around the
 *   match tree, not the document shell.
 * - An `<Outlet />` that descends into the first match.
 */
export function Matches(handle: Handle) {
  const router = useRouter(handle)
  const readLoadedAt = subscribeStore(handle, router.stores.loadedAt)

  return (): RemixNode => {
    const InnerWrap = router.options.InnerWrap as
      | ((props: { children: RemixNode }) => RemixNode)
      | undefined

    let inner: RemixNode = (
      <>
        {isClient && !router.isServer ? <Transitioner /> : null}
        <Outlet />
      </>
    )

    if (InnerWrap) {
      // InnerWrap follows the same React-shape contract as Wrap —
      // call it as a function rather than using JSX.
      inner = InnerWrap({ children: inner })
    }

    if (router.options.disableGlobalCatchBoundary) {
      return inner
    }

    return (
      <CatchBoundary
        getResetKey={() => readLoadedAt()}
        errorComponent={ErrorComponent}
        onCatch={(error) => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              "Warning: An uncaught error reached the router's global catch boundary.",
              error,
            )
          }
        }}
      >
        {inner}
      </CatchBoundary>
    )
  }
}
