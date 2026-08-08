import { registerIsolatedClientMemoryBenchmark } from '#memory-client/isolated-benchmark'

registerIsolatedClientMemoryBenchmark({
  name: 'mem client mount-unmount (solid)',
  setupUrl: new URL('./setup.ts', import.meta.url),
})
