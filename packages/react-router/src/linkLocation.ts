import { createAtom } from '@tanstack/react-store'
import { _normalizeHref } from '@tanstack/history'
import type { AnyRouter, ParsedLocation } from '@tanstack/router-core'

export function createLinkOwner(router: AnyRouter, routeId: string) {
  // HMR and arbitrary formatters need live selection, so no gate is created.
  if (
    process.env.NODE_ENV === 'development' ||
    router.history.createHref !== _normalizeHref
  ) {
    return
  }
  const stores = router.stores
  const certifiedLocations = router._staticLocations
  const source = createAtom((previous?: ParsedLocation): ParsedLocation => {
    const current = stores.location.get()
    const tx = router._tx
    return (
      // Replacing the formatter revokes gating on the next publication.
      router.history.createHref === _normalizeHref &&
        certifiedLocations === router._staticLocations &&
        tx &&
        tx[2 /* location */] === current &&
        !tx[0 /* controller */].signal.aborted &&
        // Commit consumes the lane before incoming components read it.
        tx[3 /* matches */].length &&
        !tx[3 /* matches */].some((match) => match.routeId === routeId) &&
        // Retained owners never acquire a settlement dependency.
        stores.status.get() === 'pending'
        ? (previous ?? stores.resolvedLocation.get() ?? current)
        : current
    )
  })
  // Keep the source's invalidation graph separate from the Links. Only an
  // actual presentation change propagates through their subscriptions.
  const published = createAtom(source.get())
  return Object.assign(published, {
    connect() {
      const subscription = source.subscribe(published.set)
      published.set(source.get())
      return subscription.unsubscribe
    },
  })
}
