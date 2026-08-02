// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  getResponseHeader,
  getResponseHeaders,
  requestHandler,
  setCookie,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
} from '../src/request-response'

describe('setResponseHeaders', () => {
  it('should set a single header via Headers object', async () => {
    const headers = new Headers()
    headers.set('X-Custom-Header', 'test-value')

    const handler = requestHandler(() => {
      setResponseHeaders(headers)
      const responseHeaders = getResponseHeaders()
      expect(responseHeaders.get('X-Custom-Header')).toBe('test-value')
      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it('should set multiple headers via Headers object', async () => {
    const headers = new Headers()
    headers.set('X-Custom-Header', 'test-value')
    headers.set('X-Another-Header', 'another-value')
    headers.set('Content-Type', 'application/json')

    const handler = requestHandler(() => {
      setResponseHeaders(headers)
      const responseHeaders = getResponseHeaders()
      expect(responseHeaders.get('X-Custom-Header')).toBe('test-value')
      expect(responseHeaders.get('X-Another-Header')).toBe('another-value')
      expect(responseHeaders.get('Content-Type')).toBe('application/json')
      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it('should handle empty Headers object', async () => {
    const handler = requestHandler(() => {
      const headers = new Headers()
      setResponseHeaders(headers)
      const responseHeaders = getResponseHeaders()
      expect(responseHeaders).toBeDefined()
      expect(Array.from(responseHeaders.entries()).length).toEqual(0)
      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it('should preserve the live response headers when passed back to itself', async () => {
    const cookies = ['session=abc123; Path=/', 'user=john; Path=/']
    const handler = requestHandler(() => {
      setResponseHeader('set-cookie', cookies)
      setResponseHeader('x-custom', 'keep')
      const headers = getResponseHeaders()
      const entries = Array.from(headers)

      setResponseHeaders(headers)

      expect(getResponseHeaders()).toBe(headers)
      expect(Array.from(headers)).toEqual(entries)
      expect(headers.getSetCookie()).toEqual(cookies)
      return new Response('OK')
    })

    const response = await handler(
      new Request('http://localhost:3000/test'),
      {},
    )
    expect(response.headers.getSetCookie()).toEqual(cookies)
    expect(response.headers.get('x-custom')).toBe('keep')
  })

  it('should replace existing headers with the same name', async () => {
    const handler = requestHandler(() => {
      setResponseHeaders(
        new Headers({
          'X-Custom-Header': 'old-value',
        }),
      )
      expect(getResponseHeader('X-Custom-Header')).toEqual('old-value')
      setResponseHeaders(
        new Headers({
          'X-Custom-Header': 'new-value',
        }),
      )
      expect(getResponseHeader('X-Custom-Header')).toEqual('new-value')

      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it('should handle multiple headers with the same name added via headers.append()', async () => {
    const headers = new Headers()
    headers.append('Set-Cookie', 'session=abc123; Path=/; HttpOnly')
    headers.append('Set-Cookie', 'user=john; Path=/; Secure')

    const handler = requestHandler(() => {
      setResponseHeaders(headers)

      // Set-Cookie values remain separate during Headers iteration.
      const setCookieValue = getResponseHeader('Set-Cookie')

      expect(setCookieValue).toBeDefined()

      // Both cookie values should be present in the result
      expect(setCookieValue).toContain('session=abc123')
      expect(setCookieValue).toContain('user=john')
      expect(getResponseHeaders().getSetCookie()).toEqual([
        'session=abc123; Path=/; HttpOnly',
        'user=john; Path=/; Secure',
      ])

      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })

  it.each(['constructor', '__proto__'])(
    'should replace the %s header',
    async (name) => {
      const handler = requestHandler(() => {
        setResponseHeader(name, 'old-value')
        setResponseHeaders(new Headers([[name, 'new-value']]))
        expect(getResponseHeader(name)).toBe('new-value')
        return new Response('OK')
      })

      await handler(new Request('http://localhost:3000/test'), {})
    },
  )

  it('should replace cookies on each call while preserving unrelated headers', async () => {
    const cookies = [
      'session=new; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/',
      'user=john; Path=/',
      'user=john; Path=/',
    ] as const
    const headers = new Headers([
      ['X-Last', 'last'],
      ['Set-Cookie', cookies[0]],
      ['X-First', 'first'],
      ['set-cookie', cookies[1]],
      ['SET-COOKIE', cookies[2]],
    ])
    const handler = requestHandler(() => {
      setResponseHeader('set-cookie', ['old=1', 'old=2'])
      setResponseHeader('x-keep', 'keep')
      setResponseHeaders(headers)

      expect(getResponseHeaders().getSetCookie()).toEqual(cookies)
      expect(headers.getSetCookie()).toEqual(cookies)
      expect(getResponseHeader('x-first')).toBe('first')
      expect(getResponseHeader('x-last')).toBe('last')
      expect(getResponseHeader('x-keep')).toBe('keep')

      setResponseHeaders(new Headers({ 'set-cookie': 'next=1' }))
      expect(getResponseHeaders().getSetCookie()).toEqual(['next=1'])
      expect(getResponseHeader('x-keep')).toBe('keep')

      setResponseHeaders(new Headers())
      expect(getResponseHeaders().getSetCookie()).toEqual(['next=1'])
      return new Response('OK')
    })

    const response = await handler(
      new Request('http://localhost:3000/test'),
      {},
    )
    expect(response.headers.getSetCookie()).toEqual(['next=1'])
    expect(response.headers.get('x-keep')).toBe('keep')
  })

  it('should replace combined values for ordinary headers', async () => {
    const handler = requestHandler(() => {
      setResponseHeader('x-custom', 'old-value')
      setResponseHeaders(
        new Headers([
          ['X-Custom', 'first'],
          ['x-custom', 'second'],
          ['x-empty', ''],
        ]),
      )
      expect(getResponseHeader('x-custom')).toBe('first, second')
      expect(getResponseHeaders().get('x-empty')).toBe('')
      return new Response('OK')
    })

    await handler(new Request('http://localhost:3000/test'), {})
  })
})

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
