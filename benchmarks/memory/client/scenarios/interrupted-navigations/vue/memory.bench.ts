import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client interrupted-navigations (vue)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
