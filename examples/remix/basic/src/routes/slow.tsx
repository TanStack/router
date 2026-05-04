/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  Link,
  createRoute,
  useLoaderData,
} from '@tanstack/remix-router'
import { Route as RootRoute } from './__root'
import type { Handle } from '@remix-run/ui'

function SlowPending(_handle: Handle) {
  return () => (
    <p style={{ opacity: 0.7 }}>
      <em>Loading slowly… (the loader is artificially delayed by 800ms)</em>
    </p>
  )
}

function SlowComponent(handle: Handle) {
  const readData = useLoaderData(handle, { from: '/slow' })
  return () => {
    const data = readData() as { message: string; loadedAt: string } | undefined
    return (
      <article>
        <h2>{data?.message}</h2>
        <p>
          <small>Loaded at {data?.loadedAt}</small>
        </p>
        <p>
          <Link to="/slow">Re-trigger loader</Link>
        </p>
      </article>
    )
  }
}

/**
 * Async loader (800ms artificial delay) so we can see `pendingComponent`
 * render during the transition. Exercises:
 *
 *  - `match.status === 'pending'` branch in `<Match>` picking
 *    `pendingComponent`
 *  - `<Transitioner>` lifecycle: `isLoading` flips during the load,
 *    `hasPending` until `pendingMinMs` elapses
 *  - The atom subscribe path on `router.stores.isLoading` and
 *    `router.stores.hasPending`
 */
export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/slow',
  pendingMs: 100,
  pendingMinMs: 400,
  loader: async () => {
    await new Promise((r) => setTimeout(r, 800))
    return {
      message: 'Loaded after 800ms',
      loadedAt: new Date().toLocaleTimeString(),
    }
  },
  pendingComponent: SlowPending,
  component: SlowComponent,
})
