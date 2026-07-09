import { describe, expect, it } from 'vitest'
import { requestHandler, setCookie } from '../src/request-response'

// https://github.com/TanStack/router/issues/7755
describe('requestHandler set-cookie merging', () => {
  it('merges pending event cookies into a Response.redirect() without throwing', async () => {
    const handler = requestHandler(() => {
      setCookie('session', 'abc123')
      // Response.redirect() has immutable headers per spec
      return Response.redirect('https://example.com/next', 302)
    })

    const response = await handler(new Request('https://example.com/'), {})

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://example.com/next')
    expect(response.headers.getSetCookie()).toContain('session=abc123; Path=/')
  })

  it('still merges cookies into a mutable non-ok response', async () => {
    const handler = requestHandler(() => {
      setCookie('session', 'abc123')
      return new Response(null, {
        status: 302,
        headers: { location: '/next', 'set-cookie': 'from-response=1' },
      })
    })

    const response = await handler(new Request('https://example.com/'), {})

    expect(response.status).toBe(302)
    expect(response.headers.getSetCookie()).toEqual([
      'from-response=1',
      'session=abc123; Path=/',
    ])
  })
})
