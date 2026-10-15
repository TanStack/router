import * as Solid from 'solid-js'
import { setupRouteAnnouncer } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type { RouteAnnouncerOptions } from '@tanstack/router-core'

export type RouteAnnouncerProps = RouteAnnouncerOptions

const visuallyHidden: Solid.JSX.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  'white-space': 'nowrap',
  border: '0',
}

/**
 * Moves focus to the new page and announces its title to screen readers after
 * a client-side navigation to a new path. Render it once, in the root route,
 * so that its live region is already in the document before it changes.
 */
export function RouteAnnouncer(props: RouteAnnouncerProps) {
  const router = useRouter()
  let region!: HTMLDivElement

  Solid.onMount(() => {
    // `props` is read on every navigation, so later prop changes apply.
    Solid.onCleanup(setupRouteAnnouncer(router, region, props))
  })

  return (
    <div
      ref={region}
      aria-live="polite"
      aria-atomic="true"
      style={visuallyHidden}
    />
  )
}
