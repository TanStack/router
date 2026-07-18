import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/octane-start/server'
import type { Register } from '@tanstack/octane-router'
import type { RequestHandler } from '@tanstack/octane-start/server'

const fetch = createStartHandler(defaultStreamHandler)

export type ServerEntry = { fetch: RequestHandler<Register> }

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args)
    },
  }
}

export default createServerEntry({ fetch })
