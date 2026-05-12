/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createFileRoute } from '@tanstack/remix-router'
import { Route as LabRoute } from './lab'
import type { Handle } from '@remix-run/ui'

/**
 * Render-time throw. The route loader resolves fine; the component's
 * render function throws. `<CatchBoundary>` in `/lab` catches it (the
 * route has no per-route `errorComponent`) and shows the lab error UI
 * with a `Retry` button.
 */
function ExplosivePage(_handle: Handle) {
  return () => {
    throw new Error('Render-time explosion (no loader involved)')
  }
}

export const Route = createFileRoute('/lab/render-error')({
  getParentRoute: () => LabRoute,
  path: '/lab/render-error',
  component: ExplosivePage,
})
