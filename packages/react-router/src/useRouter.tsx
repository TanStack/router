'use client'

import * as React from 'react'
import { routerContext } from './routerContext'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'

/**
 * Access the current TanStack Router instance from React context.
 * Must be used within a `RouterProvider`.
 *
 * Options:
 * - `warn`: Log a warning if no router context is found (default: true).
 *
 * @returns The registered router instance.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useRouterHook
 */
export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(opts?: {
  warn?: boolean
}): TRouter {
  const value = useRouterContext(opts)
  return (value && value[0]) as any
}

// Router and presentation source share one context dependency for Links.
export function useRouterContext(opts?: { warn?: boolean }) {
  const value = React.useContext(routerContext)
  if (!value) {
    warnMissingRouter(opts)
  }
  return value
}

// Kept out of the hook body: this dev-only branch runs for every Link and
// route hook, and on the server each `process.env` read is a native call.
function warnMissingRouter(opts?: { warn?: boolean }) {
  if (process.env.NODE_ENV !== 'production' && (opts?.warn ?? true)) {
    console.warn(
      'Warning: useRouter must be used inside a <RouterProvider> component!',
    )
  }
}
