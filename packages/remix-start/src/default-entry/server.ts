import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/remix-start/server'
import type { Register } from '@tanstack/remix-router'
import type { RequestHandler } from '@tanstack/remix-start/server'

const fetch = createStartHandler(defaultStreamHandler)

// Providing `RequestHandler` from `@tanstack/remix-start/server` is
// required so the output types don't import directly from
// `@tanstack/start-server-core`.
export type ServerEntry = { fetch: RequestHandler<Register> }

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args)
    },
  }
}

export default createServerEntry({ fetch })
export const startInstance = undefined
