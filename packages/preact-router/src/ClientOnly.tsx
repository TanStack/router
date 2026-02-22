import { Fragment } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'

export interface ClientOnlyProps {
  children: ComponentChildren
  fallback?: ComponentChildren
}

/**
 * Render the children only after the JS has loaded client-side.
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  return useHydrated() ? (
    <Fragment>{children}</Fragment>
  ) : (
    <Fragment>{fallback}</Fragment>
  )
}

/**
 * Return a boolean indicating if the JS has been hydrated already.
 * Uses useState + useEffect since Preact doesn't have useSyncExternalStore.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return hydrated
}
