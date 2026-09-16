import { REVALIDATE_HEADER } from '@solidjs/web'
import {
  REDIRECT_HEADER,
  decodeRedirectHeaderValue,
  subscribeFlightData,
} from '@solidjs/web/server-functions'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Registers the router as the unnamed single-flight consumer of Solid's
 * server-function transport, so the response helpers a mutation returns —
 * `redirect()`, `reload()`, `respond(value, { revalidate })` — take effect
 * on the client without the caller wrapping the call: the transport hands
 * the caller the plain value and the router applies the metadata. Called
 * by `RouterContextProvider` on the client; returns the unsubscribe.
 *
 * Subscribing is also the single-flight opt-in: while registered, the
 * transport tags mutation calls so the server can fold fresh data for
 * registered collectors into the same response. The router claims no
 * slice of that data itself — route data is reloaded through `invalidate`
 * below, and caches that want seeding (a query client) subscribe under
 * their own source id.
 */
export function setupFlightDataConsumer(router: AnyRouter): () => void {
  return subscribeFlightData((_data, { response }) =>
    applyResponseMetadata(router, response),
  )
}

/**
 * Applies a server-function response's integration metadata to the
 * router. A mutation is a write, so a response carrying metadata reloads
 * the route data the page is built on: committed and cached matches are
 * invalidated the way `router.invalidate()` does after a mutation.
 *
 * `X-Revalidate` names entries in caches the router does not own, so the
 * keys themselves are left to those caches' consumers; the router reads
 * only the declaration's shape. Absent (a bare `redirect()`/`reload()`),
 * named keys, or the reserved `*` all say a write happened — route data
 * reloads. An EMPTY declaration (`revalidate: []`) is the author narrowing
 * the scope to nothing, and the router honors that too: a redirect still
 * navigates, but nothing is reloaded on the way.
 *
 * The redirect carrier delivers the target RESOLVED to an absolute url, so
 * the soft/hard split is a real origin comparison: a same-origin target
 * navigates under the router (`replace`, matching what HTTP gives a form
 * post — the destination takes the submission's place in history), and any
 * other origin leaves the app through a document navigation.
 */
export function applyResponseMetadata(
  router: AnyRouter,
  response: Response,
): void {
  const carried = decodeRedirectHeaderValue(
    response.headers.get(REDIRECT_HEADER),
  )
  const declared = response.headers.get(REVALIDATE_HEADER)
  if (!carried && declared === null) return
  const reload = declared === null || declared.split(',').some(Boolean)

  const target = carried ? new URL(carried.url) : undefined
  const origin = router.options.origin ?? window.location.origin
  if (target && target.origin !== origin) {
    // A full url makes `navigate` reload the document (through the
    // router, so protocol allowlisting and blockers still apply).
    router.navigate({ href: target.href, replace: true })
    return
  }

  // Navigate, then invalidate — in this order so the write costs one load.
  // `navigate` commits the destination to history synchronously (the
  // adapter's own load follows in a microtask); `invalidate` then marks the
  // committed matches — the layouts the destination shares with the page
  // the mutation ran on, whose data is what just changed — and starts a
  // load that already reads the destination as the latest location. The
  // adapter's load adopts the loader generations that load started for
  // the same match ids rather than restarting them, so the destination
  // commits with the layouts reloaded, and the page being left never has
  // its own loaders rerun. The other order would reload the abandoned
  // page first.
  if (target) {
    router
      .navigate({
        href: target.pathname + target.search + target.hash,
        replace: true,
      })
      .catch(console.error)
  }
  if (reload) router.invalidate().catch(console.error)
}
