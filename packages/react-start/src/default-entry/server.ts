import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
// `Register` is read from `@tanstack/react-start` (the same module users augment
// with `server.requestContext`) rather than `@tanstack/react-router`. Once a
// `@tanstack/react-router` `Register` augmentation exists (e.g. the universal
// `router` registration in `router.tsx`), react-router's `Register` becomes a
// separately-merged interface that no longer sees the start augmentation. Reading
// it from `@tanstack/react-start` keeps `handler.fetch`'s context type aligned with
// the registered `server.requestContext` and with the server middleware chain.
import type { Register } from '@tanstack/react-start'
import type { RequestHandler } from '@tanstack/react-start/server'

const fetch = createStartHandler(defaultStreamHandler)

// Providing `RequestHandler` from `@tanstack/react-start/server` is required so that the output types don't import it from `@tanstack/start-server-core`
export type ServerEntry = { fetch: RequestHandler<Register> }

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args)
    },
  }
}

export default createServerEntry({ fetch })
