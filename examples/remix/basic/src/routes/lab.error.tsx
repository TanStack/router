/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createFileRoute } from '@tanstack/remix-router'
import { Route as LabRoute } from './lab'
import { LabErrorComponent } from '../components/LabErrorComponent'
import type { Handle } from '@remix-run/ui'

function ShouldNeverRender(_handle: Handle) {
  return () => <p>If you see this, the loader didn't actually throw.</p>
}

/**
 * Loader throws — `<Match>` flips to `status: 'error'` and renders
 * `errorComponent` (defined per-route here). The enclosing
 * `<CatchBoundary>` in `/lab` is also engaged — both paths work, this
 * route prefers the per-route component for direct control.
 */
export const Route = createFileRoute('/lab/error')({
  getParentRoute: () => LabRoute,
  path: '/lab/error',
  loader: () => {
    throw new Error('Intentional loader error from /lab/error')
  },
  errorComponent: LabErrorComponent,
  component: ShouldNeverRender,
})
