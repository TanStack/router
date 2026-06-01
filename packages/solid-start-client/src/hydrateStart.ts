import { hydrateStart as coreHydrateStart } from '@tanstack/start-client-core/client'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Solid-specific wrapper for hydrateStart that signals hydration completion
 */
export async function hydrateStart(): Promise<AnyRouter> {
  const router = await coreHydrateStart()
  // Resolve any deferred serialization-adapter deserializations queued by the
  // early `$_TSR` stub (see solid-router/HeadContent). By now `coreHydrateStart`
  // has installed the real adapter map on `$_TSR.t`, so each queued entry can
  // deserialize and resolve its Promise (which the `<Await>` async memos await).
  const deferQueue = (window as any).$_TSR_d as
    | Array<(t: { get: (key: string) => (value: any) => any }) => void>
    | undefined
  if (deferQueue && window.$_TSR?.t) {
    const t = window.$_TSR.t as unknown as {
      get: (key: string) => (value: any) => any
    }
    deferQueue.forEach((resolve) => resolve(t))
    deferQueue.length = 0
  }
  // Solid streams deferred resources (e.g. `<Await>` data) through its own
  // resource-hydration mechanism, which can run *after* TanStack's `$_TSR.e()`
  // stream-end marker. The default `$_TSR.c()` deletes `self.$_TSR` (and its
  // adapter map) once `hydrated && streamEnded`, which would break those late
  // `$_TSR.t.get(...)` deserializations. Neutralize the teardown so the adapter
  // registry stays available for Solid's progressive resource stream.
  if (window.$_TSR) {
    ;(window.$_TSR as any).c = () => {}
  }
  // Signal that router hydration is complete so cleanup can happen if stream has ended
  window.$_TSR?.h()
  return router
}
