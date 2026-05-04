/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  Await,
  Link,
  createRoute,
  defer,
  useLoaderData,
} from '@tanstack/remix-router'
import { Route as RootRoute } from './__root'
import type { Handle } from '@remix-run/ui'

interface SlowChunk {
  payload: string
  resolvedAt: string
}

/**
 * `<Await>` demo. The loader returns immediately with a wrapped
 * deferred promise (`defer()` marks it for streaming-SSR
 * serialization). The component renders the static parts, then
 * `<Await promise={...} />` renders the fallback while the promise is
 * pending and the resolved data afterwards.
 *
 * On the server this exercises:
 *  - `defer()` registration with `router.serverSsr`
 *  - The dehydration script splicing the resolved chunk in front of
 *    `</body>` once the promise settles
 *  - `transformReadableStreamWithRouter` waiting for serialization
 *    before closing the response
 *
 * On the client this exercises:
 *  - `useAwaited`'s `read`/`swap` contract
 *  - The pending → resolved transition driving `handle.update()`
 *  - The hydrated promise (server-resolved) reads as `'success'`
 *    immediately on the client without re-fetching
 */
function DeferredPending(_h: Handle) {
  return () => (
    <p id="deferred-pending" style={{ opacity: 0.7 }}>
      <em>Awaiting the slow chunk…</em>
    </p>
  )
}

function DeferredComponent(handle: Handle) {
  const read = useLoaderData(handle, { from: '/deferred' })

  return () => {
    const data = read() as
      | {
          immediate: string
          slow: Promise<SlowChunk>
        }
      | undefined

    if (!data) {
      return <p>loading…</p>
    }

    return (
      <article>
        <h2>Deferred-promise demo</h2>
        <p>
          <strong>Immediate:</strong> {data.immediate}
        </p>

        <Await
          promise={data.slow}
          fallback={<DeferredPending />}
          render={(slow) => (
            <p id="deferred-resolved">
              <strong>Slow chunk:</strong> {slow.payload} (resolved at{' '}
              <time>{slow.resolvedAt}</time>)
            </p>
          )}
        />

        <p>
          <Link to="/deferred">Re-trigger loader</Link>
        </p>
      </article>
    )
  }
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/deferred',
  loader: async () => {
    // The immediate field is awaited synchronously and serialized in
    // the initial dehydration payload. The `slow` promise is wrapped
    // with `defer()` and streamed when it settles — the client sees
    // the fallback until then.
    return {
      immediate: 'this part is sync',
      slow: defer(
        new Promise<SlowChunk>((resolve) => {
          setTimeout(() => {
            resolve({
              payload: 'arrived after 600ms',
              resolvedAt: new Date().toLocaleTimeString(),
            })
          }, 600)
        }),
      ),
    }
  },
  component: DeferredComponent,
})
