import * as React from 'react'
import { CatchBoundary } from './CatchBoundary'

export function notFound(userData?: any) {
  const data = userData ?? {}
  data.isNotFound = true
  throw data
}

export function isNotFound(obj: any) {
  return !!obj?.isNotFound
}

export function CatchNotFound(props: {
  fallback?: any
  onCatch?: (error: any) => void
  children: React.ReactNode
}) {
  return (
    <CatchBoundary
      getResetKey={() => {
        // TODO:
        return 'TODO'
      }}
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
