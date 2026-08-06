import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client loader-data-retention (vue)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
