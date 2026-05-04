import { RouterContextProvider } from './RouterProvider'
import type { Handle } from '@remix-run/ui'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

/**
 * Read the router instance from the nearest enclosing `<RouterProvider>`.
 *
 * Mirrors `useRouter` from `@tanstack/react-router`. Differences:
 * - Takes the component `handle` as the first argument (no fiber stack to
 *   walk, so context is read explicitly).
 * - The returned router is plain (not a getter) — the router instance
 *   itself is stable across renders.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useRouterHook
 */
export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(
  handle: Handle<any, any>,
  opts?: { warn?: boolean },
): TRouter {
  const value = handle.context.get(RouterContextProvider) as TRouter | undefined
  if (process.env.NODE_ENV !== 'production') {
    if ((opts?.warn ?? true) && !value) {
      console.warn(
        'Warning: useRouter must be used inside a <RouterProvider> component!',
      )
    }
  }
  return value as TRouter
}
