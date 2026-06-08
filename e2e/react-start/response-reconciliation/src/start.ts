import { createMiddleware, createStart } from '@tanstack/react-start'
import {
  setCookie,
  getCookie,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
} from '@tanstack/react-start/server'

const globalResponseMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const scenario =
      request.headers.get('x-reconciliation-scenario') ||
      getCookie('reconciliation-scenario')

    if (scenario === 'global-before') {
      setResponseHeaders(
        new Headers({
          'x-global-before': 'yes',
          'x-global-common': 'before',
        }),
      )
      setResponseStatus(231, 'global-before')
      return next()
    }

    if (scenario === 'global-after') {
      const result = await next()
      setResponseHeader('x-global-after', 'yes')
      setResponseHeader('x-global-common', 'after')
      setResponseStatus(232, 'global-after')
      return result
    }

    if (scenario === 'global-multiple-cookies') {
      setCookie('global-one', '1', { path: '/' })
      setCookie('global-two', '2', { path: '/' })
      return next()
    }

    if (scenario === 'global-throw') {
      setResponseStatus(401, 'Unauthorized')
      setResponseHeader('x-global-error', 'yes')
      throw new Error('Unauthorized global middleware')
    }

    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [globalResponseMiddleware],
}))
