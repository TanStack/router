import { registerIsolatedServerMemoryBenchmarks } from '#memory-server/isolated-benchmark'

registerIsolatedServerMemoryBenchmarks({
  names: [
    'mem server error-paths redirect (react)',
    'mem server error-paths not-found (react)',
    'mem server error-paths error (react)',
    'mem server error-paths unmatched (react)',
  ],
  setupUrl: new URL('./setup.ts', import.meta.url),
})
