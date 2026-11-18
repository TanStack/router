'use client'

import * as React from 'react'
import { setupRouteAnnouncer } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type { RouteAnnouncerOptions } from '@tanstack/router-core'

export type RouteAnnouncerProps = RouteAnnouncerOptions

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/**
 * Moves focus to the new page and announces its title to screen readers after
 * a client-side navigation to a new path. Render it once, in the root route,
 * so that its live region is already in the document before it changes.
 */
export function RouteAnnouncer(props: RouteAnnouncerProps) {
  const router = useRouter()
  const regionRef = React.useRef<HTMLDivElement>(null)
  // Read on every navigation, like the props in Solid and Vue, so an inline
  // `focusSelectors` array doesn't resubscribe on every render.
  const propsRef = React.useRef(props)
  propsRef.current = props

  React.useEffect(
    () =>
      setupRouteAnnouncer(router, regionRef.current!, {
        get focusSelectors() {
          return propsRef.current.focusSelectors
        },
      }),
    [router],
  )

  return (
    <div
      ref={regionRef}
      aria-live="polite"
      aria-atomic="true"
      style={visuallyHidden}
    />
  )
}
