import {
  condition as coreCondition,
  interaction as coreInteraction,
  media as coreMedia,
} from '@tanstack/start-client-core/hydration'
import { GenericHydrate } from '../GenericHydrate'
import type {
  HydrationCondition,
  HydrationInteractionEvents,
  HydrationPrefetchStrategy,
  HydrationStrategy,
} from '@tanstack/start-client-core/hydration'
import type { SolidHydrationStrategy } from '../Hydrate'

/* @__NO_SIDE_EFFECTS__ */
function withGenericRenderer<T extends HydrationStrategy>(
  strategy: T,
): T & SolidHydrationStrategy {
  return /* @__PURE__ */ Object.assign(strategy, {
    _h: GenericHydrate,
  })
}

/* @__NO_SIDE_EFFECTS__ */
export function media(
  query: string,
): SolidHydrationStrategy<'media', true> & HydrationPrefetchStrategy<'media'> {
  return /* @__PURE__ */ withGenericRenderer(coreMedia(query))
}

/* @__NO_SIDE_EFFECTS__ */
export function condition(
  condition: HydrationCondition,
): SolidHydrationStrategy<'condition', false> {
  return /* @__PURE__ */ withGenericRenderer(coreCondition(condition))
}

/* @__NO_SIDE_EFFECTS__ */
export function interaction(options?: {
  events?: HydrationInteractionEvents
}): SolidHydrationStrategy<'interaction', true> &
  HydrationPrefetchStrategy<'interaction'> {
  return /* @__PURE__ */ withGenericRenderer(coreInteraction(options))
}
