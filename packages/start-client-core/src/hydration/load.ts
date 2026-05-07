import type { HydrationPrefetchStrategy, HydrationStrategy } from './types'

const loadType = 'load'

const loadStrategy: HydrationStrategy & HydrationPrefetchStrategy = {
  type: loadType,
  key: loadType,
  shouldDefer: () => false,
  setupPrefetch: ({ prefetch }) => {
    prefetch()
  },
}

/* @__NO_SIDE_EFFECTS__ */
export function load(): HydrationStrategy & HydrationPrefetchStrategy {
  return loadStrategy
}
