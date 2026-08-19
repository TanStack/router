import { registerIsolatedServerMemoryBenchmarks } from '#memory-server/isolated-benchmark'

registerIsolatedServerMemoryBenchmarks({
  names: ['mem server server-fn-churn (vue)'],
  setupUrl: new URL('./setup.ts', import.meta.url),
})
