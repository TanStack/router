import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import type { RequestHandler } from '@tanstack/react-start/server'

import { createRouter } from '#tanstack-start-router-entry'

// Providing `RequestHandler` from `@tanstack/react-start/server` is required so that the output types don't import it from `@tanstack/start-server-core`
const fetch: RequestHandler = createStartHandler({
  createRouter,
})(defaultStreamHandler)

export default {
  fetch,
}
