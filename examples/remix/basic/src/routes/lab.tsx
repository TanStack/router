/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  CatchBoundary,
  Link,
  Outlet,
  createRoute,
  useRouter,
} from '@tanstack/remix-router'
import { Route as RootRoute } from './__root'
import { LabErrorComponent } from '../components/LabErrorComponent'
import { subscribeStore } from '@tanstack/remix-router'
import type { Handle } from '@remix-run/ui'

/**
 * Pathless layout for the boundary demo. Renders a `<CatchBoundary>`
 * around the leaf — synchronous render-time errors that bubble through
 * the leaf's own `errorComponent` would also be caught here, with the
 * boundary's reset key forcing a remount on next nav.
 */
function LabLayout(handle: Handle) {
  const router = useRouter(handle)
  const readLoadedAt = subscribeStore(handle, router.stores.loadedAt)
  return () => (
    <main>
      <h1>Lab</h1>
      <nav>
        <Link to="/lab/error">Loader throws</Link>
        {' · '}
        <Link to="/lab/missing">Not found</Link>
        {' · '}
        <Link to="/lab/render-error">Render throws</Link>
      </nav>
      <hr />
      <CatchBoundary
        getResetKey={() => readLoadedAt()}
        errorComponent={LabErrorComponent}
      >
        <Outlet />
      </CatchBoundary>
    </main>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  id: '_lab',
  component: LabLayout,
})
