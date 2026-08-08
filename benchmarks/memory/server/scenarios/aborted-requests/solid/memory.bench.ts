import { registerIsolatedServerMemoryBenchmarks } from '#memory-server/isolated-benchmark'

registerIsolatedServerMemoryBenchmarks({
  names: ['mem server aborted-requests (solid)'],
  setupUrl: new URL('./setup.ts', import.meta.url),
})
