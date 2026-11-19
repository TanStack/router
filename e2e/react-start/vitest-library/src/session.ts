import { createMiddleware } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

// A middleware in a file of its own, so that a test can replace it with
// `mockMiddleware` (see tests/account.server.test.ts).
export const sessionMiddleware = createMiddleware({ type: 'function' })
  .client(({ next }) => {
    // Stands for client code that needs a browser. A server test runs the
    // client function of a middleware first, as server rendering does.
    globalThis.__SESSION_CLIENT_MIDDLEWARE_RAN__ = true
    return next()
  })
  .server(({ next }) => {
    const user = getCookie('session')
    if (!user) {
      throw new Error('Not signed in')
    }
    return next({ context: { user } })
  })

declare global {
  var __SESSION_CLIENT_MIDDLEWARE_RAN__: boolean | undefined
}
