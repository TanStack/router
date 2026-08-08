import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client preload-churn (solid)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
