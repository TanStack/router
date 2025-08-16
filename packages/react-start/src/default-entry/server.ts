import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import type { RequestHandler } from '@tanstack/react-start/server'

import { createStart } from '#tanstack-start-createStart-entry'

// Providing `RequestHandler` from `@tanstack/react-start/server` is required so that the output types don't import it from `@tanstack/start-server-core`
const fetch: RequestHandler = createStartHandler({
  createStart,
})(defaultStreamHandler)

export default {
  fetch,
}
