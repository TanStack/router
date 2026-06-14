import { createLoaderCacheRuntime } from '../../shared.ts'

export {
  buildLoaderCachePayload,
  createItemLoaderDeps,
  createListLoaderDeps,
  normalizeConditionalSearch,
  normalizeListSearch,
  runLoaderCacheSelectorComputation,
} from '../../shared.ts'

export const loaderCacheRuntime = createLoaderCacheRuntime()
export const subscriberSlots = Array.from({ length: 5 }, (_, index) => index)
