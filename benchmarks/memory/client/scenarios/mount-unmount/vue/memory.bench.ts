import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client mount-unmount (vue)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
