import { provideRequestEvent } from '@solidjs/web/storage'
import { createMemoryHistory } from '@tanstack/history'
import type {
  ServerFunctionEvent,
  ServerFunctionOutcome,
} from '@solidjs/web/server-functions/server'
import type { AnyRouter } from '@tanstack/router-core'

export interface LoadFlightTargetOptions<TRouter extends AnyRouter, T> {
  router: TRouter
  /** The mutation's server-function event (the collector's first argument). */
  event: ServerFunctionEvent
  /** The pre-digested mutation outcome (the collector's second argument). */
  outcome: ServerFunctionOutcome
  /**
   * Overrides the target the router loads, for frameworks whose redirects
   * are serialized before the collector sees them (the pre-digested
   * `outcome.targetUrl` only understands raw `Location` headers). Defaults
   * to `outcome.targetUrl`.
   */
  href?: string
  /**
   * Runs inside the flight request-event scope once the target's route
   * data functions have settled — extract whatever the caller's cache
   * needs (dehydrate a query client, snapshot match state). Returning
   * undefined omits the slice from the response.
   */
  collect: (router: TRouter) => T | Promise<T>
}

/**
 * The router's half of single-flight collection: runs the matched routes'
 * data functions for the URL the client will show after a mutation, then
 * hands the loaded router to `collect`. This is the cache-agnostic
 * trigger — the router knows how to load route data for a target, and
 * deliberately not what that data was written into. Any cache builds a
 * flight-data hook from it by composing its own extraction:
 *
 * ```ts
 * registerFlightDataSource('sq', (event, outcome) =>
 *   loadFlightTarget({
 *     router: createAppRouter((queryClient = createQueryClient())),
 *     event,
 *     outcome,
 *     collect: () => dehydrate(queryClient),
 *   }),
 * )
 * ```
 *
 * The load observes post-mutation state: the flight event's request
 * targets `outcome.targetUrl` with the mutation's cookie effects already
 * folded in (a session the mutation just wrote or cleared is what the
 * data functions see, exactly as the browser's next request would), and
 * the router is pointed at the target through a fresh memory history.
 * Resolves undefined when there is no target (a non-browser caller, or a
 * redirect leaving the app).
 */
export async function loadFlightTarget<TRouter extends AnyRouter, T>(
  options: LoadFlightTargetOptions<TRouter, T>,
): Promise<T | undefined> {
  const href = options.href ?? options.outcome.targetUrl
  if (!href) {
    return undefined
  }

  const url = new URL(href)
  const request = new Request(url, {
    headers: options.outcome.foldedHeaders,
    signal: options.outcome.request.signal,
  })
  const flightEvent: ServerFunctionEvent = {
    ...options.event,
    locals: { ...options.event.locals },
    request,
  }

  options.router.update({
    history: createMemoryHistory({
      initialEntries: [url.pathname + url.search + url.hash],
    }),
    origin: url.origin,
  })

  return await provideRequestEvent(flightEvent, async () => {
    // Contained, matching Solid Router's own collector: flight data is an
    // optimization, so a failure here must never surface as a mutation
    // error — the slice is simply omitted and the client cache
    // revalidates the normal way.
    try {
      await options.router.load({ _signal: request.signal })
      return await options.collect(options.router)
    } catch (error) {
      console.error(
        'Error collecting flight data for the mutation target',
        error,
      )
      return undefined
    }
  })
}
