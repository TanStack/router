import * as React from 'react'

/**
 * A fragment that can be used as a fallback for suspense boundaries
 * when no actual suspense boundary is needed.
 */
export function SafeFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
