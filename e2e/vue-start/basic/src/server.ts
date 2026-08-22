// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom server entry is working
import handler from '@tanstack/vue-start/server-entry'

console.log("[server-entry]: using custom server entry in 'src/server.ts'")

declare module '@tanstack/vue-start' {
  interface Register {
    server: {
      /**
       * This is just a test to make sure that the typing of the request context is working correctly in the custom server entry.
       */
      requestContext: {
        foo: string
      }
    }
  }
}

export default {
  fetch(request: Request) {
    return handler.fetch(request, { context: { foo: 'bar' } })
  },
}
