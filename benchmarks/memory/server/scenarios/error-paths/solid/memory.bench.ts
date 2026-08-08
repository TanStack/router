import { registerIsolatedServerMemoryBenchmarks } from '#memory-server/isolated-benchmark'

registerIsolatedServerMemoryBenchmarks({
  names: [
    'mem server error-paths redirect (solid)',
    'mem server error-paths not-found (solid)',
    'mem server error-paths error (solid)',
    'mem server error-paths unmatched (solid)',
  ],
  setupUrl: new URL('./setup.ts', import.meta.url),
})
