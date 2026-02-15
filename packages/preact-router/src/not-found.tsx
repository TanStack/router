import { isNotFound } from '@tanstack/router-core'
import { CatchBoundary } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import type { NotFoundError } from '@tanstack/router-core'
import type { ComponentChildren, VNode } from 'preact'

export function CatchNotFound(props: {
  fallback?: (error: NotFoundError) => VNode | null
  onCatch?: (error: Error, errorInfo: { componentStack?: string }) => void
  children: ComponentChildren
}) {
  const resetKey = useRouterState({
    select: (s) => `not-found-${s.location.pathname}-${s.status}`,
  })

  return (
    <CatchBoundary
      getResetKey={() => resetKey}
      onCatch={(error, errorInfo) => {
        if (isNotFound(error)) {
          props.onCatch?.(error, errorInfo)
        } else {
          throw error
        }
      }}
      errorComponent={({ error }) => {
        if (isNotFound(error)) {
          return props.fallback?.(error) ?? null
        } else {
          throw error
        }
      }}
    >
      {props.children}
    </CatchBoundary>
  )
}

export function DefaultGlobalNotFound() {
  return <p>Not Found</p>
}
