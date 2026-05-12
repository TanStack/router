/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { isNotFound } from '@tanstack/router-core'
import { CatchBoundary } from './CatchBoundary'
import { useRouter } from './useRouter'
import { useLocation } from './useLocation'
import { useRouterState } from './useRouterState'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { NotFoundError } from '@tanstack/router-core'

export interface CatchNotFoundProps {
  fallback?: (error: NotFoundError) => RemixNode
  onCatch?: (error: Error, info: { componentStack: string }) => void
  children?: RemixNode
}

/**
 * Catches `notFound()` throws and renders `fallback` instead. Other errors
 * are re-thrown.
 *
 * Mirrors `<CatchNotFound>` from `@tanstack/react-router`.
 */
export function CatchNotFound(handle: Handle<CatchNotFoundProps>) {
  const router = useRouter(handle)
  void useLocation(handle)
  void useRouterState(handle)

  return (props: CatchNotFoundProps): RemixNode => {
    const pathname = router.stores.location.get().pathname
    const status = router.stores.status.get()
    const resetKey = `not-found-${pathname}-${status}`
    return (
      <CatchBoundary
        getResetKey={() => resetKey}
        onCatch={(error, info) => {
          if (isNotFound(error)) props.onCatch?.(error, info)
          else throw error
        }}
        errorComponent={(catchHandle: Handle<{ error: any }>) =>
          (({ error }: { error: any }) => {
            void catchHandle
            if (isNotFound(error)) {
              return props.fallback ? props.fallback(error) : null
            }
            throw error
          })
        }
      >
        {props.children}
      </CatchBoundary>
    )
  }
}

/**
 * Stand-in not-found UI used when no `notFoundComponent` or
 * `defaultNotFoundComponent` is configured.
 */
export function DefaultGlobalNotFound() {
  return () => <p>Not Found</p>
}
