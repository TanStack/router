'use client'

import {
  condition as coreCondition,
  interaction as coreInteraction,
  media as coreMedia,
} from '@tanstack/start-client-core/hydration'
import { GenericHydrate } from '../GenericHydrate'
import type {
  HydrationCondition,
  HydrationInteractionEvents,
  HydrationStrategy,
} from '@tanstack/start-client-core/hydration'
import type { ReactHydrationStrategy } from '../Hydrate'

/* @__NO_SIDE_EFFECTS__ */
function withGenericRenderer<T extends HydrationStrategy>(
  strategy: T,
): T & ReactHydrationStrategy {
  return /* @__PURE__ */ Object.assign(strategy, {
    $$renderHydrate: GenericHydrate,
  })
}

/* @__NO_SIDE_EFFECTS__ */
export function media(query: string) {
  return /* @__PURE__ */ withGenericRenderer(coreMedia(query))
}

/* @__NO_SIDE_EFFECTS__ */
export function condition(condition: HydrationCondition) {
  return /* @__PURE__ */ withGenericRenderer(coreCondition(condition))
}

/* @__NO_SIDE_EFFECTS__ */
export function interaction(options?: { events?: HydrationInteractionEvents }) {
  return /* @__PURE__ */ withGenericRenderer(coreInteraction(options))
}
