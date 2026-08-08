import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client navigation-churn (react)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
