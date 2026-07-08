import { createMiddleware } from '@tanstack/react-start'
import { DESCOPE_CONTEXT_KEY } from './server'
import { resolveSessionFromRequest } from './session.server'

/**
 * Request middleware that validates the Descope session once per request and
 * puts the resulting user on the global start context. Register it in
 * `src/start.ts`:
 *
 * ```ts
 * export const startInstance = createStart(() => ({
 *   requestMiddleware: [descopeMiddleware()],
 * }))
 * ```
 */
export const descopeMiddleware = () =>
  createMiddleware().server(async ({ next }) => {
    const user = await resolveSessionFromRequest()
    return next({ context: { [DESCOPE_CONTEXT_KEY]: user } })
  })
