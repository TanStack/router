import * as Solid from 'solid-js'
import type { AnyRouteMatch } from '@tanstack/router-core'

export type NearestMatchContextValue = {
  matchId: Solid.Accessor<string | undefined>
  routeId: Solid.Accessor<string | undefined>
  match: Solid.Accessor<AnyRouteMatch | undefined>
}

const defaultNearestMatchContext: NearestMatchContextValue = {
  matchId: () => undefined,
  routeId: () => undefined,
  match: () => undefined,
}

export const nearestMatchContext =
  Solid.createContext<NearestMatchContextValue>(defaultNearestMatchContext)
