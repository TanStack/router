import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'
import type { RequestHandler } from '@tanstack/solid-start/server'

// Providing `RequestHandler` from `@tanstack/solid-start/server` is required so that the output types don't import it from `@tanstack/solid-server-core`
const fetch: RequestHandler = createStartHandler(defaultStreamHandler)

export default {
  fetch,
}
