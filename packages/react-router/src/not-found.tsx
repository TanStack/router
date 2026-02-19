import * as React from 'react'
import { isNotFound } from '@tanstack/router-core'
import { useStore } from '@tanstack/react-store'
import { CatchBoundary } from './CatchBoundary'
import { useRouter } from './useRouter'
import type { ErrorInfo } from 'react'
import type { NotFoundError } from '@tanstack/router-core'

export function CatchNotFound(props: {
  fallback?: (error: NotFoundError) => React.ReactElement
  onCatch?: (error: Error, errorInfo: ErrorInfo) => void
  children: React.ReactNode
}) {
  const router = useRouter()
  // TODO: Some way for the user to programmatically reset the not-found boundary?
  const pathname = useStore(router.locationStore, (location) => location.pathname)
  const status = useStore(router.statusStore, (status) => status)
  const resetKey = `not-found-${pathname}-${status}`

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
          return props.fallback?.(error)
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
