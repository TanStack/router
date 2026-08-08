import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client navigation-churn (solid)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
