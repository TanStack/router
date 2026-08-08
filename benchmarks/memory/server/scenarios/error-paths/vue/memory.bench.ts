import { registerIsolatedServerMemoryBenchmarks } from '#memory-server/isolated-benchmark'

registerIsolatedServerMemoryBenchmarks({
  names: [
    'mem server error-paths redirect (vue)',
    'mem server error-paths not-found (vue)',
    'mem server error-paths error (vue)',
    'mem server error-paths unmatched (vue)',
  ],
  setupUrl: new URL('./setup.ts', import.meta.url),
})
