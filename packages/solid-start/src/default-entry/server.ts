import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'
import type { Register } from '@tanstack/solid-start'
import type { RequestOptions } from '@tanstack/solid-start/server'

const fetch = createStartHandler(defaultStreamHandler)

export type ServerEntry = {
  fetch: (
    request: Request,
    opts?: RequestOptions<Register>,
  ) => Promise<Response> | Response
}

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(request, opts) {
      return await entry.fetch(request, opts)
    },
  }
}

export default createServerEntry({ fetch })
