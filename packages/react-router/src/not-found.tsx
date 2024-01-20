import * as React from 'react'
import { CatchBoundary } from './CatchBoundary'
import { useRouterState } from './useRouterState'

export type NotFoundOptions = {
  global?: boolean
  data?: any
}

export function notFound(options: NotFoundOptions = {}) {
  ;(options as any).isNotFound = true
  throw options
}

export function isNotFound(obj: any) {
  return !!obj?.isNotFound
}

export function CatchNotFound(props: {
  fallback?: (error: NotFoundOptions) => React.ReactElement
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
      errorComponent={props.fallback}
    >
      {props.children}
    </CatchBoundary>
  )
}
