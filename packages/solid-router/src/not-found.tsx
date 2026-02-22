import { isNotFound } from '@tanstack/router-core'
import { useStore } from './store'
import { CatchBoundary } from './CatchBoundary'
import { useRouter } from './useRouter'
import type * as Solid from 'solid-js'
import type { NotFoundError } from '@tanstack/router-core'

export function CatchNotFound(props: {
  fallback?: (error: NotFoundError) => Solid.JSX.Element
  onCatch?: (error: Error) => void
  children: Solid.JSX.Element
}) {
  const router = useRouter()
  // TODO: Some way for the user to programmatically reset the not-found boundary?
  const pathname = useStore(
    router.stores.location,
    (location) => location.pathname,
  )
  const status = useStore(router.stores.status, (value) => value)

  return (
    <CatchBoundary
      getResetKey={() => `not-found-${pathname()}-${status()}`}
      onCatch={(error) => {
        if (isNotFound(error)) {
          props.onCatch?.(error)
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
