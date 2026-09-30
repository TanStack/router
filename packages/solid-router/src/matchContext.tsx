import * as Solid from 'solid-js'
import { rootRouteId } from '@tanstack/router-core'
import type { AnyRouteMatch } from '@tanstack/router-core'

export type NearestMatchContextValue = readonly [
  routeId: Solid.Accessor<string>,
  match: Solid.Accessor<AnyRouteMatch | undefined>,
]

const defaultNearestMatchContext: NearestMatchContextValue = [
  () => rootRouteId,
  () => undefined,
]

export const nearestMatchContext =
  Solid.createContext<NearestMatchContextValue>(defaultNearestMatchContext)
