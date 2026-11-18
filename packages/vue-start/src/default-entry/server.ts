import {
  createStartHandler,
  defaultStreamHandler,
  createServerEntry as createCoreServerEntry,
} from '@tanstack/vue-start/server'
import type { Register } from '@tanstack/vue-router'
import type { RequestHandler } from '@tanstack/vue-start/server'

const fetch = createStartHandler(defaultStreamHandler)

// Providing `RequestHandler` from `@tanstack/vue-start/server` is required so that the output types don't import it from `@tanstack/start-server-core`
export type ServerEntry = { fetch: RequestHandler<Register> }

// Bind the shared request context and fallback error handling to Vue's Register.
export const createServerEntry: (entry: ServerEntry) => ServerEntry =
  createCoreServerEntry<Register>

export default createServerEntry({ fetch })
