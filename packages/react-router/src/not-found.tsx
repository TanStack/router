import * as React from 'react'
import { isNotFound } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useStore } from '@tanstack/react-store'
import { CatchBoundary } from './CatchBoundary'
import { useRouter } from './useRouter'
import { useRouterStateSnapshotStore } from './routerStateSnapshot'
import type { ErrorInfo } from 'react'
import type { NotFoundError } from '@tanstack/router-core'

export function CatchNotFound(props: {
  fallback?: (error: NotFoundError) => React.ReactElement
  onCatch?: (error: Error, errorInfo: ErrorInfo) => void
  children: React.ReactNode
}) {
  const router = useRouter()
  const snapshotStore = useRouterStateSnapshotStore(router)

  if (isServer ?? router.isServer) {
    const snapshot = snapshotStore?.get()
    const pathname =
      snapshot?.location.pathname ?? router.stores.location.get().pathname
    const status = snapshot?.status ?? router.stores.status.get()
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

  // TODO: Some way for the user to programmatically reset the not-found boundary?
  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const pathname = useStore(
    (snapshotStore ?? router.stores.location) as any,
    (value: any) => (snapshotStore ? value.location.pathname : value.pathname),
  )
  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const status = useStore(
    (snapshotStore ?? router.stores.status) as any,
    (value: any) => (snapshotStore ? value.status : value),
  )
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
