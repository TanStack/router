// Router + match contexts. `routerContext` carries the Router instance (provided
// by RouterProvider, read by every hook). `matchContext` carries the current
// match id down the render tree so `Outlet` can find the NEXT match to render —
// the pull-based chaining that replaces a top-down state diff.
import { createContext, useContext } from 'octane'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

export const routerContext = createContext<AnyRouter | undefined>(undefined)
export const getRouterContext = (): typeof routerContext => routerContext

// The id of the nearest rendered match (undefined above the first match).
export const matchContext = createContext<string | undefined>(undefined)

// Resolve the active router: an explicitly-passed one wins, else the context.
// `useContext` is keyed by context identity (not a per-call-site slot), so it's
// safe to call from this binding code without a slot.
export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(opts?: {
  router?: TRouter
  warn?: boolean
}): TRouter
export function useRouter(...args: Array<unknown>): AnyRouter {
  const opts = (
    args.length && typeof args[0] !== 'symbol' ? args[0] : undefined
  ) as { router?: AnyRouter; warn?: boolean } | undefined
  const ctx = useContext(routerContext)
  const router = opts?.router ?? ctx
  if (!router && opts?.warn !== false) {
    throw new Error(
      'useRouter must be used inside a <RouterProvider> component!',
    )
  }
  return router as AnyRouter
}
