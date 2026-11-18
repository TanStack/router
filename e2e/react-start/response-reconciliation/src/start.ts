import { createMiddleware, createStart } from '@tanstack/react-start'
import {
  clearResponseHeaders,
  setCookie,
  getCookie,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
} from '@tanstack/react-start/server'
import { createUpstreamFailure } from './routes/api/-upstream'
import { installResponseWrapper } from './response-wrapper'

const globalResponseMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    if (request.headers.get('x-wrap-response') === 'true') {
      installResponseWrapper()
    }

    const scenario =
      request.headers.get('x-reconciliation-scenario') ||
      getCookie('reconciliation-scenario')

    if (scenario === 'issue-7647') {
      setResponseStatus(418)
      setResponseHeader('x-middleware-header', 'present')
      setResponseHeader('cache-control', 'no-store')
      return next()
    }

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

    if (scenario === 'global-upstream-cause') {
      throw new Error('Upstream failed', { cause: createUpstreamFailure() })
    }

    if (scenario === 'global-location-error') {
      throw Object.assign(new Error('Moved error'), {
        status: 302,
        headers: { location: '/api/base' },
      })
    }

    if (scenario === 'global-same-body-wrapper') {
      const result = await next()
      const wrapped = new Response(result.response.body, result.response)
      clearResponseHeaders()
      setResponseHeader('x-same-body-wrapper', 'yes')
      return { ...result, response: wrapped }
    }

    if (scenario === 'global-copy') {
      // Session middleware copies the response to add a header (#8627).
      const result = await next()
      const headers = new Headers(result.response.headers)
      headers.set('x-global-copy', 'yes')
      return {
        ...result,
        response: new Response(result.response.body, {
          status: result.response.status,
          statusText: result.response.statusText,
          headers,
        }),
      }
    }

    if (scenario === 'global-piped-copy') {
      const result = await next()
      const response = new Response(
        result.response.body!.pipeThrough(new TransformStream()),
        result.response,
      )
      response.headers.set('x-global-piped-copy', 'yes')
      return { ...result, response }
    }

    if (scenario === 'global-representation') {
      // Representation metadata computed from the body, as by ETag middleware.
      const result = await next()
      const body = await result.response.text()
      const response = new Response(body, result.response)
      response.headers.set('x-body-length', String(body.length))
      return { ...result, response }
    }

    if (scenario === 'global-assigned-transform-not-modified') {
      // Transform the body in place, then answer an ETag match instead.
      const result = await next()
      result.response = new Response(
        result.response.body!.pipeThrough(new TransformStream()),
        result.response,
      )
      return new Response(null, { status: 304 })
    }

    if (scenario === 'global-timeout') {
      // Keep working after next() while the handler the inner timeout
      // abandoned is still running.
      const result = await next()
      await sleep(400)
      return result
    }

    if (scenario === 'global-throw') {
      setResponseStatus(401, 'Unauthorized')
      setResponseHeader('x-global-error', 'yes')
      throw new Error('Unauthorized global middleware')
    }

    if (scenario === 'global-throw-string') {
      throw 'global string'
    }

    if (scenario === 'global-throw-response') {
      throw Response.json({ denied: true }, { status: 403 })
    }

    return next()
  },
)

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const globalTimeoutMiddleware = createMiddleware().server(
  ({ next, request }) => {
    const scenario =
      request.headers.get('x-reconciliation-scenario') ||
      getCookie('reconciliation-scenario')
    if (scenario !== 'global-timeout') {
      return next()
    }
    return Promise.race([
      next(),
      sleep(50).then(
        () =>
          new Response('timeout', {
            status: 504,
            headers: { 'x-timeout-fallback': 'yes' },
          }),
      ),
    ])
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [globalResponseMiddleware, globalTimeoutMiddleware],
}))
