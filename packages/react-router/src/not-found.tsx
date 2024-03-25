// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import * as React from 'react'
import { CatchBoundary } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import type { RegisteredRouter } from './router'
import type { RouteIds } from './routeInfo'

export type NotFoundError = {
  /**
    @deprecated
    Use `routeId: rootRouteId` instead
  */
  global?: boolean
  /**
    @private
    Do not use this. It's used internally to indicate a path matching error
  */
  _global?: boolean
  data?: any
  throw?: boolean
  routeId?: RouteIds<RegisteredRouter['routeTree']>
  headers?: HeadersInit
}

export function notFound(options: NotFoundError = {}) {
  ;(options as any).isNotFound = true
  if (options.throw) throw options
  return options
}

export function isNotFound(obj: any): obj is NotFoundError {
  return !!obj?.isNotFound
}

export function CatchNotFound(props: {
  fallback?: (error: NotFoundError) => React.ReactElement
  onCatch?: (error: any) => void
  children: React.ReactNode
}) {
  // TODO: Some way for the user to programmatically reset the not-found boundary?
  const resetKey = useRouterState({
    select: (s) => `not-found-${s.location.pathname}-${s.status}`,
  })

  return (
    <CatchBoundary
      getResetKey={() => resetKey}
      onCatch={(error) => {
        if (isNotFound(error)) {
          props.onCatch?.(error)
        } else {
          throw error
        }
      }}
      errorComponent={({ error }: { error: NotFoundError }) =>
        props.fallback?.(error)
      }
    >
      {props.children}
    </CatchBoundary>
  )
}

export function DefaultGlobalNotFound() {
  return <p>Not Found</p>
}
