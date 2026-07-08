import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { descopeMiddleware } from './integrations/descope/middleware'

/**
 * Protect server functions (same-origin RPC endpoints) from cross-site
 * requests — without this, another site could make a logged-in visitor's
 * browser call them with the Descope session cookies attached.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

/**
 * Configure TanStack Start with the Descope request middleware, which validates
 * (and refreshes) the session on every server request and exposes the user via
 * the global start context.
 */
export const startInstance = createStart(() => {
  return {
    requestMiddleware: [csrfMiddleware, descopeMiddleware()],
  }
})
