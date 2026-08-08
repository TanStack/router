import { registerIsolatedServerMemoryBenchmarks } from '#memory-server/isolated-benchmark'

registerIsolatedServerMemoryBenchmarks({
  names: ['mem server request-churn (solid)'],
  setupUrl: new URL('./setup.ts', import.meta.url),
})
