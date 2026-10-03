import * as Solid from 'solid-js'
import type {
  AnyRouteMatch,
  RouterPresentationSource,
} from '@tanstack/router-core'

// Keep the nearest-match accessor beside the canonical core presentation source.
export type RouterContextValue = readonly [
  ...RouterPresentationSource,
  match?: Solid.Accessor<AnyRouteMatch | undefined>,
]

export const routerContext = Solid.createContext<RouterContextValue>(null!)
