import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'
import type { Register } from '@tanstack/solid-router'
import type { RequestHandler } from '@tanstack/solid-start/server'

const fetch = createStartHandler(defaultStreamHandler)

export default {
  // Providing `RequestHandler` from `@tanstack/solid-start/server` is required so that the output types don't import it from `@tanstack/start-server-core`
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  fetch: fetch as RequestHandler<Register>,
}
