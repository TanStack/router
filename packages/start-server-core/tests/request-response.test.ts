// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  getResponseHeaders,
  requestHandler,
  setCookie,
  setResponseStatus,
} from '../src/request-response'

function run(
  handler: () => Response | Promise<Response>,
): Promise<Response> | Response {
  return requestHandler(handler)(new Request('http://localhost/'), {})
}

describe('response context headers', () => {
  it('merges response context headers into a 2xx response', async () => {
    const response = await run(() => {
      getResponseHeaders().set('x-custom-header', 'true')
      return new Response('ok')
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('x-custom-header')).toBe('true')
  })

  it('merges response context headers into a non-2xx response', async () => {
    const response = await run(() => {
      getResponseHeaders().set('x-custom-header', 'true')
      setResponseStatus(401)
      return new Response('nope', { status: 401 })
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('x-custom-header')).toBe('true')
  })

  it('keeps the set-cookie headers of both the event and the response', async () => {
    const response = await run(() => {
      setCookie('from-event', 'a')
      return new Response('nope', {
        status: 500,
        headers: { 'set-cookie': 'from-response=b' },
      })
    })

    expect(response.headers.getSetCookie()).toEqual([
      'from-response=b',
      'from-event=a; Path=/',
    ])
  })

  it('merges response context headers into an immutable non-2xx response', async () => {
    const response = await run(() => {
      getResponseHeaders().set('x-custom-header', 'true')
      return Response.redirect('http://localhost/next', 302)
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://localhost/next')
    expect(response.headers.get('x-custom-header')).toBe('true')
  })

  it('lets the response context override a header set on the response', async () => {
    const response = await run(() => {
      getResponseHeaders().set('x-custom-header', 'from-event')
      return new Response('nope', {
        status: 404,
        headers: { 'x-custom-header': 'from-response' },
      })
    })

    expect(response.headers.get('x-custom-header')).toBe('from-event')
  })
})
