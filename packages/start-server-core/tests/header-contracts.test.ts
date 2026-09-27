// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMiddleware } from '@tanstack/start-client-core'
import {
  createStartHandler,
  transferResponseBodyOwnership,
} from '../src/createStartHandler'
import {
  appendResponseHeader,
  clearResponseHeaders,
  getRequestHost,
  getRequestUrl,
  getResponseHeader,
  getResponseHeaders,
  getResponseStatus,
  removeResponseHeader,
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from '../src/request-response'
import type { AnyRequestMiddleware } from '@tanstack/start-client-core'

const startMocks = vi.hoisted(() => ({
  requestMiddleware: [] as Array<unknown>,
}))
vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({
      requestMiddleware: startMocks.requestMiddleware,
      serializationAdapters: [],
    }),
  },
}))
vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => {
    throw new Error('The request middleware must handle the request')
  },
}))

function handler(...middleware: Array<AnyRequestMiddleware>) {
  startMocks.requestMiddleware = middleware
  return createStartHandler(() => {
    throw new Error('The request middleware must return a response')
  })
}

function returnedHeader(value = 'Accept-Encoding') {
  return createMiddleware().server(() => {
    return new Response(null, { headers: { vary: value } })
  })
}

afterEach(() => {
  startMocks.requestMiddleware = []
})

describe('response helpers through public Start request middleware', () => {
  it('keeps append intent when an invalid replacement value is caught', async () => {
    const app = handler(
      createMiddleware().server(({ next }) => {
        appendResponseHeader('vary', 'Origin')
        expect(() => setResponseHeader('vary', 'invalid\r\nvalue')).toThrow(
          TypeError,
        )
        return next()
      }),
      returnedHeader(),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin')
  })

  it('keeps removal intent when an invalid replacement value is caught', async () => {
    const app = handler(
      createMiddleware().server(({ next }) => {
        removeResponseHeader('vary')
        expect(() => setResponseHeader('vary', 'invalid\r\nvalue')).toThrow(
          TypeError,
        )
        return next()
      }),
      returnedHeader(),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.get('vary')).toBeNull()
  })

  it('keeps cookie merging when an invalid replacement value is caught', async () => {
    const app = handler(
      createMiddleware().server(({ next }) => {
        setCookie('helper', '1')
        expect(() =>
          setResponseHeader('set-cookie', 'invalid\r\nvalue'),
        ).toThrow(TypeError)
        return next()
      }),
      createMiddleware().server(() => {
        return new Response(null, {
          headers: { 'set-cookie': 'returned=2; Path=/' },
        })
      }),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.getSetCookie()).toEqual([
      'returned=2; Path=/',
      'helper=1; Path=/',
    ])
  })

  it('keeps an earlier cookie when an invalid serialized-cookie append is caught', async () => {
    const app = handler(
      createMiddleware().server(({ next }) => {
        appendResponseHeader('set-cookie', 'helper=1; Path=/')
        expect(() =>
          appendResponseHeader('set-cookie', 'helper=invalid\r\nvalue; Path=/'),
        ).toThrow(TypeError)
        return next()
      }),
      createMiddleware().server(() => {
        return new Response(null, {
          headers: { 'set-cookie': 'returned=2; Path=/' },
        })
      }),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.getSetCookie()).toEqual([
      'returned=2; Path=/',
      'helper=1; Path=/',
    ])
  })

  it('keeps cookie removal when an invalid serialized-cookie append is caught', async () => {
    const app = handler(
      createMiddleware().server(({ next }) => {
        removeResponseHeader('set-cookie')
        expect(() =>
          appendResponseHeader('set-cookie', 'helper=invalid\r\nvalue; Path=/'),
        ).toThrow(TypeError)
        return next()
      }),
      createMiddleware().server(() => {
        return new Response(null, {
          headers: { 'set-cookie': 'returned=2; Path=/' },
        })
      }),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it('does not retain a removal for an invalid header name after the error is caught', async () => {
    const app = handler(
      createMiddleware().server(({ next }) => {
        expect(() => removeResponseHeader('invalid name')).toThrow(TypeError)
        return next()
      }),
      returnedHeader(),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.status).toBe(200)
    expect(response.headers.get('vary')).toBe('Accept-Encoding')
  })

  it.each(['before', 'after'])(
    'appends to a returned header %s next without duplicating at outer boundaries',
    async (timing) => {
      const reads: Array<string | null | undefined> = []
      const app = handler(
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          reads.push(getResponseHeader('vary'))
          reads.push(getResponseHeaders().get('vary'))
          return result
        }),
        createMiddleware().server(async ({ next }) => {
          if (timing === 'before') {
            appendResponseHeader('vary', 'Origin')
          }
          const result = await next()
          if (timing === 'after') {
            appendResponseHeader('vary', 'Origin')
          }
          reads.push(getResponseHeader('vary'))
          reads.push(getResponseHeaders().get('vary'))
          return result
        }),
        returnedHeader(),
      )
      const response = await app(new Request('https://start.example/'), {})
      expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin')
      expect(reads).toEqual(Array(4).fill('Accept-Encoding, Origin'))
    },
  )

  it('preserves direct appends and only applies newly added helper values', async () => {
    const app = handler(
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        result.response.headers.append('vary', 'Accept-Language')
        appendResponseHeader('vary', 'User-Agent')
        expect(getResponseHeader('vary')).toBe(
          'Accept-Encoding, Origin, Accept-Language, User-Agent',
        )
        return result
      }),
      createMiddleware().server(({ next }) => {
        appendResponseHeader('vary', 'Origin')
        return next()
      }),
      returnedHeader(),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.get('vary')).toBe(
      'Accept-Encoding, Origin, Accept-Language, User-Agent',
    )
  })

  it('preserves helper writes when middleware transfers a piped response body', async () => {
    const app = handler(
      createMiddleware().server(async ({ next }) => {
        setResponseHeader('x-response-marker', 'helper')
        const result = await next()
        return transferResponseBodyOwnership(
          result.response,
          new Response(
            result.response.body!.pipeThrough(new TransformStream()),
            result.response,
          ),
        )
      }),
      createMiddleware().server(() => new Response('stream body')),
    )

    const response = await app(new Request('https://start.example/'), {})

    expect(response.headers.get('x-response-marker')).toBe('helper')
    expect(await response.text()).toBe('stream body')
  })

  it('applies append intent to a replacement response without copying its old base', async () => {
    const app = handler(
      createMiddleware().server(async ({ next }) => {
        await next()
        return new Response(null, { headers: { vary: 'Accept-Language' } })
      }),
      createMiddleware().server(({ next }) => {
        appendResponseHeader('vary', 'Origin')
        return next()
      }),
      returnedHeader(),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.get('vary')).toBe('Accept-Language, Origin')
  })

  it('treats application copies of materialized headers as explicit replacement input', async () => {
    const app = handler(
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        return new Response(null, { headers: result.response.headers })
      }),
      createMiddleware().server(({ next }) => {
        appendResponseHeader('vary', 'Origin')
        return next()
      }),
      returnedHeader(),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin, Origin')
  })

  it('keeps deliberate repeated values exactly once per helper append', async () => {
    const app = handler(
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        appendResponseHeader('vary', 'Origin')
        return result
      }),
      createMiddleware().server(({ next }) => {
        appendResponseHeader('vary', ['Origin', 'Origin'])
        return next()
      }),
      returnedHeader('Origin'),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.get('vary')).toBe('Origin, Origin, Origin, Origin')
  })

  it('preserves append ownership when a status change reconstructs a response', async () => {
    const app = handler(
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        setResponseStatus(201)
        return result
      }),
      createMiddleware().server(({ next }) => {
        appendResponseHeader('vary', 'Origin')
        return next()
      }),
      returnedHeader(),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.status).toBe(201)
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin')
  })

  it('applies an append once when stripping a HEAD response body', async () => {
    const app = handler(
      createMiddleware().server(({ next }) => {
        appendResponseHeader('vary', 'Origin')
        return next()
      }),
      returnedHeader(),
    )
    const response = await app(
      new Request('https://start.example/', { method: 'HEAD' }),
      {},
    )
    expect(response.body).toBeNull()
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin')
  })

  it('appends to immutable response headers once', async () => {
    const app = handler(
      createMiddleware().server(({ next }) => {
        appendResponseHeader('vary', 'Origin')
        return next()
      }),
      createMiddleware().server(() =>
        Response.redirect('https://start.example/login'),
      ),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.status).toBe(302)
    expect(response.headers.get('vary')).toBe('Origin')
    expect(response.headers.get('location')).toBe('https://start.example/login')
  })

  it.each(['set', 'remove', 'clear'])(
    'respects an explicit %s before a later append',
    async (operation) => {
      const app = handler(
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          if (operation === 'set') {
            setResponseHeader('vary', 'User-Agent')
          } else if (operation === 'remove') {
            removeResponseHeader('vary')
          } else {
            clearResponseHeaders()
          }
          appendResponseHeader('vary', 'Accept-Language')
          return result
        }),
        createMiddleware().server(({ next }) => {
          appendResponseHeader('vary', 'Origin')
          return next()
        }),
        returnedHeader(),
      )
      const response = await app(new Request('https://start.example/'), {})
      expect(response.headers.get('vary')).toBe(
        operation === 'set' ? 'User-Agent, Accept-Language' : 'Accept-Language',
      )
    },
  )

  it.each(['remove', 'clear'])(
    'keeps an append after %s before next across outer boundaries',
    async (operation) => {
      const reads: Array<string | null> = []
      const app = handler(
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          reads.push(result.response.headers.get('vary'))
          return result
        }),
        createMiddleware().server(async ({ next }) => {
          if (operation === 'remove') {
            removeResponseHeader('vary')
          } else {
            clearResponseHeaders()
          }
          appendResponseHeader('vary', 'Origin')
          const result = await next()
          reads.push(result.response.headers.get('vary'))
          return result
        }),
        returnedHeader(),
      )
      const response = await app(new Request('https://start.example/'), {})
      expect(reads).toEqual(['Origin', 'Origin'])
      expect(response.headers.get('vary')).toBe('Origin')
    },
  )

  it('reads the same merged cookie values from both response header getters', async () => {
    const reads: Array<string | null | undefined> = []
    const app = handler(
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        setCookie('helper', 'new')
        reads.push(getResponseHeader('set-cookie'))
        reads.push(getResponseHeaders().get('set-cookie'))
        return result
      }),
      createMiddleware().server(() => {
        return new Response(null, {
          headers: {
            'set-cookie':
              'returned=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/',
          },
        })
      }),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(response.headers.getSetCookie()).toEqual([
      'returned=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/',
      'helper=new; Path=/',
    ])
    expect(reads).toEqual(Array(2).fill(response.headers.get('set-cookie')))
  })

  it('reads the effective returned status before an explicit helper override', async () => {
    const statuses: Array<number> = []
    const app = handler(
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        statuses.push(getResponseStatus())
        setResponseStatus(202)
        statuses.push(getResponseStatus())
        return result
      }),
      createMiddleware().server(() => new Response(null, { status: 404 })),
    )
    const response = await app(new Request('https://start.example/'), {})
    expect(statuses).toEqual([404, 202])
    expect(response.status).toBe(202)
  })
})

describe('forwarded request URL helpers', () => {
  it.each([
    ['https://start.example:8443/path?search=1', {}],
    ['https://[::1]:8443/path?search=1', { 'x-forwarded-host': '' }],
  ])(
    'keeps the request URL host when proxy and Host headers are absent: %s',
    async (url, headers) => {
      const app = handler(
        createMiddleware().server(() =>
          Response.json({
            host: getRequestHost({ xForwardedHost: true }),
            url: getRequestUrl({ xForwardedHost: true }).href,
          }),
        ),
      )
      const response = await app(new Request(url, { headers }), {})
      expect(await response.json()).toEqual({ host: new URL(url).host, url })
    },
  )

  it('uses the first forwarded host and drops an internal port when no external port is provided', async () => {
    const app = handler(
      createMiddleware().server(() =>
        Response.json({
          url: getRequestUrl({ xForwardedHost: true }).href,
        }),
      ),
    )
    const response = await app(
      new Request('http://internal.example:3000/path', {
        headers: {
          host: 'origin.example:4000',
          'x-forwarded-host': 'public.example, proxy.example',
          'x-forwarded-proto': 'https',
        },
      }),
      {},
    )
    expect(await response.json()).toEqual({
      url: 'https://public.example/path',
    })
  })
})
