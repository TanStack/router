import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'
// `Register` is read from `@tanstack/solid-start` (the same module users augment
// with `server.requestContext`) rather than `@tanstack/solid-router`. Once a
// `@tanstack/solid-router` `Register` augmentation exists (e.g. the universal
// `router` registration in `router.tsx`), solid-router's `Register` becomes a
// separately-merged interface that no longer sees the start augmentation. Reading
// it from `@tanstack/solid-start` keeps `handler.fetch`'s context type aligned with
// the registered `server.requestContext` and with the server middleware chain.
import type { Register } from '@tanstack/solid-start'
import type { RequestHandler } from '@tanstack/solid-start/server'

const fetch = createStartHandler(defaultStreamHandler)

// Providing `RequestHandler` from `@tanstack/solid-start/server` is required so that the output types don't import it from `@tanstack/start-server-core`
export type ServerEntry = { fetch: RequestHandler<Register> }

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args)
    },
  }
}

export default createServerEntry({ fetch })
