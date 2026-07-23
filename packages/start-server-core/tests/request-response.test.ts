import { describe, expect, it } from 'vitest'
import {
  getResponseHeader,
  getResponseHeaders,
  requestHandler,
  setResponseHeaders,
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

  it('should replace existing headers with the same name', async () => {
    const headers = new Headers()
    headers.set('X-Custom-Header', 'old-value')

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

      // When multiple values are appended with the same header name,
      // headers.entries() returns separate entries for each value.
      // The implementation uses .set() for the first occurrence and .append() for
      // subsequent duplicates, preserving all values.
      // Note: getResponseHeader() uses .get() which returns comma-separated values.
      const setCookieValue = getResponseHeader('Set-Cookie')

      expect(setCookieValue).toBeDefined()

      // Both cookie values should be present in the result
      expect(setCookieValue).toContain('session=abc123')
      expect(setCookieValue).toContain('user=john')

      return new Response('OK')
    })

    const request = new Request('http://localhost:3000/test')
    await handler(request, {})
  })
})
