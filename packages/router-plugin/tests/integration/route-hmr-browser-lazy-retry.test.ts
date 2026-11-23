/** Route HMR: a failed lazy route component stays retryable after a save, on Vite; shared rows. */
import { lazyRetrySuite } from './route-hmr-browser-lazy-retry-cases'

lazyRetrySuite('vite')
