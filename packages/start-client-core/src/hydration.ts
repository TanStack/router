import { hydrateIdAttribute } from './hydration/constants'

export { condition } from './hydration/condition'
export type { HydrationCondition } from './hydration/condition'
export {
  hydrateIdAttribute,
  hydrateInteractionEventsAttribute,
  hydrateWhenAttribute,
} from './hydration/constants'
export const hydrateIdSelector = `[${hydrateIdAttribute}]`
export { idle, scheduleIdle } from './hydration/idle'
export type { IdleHydrationOptions } from './hydration/idle'
export { interaction } from './hydration/interaction'
export { load } from './hydration/load'
export { media } from './hydration/media'
export { never } from './hydration/never'
export {
  clearResolvedGateIdsInMarker,
  createResolvedGate,
  getFallbackHtml,
  getMarkerGate,
  getOrCreateGate,
  onGateResolve,
  releaseGate,
  resolveHydrationMarker,
  saveFallbackHtml,
} from './hydration/runtime'
export { visible } from './hydration/visible'
export type { VisibleHydrationOptions } from './hydration/visible'
export type { HydrationGateRecord } from './hydration/runtime'
export type {
  HydrationInteractionEvent,
  HydrationInteractionEvents,
  HydrationMarkerAttributes,
  HydrationPrefetchWhen,
  HydrationPrefetchStrategy,
  HydrationRuntimeContext,
  HydrationRuntimeGate,
  HydrationStrategy,
  HydrationStrategyTypes,
  HydrationWhen,
} from './hydration/types'
