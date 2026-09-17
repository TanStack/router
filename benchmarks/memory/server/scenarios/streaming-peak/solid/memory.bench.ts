import { bench, describe } from 'vitest'
import { memoryBenchOptions } from '#memory-server/bench-utils'

// TODO(solid-router-v2): re-enable once router-core's SSR stream transformer
// supports Solid 2's streaming shape. Solid 2's renderToStream emits
// `</body></html>` at the end of the initial shell and streams deferred
// Loading-boundary HTML after it, so transformStreamWithRouter tail-buffers
// every deferred section and throws "SSR stream tail exceeded maximum buffer"
// (MAX_TAIL_CHARS = 64 kB) for this scenario's ~200 kB of deferred payload.
// React and Vue keep deferred chunks before `</body>`, which is what the
// transformer assumes.
describe('memory', () => {
  bench.skip('mem server streaming-peak (solid)', () => {}, memoryBenchOptions)
})
