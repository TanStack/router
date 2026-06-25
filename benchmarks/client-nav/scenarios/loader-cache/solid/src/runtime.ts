import { createRenderEffect } from 'solid-js'
import { createLoaderCacheRuntime } from '../../shared.ts'

export {
  buildLoaderCachePayload,
  createItemLoaderDeps,
  createListLoaderDeps,
  loaderCacheSubscriberSlots as subscriberSlots,
  normalizeConditionalSearch,
  normalizeListSearch,
  runLoaderCacheSelectorComputation,
} from '../../shared.ts'

export const loaderCacheRuntime = createLoaderCacheRuntime()

export function PerfValue(props: { value: () => number }) {
  createRenderEffect(() => {
    void props.value()
  })

  return null
}
