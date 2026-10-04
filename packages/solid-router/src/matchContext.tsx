import * as Solid from 'solid-js'
import type { AnyRouteMatch, ParsedLocation } from '@tanstack/router-core'

export type NearestMatchContextValue = readonly [
  routeId: Solid.Accessor<string | undefined>,
  match: Solid.Accessor<AnyRouteMatch | undefined>,
  /**
   * The location the match's links build from. Links without one read the
   * live location.
   */
  linkLocation?: Solid.Accessor<ParsedLocation>,
]

const defaultNearestMatchContext: NearestMatchContextValue = [
  () => undefined,
  () => undefined,
]

export const nearestMatchContext =
  Solid.createContext<NearestMatchContextValue>(defaultNearestMatchContext)
