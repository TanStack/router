import { idle as coreIdle } from '@tanstack/start-client-core/hydration'
import { StrategyHydrate } from './visible'
import type { HydrationPrefetchStrategy } from '@tanstack/start-client-core/hydration'
import type { SolidHydrationStrategy } from '../Hydrate'

/* @__NO_SIDE_EFFECTS__ */
export function idle(options?: {
  timeout?: number
}): SolidHydrationStrategy & HydrationPrefetchStrategy {
  return /* @__PURE__ */ Object.assign(coreIdle(options), {
    $$renderHydrate: StrategyHydrate,
  })
}
