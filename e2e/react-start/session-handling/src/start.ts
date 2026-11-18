import { createMiddleware, createStart } from '@tanstack/react-start'
import { readSession } from './session'

export const sessionMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const session = await readSession()
    const scenario = request.headers.get('x-session-middleware')
    if (scenario === 'before') {
      session.middleware = 'before'
    }
    const result = await next({ context: { session } })
    if (scenario === 'after') {
      session.middleware = 'after'
    }
    if (scenario) {
      await session.save()
    }
    return result
  },
)

export const startInstance = createStart(() => ({}))
