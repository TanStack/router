/** Route HMR: a failed lazy route component stays retryable after a save, on Rsbuild; shared rows. */
import {
  lazyRetrySuite,
  overlappingFailuresSuite,
} from './route-hmr-browser-lazy-retry-cases'

lazyRetrySuite('rsbuild')
overlappingFailuresSuite('rsbuild')
