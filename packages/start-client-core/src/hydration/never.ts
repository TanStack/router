import type { HydrationStrategy } from './types'

const neverType = 'never'

const neverStrategy: HydrationStrategy = {
  type: neverType,
  key: neverType,
  shouldDefer: () => true,
}

/* @__NO_SIDE_EFFECTS__ */
function neverHydrate(): HydrationStrategy {
  return neverStrategy
}

export { neverHydrate as never }
