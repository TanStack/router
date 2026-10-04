'use client'

import * as React from 'react'
import { _isRouteDeparting } from '@tanstack/router-core'
import type { AnyRoute, AnyRouter, ParsedLocation } from '@tanstack/router-core'

/**
 * The nearest match's route id, and the link scope its links share once one
 * renders. A match provides one value per route id.
 */
export type MatchContext = [routeId?: string, linkScope?: LinkScope]

export const matchContext = React.createContext<MatchContext | undefined>(
  undefined,
)

// N.B. this only exists so we can conditionally call useContext on it when we are not interested in the nearest match
export const dummyMatchContext = React.createContext<MatchContext | undefined>(
  undefined,
)

declare module '@tanstack/router-core' {
  // Declaration merging requires the original type parameters.
  // eslint-disable-next-line unused-imports/no-unused-vars
  interface RouterStores<in out TRouteTree extends AnyRoute> {
    /** The holder of the link scope of links outside every match. */
    _linkScope?: MatchContext
  }
}

/**
 * The location source shared by the links of one route. It holds one location
 * subscription for all of them while any is subscribed, and skips a
 * publication whose navigation removes the route: those links keep the
 * location their route still presents until it unmounts or a newer
 * publication keeps it. Without subscribers it holds nothing and reads the
 * live location.
 */
export type LinkScope = [
  getSource: () => ParsedLocation,
  subscribe: (listener: () => void) => () => void,
]

export function createLinkScope(
  router: AnyRouter,
  routeId?: string,
): LinkScope {
  // Stores are created once per router.
  const store = router.stores.location
  const listeners = new Set<() => void>()
  let source: ParsedLocation | undefined
  let unsubscribe: () => void
  const update = (location: ParsedLocation) => {
    if (!_isRouteDeparting(router, routeId, location)) {
      source = location
      listeners.forEach((listener) => listener())
      // A listener can navigate while deriving. The store does not rerun the
      // subscription that is notifying for that nested publication.
      if (store.get() !== location) {
        update(store.get())
      }
    }
  }
  return [
    () => source ?? store.get(),
    (listener) => {
      if (!listeners.size) {
        source = store.get()
        unsubscribe = store.subscribe(update).unsubscribe
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          unsubscribe()
          source = undefined
        }
      }
    },
  ]
}
