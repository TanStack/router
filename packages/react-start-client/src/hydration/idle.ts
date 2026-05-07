'use client'

import { idle as coreIdle } from '@tanstack/start-client-core/hydration'
import { StrategyHydrate } from './visible'
import type { HydrationPrefetchStrategy } from '@tanstack/start-client-core/hydration'
import type { ReactHydrationStrategy } from '../Hydrate'

/* @__NO_SIDE_EFFECTS__ */
export function idle(options?: {
  timeout?: number
}): ReactHydrationStrategy & HydrationPrefetchStrategy {
  return /* @__PURE__ */ Object.assign(coreIdle(options), {
    $$renderHydrate: StrategyHydrate,
  })
}
