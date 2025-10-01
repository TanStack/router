import { createMiddleware } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

interface AuthMiddlewareOptions {
  allowUnauthenticated?: boolean
}

interface AuthContext {
  session: { id: string } | null
}

export const createAuthMiddleware = (
  opts: AuthMiddlewareOptions = { allowUnauthenticated: false },
) =>
  createMiddleware({ type: 'function' }).server<AuthContext>(({ next }) => {
    const token = getCookie('session')
    if (!token) {
      if (!opts.allowUnauthenticated) {
        throw new Error('Unauthorized')
      }

      return next({
        context: {
          session: null,
        },
      })
    }

    // ... token validation should be here

    return next({
      context: {
        session: {
          id: (Math.random() * 1000).toString(),
        },
      },
    })
  })
