import type { HydrationStrategy } from './types'

const neverType = 'never'

const neverStrategy: HydrationStrategy<typeof neverType, false> = {
  _t: neverType,
  _d: () => true,
}

/* @__NO_SIDE_EFFECTS__ */
function neverHydrate(): HydrationStrategy<typeof neverType, false> {
  return neverStrategy
}

export { neverHydrate as never }
