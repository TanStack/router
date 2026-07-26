import { hydrateStart as coreHydrateStart } from '@tanstack/start-client-core/client'
import type { AnyRouter } from '@tanstack/router-core'

type StoreSubscription = {
  unsubscribe: () => void
}

type SubscribableStore<TValue> = {
  get: () => TValue
  subscribe: (listener: () => void) => StoreSubscription
}

/**
 * Octane batches router store writes in a transition. The core hydration
 * promise can therefore settle before the hydrated matches are observable to
 * the first render. Wait for that commit so hydrateRoot never adopts the
 * server document with an empty match tree.
 */
export function waitForRouterMatches(router: AnyRouter): Promise<void> {
  const matchesId = router.stores.matchesId as unknown as SubscribableStore<
    Array<string>
  >

  if (matchesId.get().length > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let resolved = false

    const finish = () => {
      if (resolved || matchesId.get().length === 0) {
        return
      }

      resolved = true
      subscription.unsubscribe()
      resolve()
    }

    const subscription = matchesId.subscribe(finish)

    // Close the race where the transition commits between the initial read and
    // listener registration without synchronously notifying this listener.
    finish()
  })
}

export async function hydrateStart(): Promise<AnyRouter> {
  const router = await coreHydrateStart()
  await waitForRouterMatches(router)
  return router
}
