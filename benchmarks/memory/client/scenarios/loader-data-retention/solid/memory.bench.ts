import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client loader-data-retention (solid)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
