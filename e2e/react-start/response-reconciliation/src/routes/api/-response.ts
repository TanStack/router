import { createMiddleware } from '@tanstack/react-start'
import {
  getResponseHeader,
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/react-start/server'

function getScenario(request: Request) {
  const url = new URL(request.url)
  return url.pathname.split('/').pop() || ''
}

export function baseResponse(scenario: string) {
  return new Response(scenario, {
    headers: { 'x-handler': scenario, 'x-base': 'yes' },
  })
}

export const routeBoundaryMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const scenario = getScenario(request)

    if (scenario === 'route-before-next') {
      setResponseHeader('x-route-before', 'yes')
      setResponseStatus(234, 'route-before')
      return next()
    }

    if (scenario === 'route-after-next') {
      const result = await next()
      setResponseHeader('x-route-after', 'yes')
      setResponseStatus(233, 'route-after')
      return result
    }

    if (scenario === 'direct-mutation-visible') {
      const result = await next()
      result.response.headers.set('x-direct-visible', 'yes')
      setResponseHeader(
        'x-direct-read',
        getResponseHeader('x-direct-visible') || 'missing',
      )
      return result
    }

    if (scenario === 'replace-after-direct-mutation') {
      const result = await next()
      result.response.headers.set('x-direct-a', 'yes')
      setResponseHeader('x-helper-delta', 'yes')
      return new Response('replacement', {
        status: 202,
        headers: { 'x-response-b': 'yes' },
      })
    }

    if (scenario === 'two-returned-responses') {
      await next()
      setResponseHeader('x-helper-after-a', 'yes')
      return new Response('response-b', {
        headers: { 'x-response-b': 'yes' },
      })
    }

    if (scenario === 'readonly-after-next') {
      const result = await next()
      setResponseHeader('x-readonly-after', 'yes')
      return result
    }

    return next()
  },
)

export const returnedResponseMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    if (getScenario(request) === 'two-returned-responses') {
      await next()
      return new Response('response-a', {
        headers: { 'x-response-a': 'yes' },
      })
    }

    return next()
  },
)
