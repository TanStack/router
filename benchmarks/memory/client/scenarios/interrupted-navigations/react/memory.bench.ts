import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client interrupted-navigations (react)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
