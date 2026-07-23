import { createServerEntry } from '../src/default-entry/server'

declare module '@tanstack/octane-start' {
  interface Register {
    server: {
      requestContext: {
        requestId: string
      }
    }
  }
}

const entry = createServerEntry({
  async fetch(_request, options) {
    const requestId: string = options.context.requestId
    return new Response(requestId)
  },
})

entry.fetch(new Request('https://example.test'), {
  context: { requestId: 'request-1' },
})

// @ts-expect-error registered request context makes options mandatory
entry.fetch(new Request('https://example.test'))
