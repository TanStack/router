import { describe, expect, it } from 'vitest'

import {
  getRequest,
  requestHandler,
  setResponseStatus,
} from '../src/request-response'

describe('setResponseStatus + throw preserves status code', () => {
  it('should preserve status code when handler throws an Error after setResponseStatus', async () => {
    const handler = requestHandler(async (_request: Request) => {
      setResponseStatus(401)
      throw new Error('Unauthorized')
    })

    const request = new Request('http://localhost/test')
    const response = await handler(request, {})

    expect(response.status).toBe(401)
  })

  it('should preserve status code when handler throws a bare Response after setResponseStatus', async () => {
    const handler = requestHandler(async (_request: Request) => {
      setResponseStatus(429, 'Too Many Requests')
      throw new Response('Rate limited')
    })

    const request = new Request('http://localhost/test')
    const response = await handler(request, {})

    expect(response.status).toBe(429)
  })

  it('should preserve status code when thrown Response already has same status', async () => {
    const handler = requestHandler(async (_request: Request) => {
      setResponseStatus(403)
      throw new Response('Forbidden', { status: 403 })
    })

    const request = new Request('http://localhost/test')
    const response = await handler(request, {})

    expect(response.status).toBe(403)
  })

  it('should transfer event status when handler returns non-Response value', async () => {
    const handler = requestHandler(async (_request: Request) => {
      setResponseStatus(204)
      return null as any
    })

    const request = new Request('http://localhost/test')
    const response = await handler(request, {})

    expect(response.status).toBe(204)
  })

  it('should return 500 when handler throws without setResponseStatus', async () => {
    const handler = requestHandler(async (_request: Request) => {
      throw new Error('unexpected failure')
    })

    const request = new Request('http://localhost/test')
    const response = await handler(request, {})

    expect(response.status).toBe(500)
  })
})

describe('requestHandler basic behavior', () => {
  it('should handle async handler returning a Response', async () => {
    const handler = requestHandler(async (_request: Request) => {
      return new Response('Hello', { status: 200 })
    })

    const request = new Request('http://localhost/test')
    const response = await handler(request, {})

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Hello')
  })

  it('should throw when accessing event outside requestHandler context', async () => {
    expect(() => getRequest()).toThrow(
      'No StartEvent found in AsyncLocalStorage',
    )
  })
})
