import { createMiddleware, createStart } from '@tanstack/react-start'
import { updateSession } from '@tanstack/react-start/server'
import { sessionConfig } from './session'

const sessionMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const scenario = request.headers.get('x-session-middleware')

    if (scenario === 'before') {
      await updateSession<Record<string, any>>(sessionConfig(), {
        middleware: 'before',
      })
      return next()
    }

    if (scenario === 'after') {
      const result = await next()
      await updateSession<Record<string, any>>(sessionConfig(), {
        middleware: 'after',
      })
      return result
    }

    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [sessionMiddleware],
}))
