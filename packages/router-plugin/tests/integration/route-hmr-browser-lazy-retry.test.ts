/** Route HMR: a failed lazy route component stays retryable after a save, on Vite; shared rows. */
import {
  lazyRetrySuite,
  overlappingFailuresSuite,
} from './route-hmr-browser-lazy-retry-cases'

lazyRetrySuite('vite')
overlappingFailuresSuite('vite')
