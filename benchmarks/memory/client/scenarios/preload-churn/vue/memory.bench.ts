import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client preload-churn (vue)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
