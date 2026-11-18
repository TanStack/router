// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMiddleware } from '@tanstack/start-client-core'
import { createStartHandler } from '../src/createStartHandler'
import {
  appendResponseHeader,
  clearResponseHeaders,
  createServerEntry,
  getRequest,
  getRequestHeader,
  getResponseHeader,
  handleStartError,
  removeResponseHeader,
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from '../src/request-response'

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
    throw new Error('These middleware responses do not render a router')
  },
}))

function createHandler() {
  return createStartHandler(() => new Response('unused'))
}

function request(marker: string, method = 'GET') {
  return new Request('http://localhost/', {
    method,
    headers: { 'x-request-marker': marker },
  })
}

function setRequestResponseState() {
  setResponseStatus(418, 'Example Error')
  setResponseHeader('x-response-marker', getRequestHeader('x-request-marker')!)
}

afterEach(() => {
  startMocks.requestMiddleware = []
})

describe('generic error response finalization', () => {
  it.each(['cookie', 'status', 'bodyless'] as const)(
    'includes %s helper writes made by a lazy error headers getter',
    async (effect) => {
      const error = Object.assign(new Error('refresh required'), {
        status: 401,
      })
      Object.defineProperty(error, 'headers', {
        get() {
          setCookie('refresh', 'value')
          if (effect === 'status') {
            setResponseStatus(429, 'Retry Later')
          } else if (effect === 'bodyless') {
            setResponseStatus(204)
          }
          return new Headers({ 'www-authenticate': 'Bearer' })
        },
      })
      startMocks.requestMiddleware = [
        createMiddleware().server(() => {
          throw error
        }),
      ]
      const entry = createServerEntry({ fetch: createHandler() })

      const response = await entry.fetch(request(effect))

      // A bodyless helper status does not describe the failure, so the
      // error's own status applies.
      const status = effect === 'status' ? 429 : 401
      expect(response.status).toBe(status)
      expect(response.headers.get('www-authenticate')).toBe('Bearer')
      expect(response.headers.getSetCookie()).toEqual(['refresh=value; Path=/'])
      expect(await response.json()).toMatchObject({
        status,
        statusText: effect === 'status' ? 'Retry Later' : '',
      })
    },
  )

  it('does not evaluate error statusText when a helper already supplies it', async () => {
    const error = Object.assign(new Error('handled'), { status: 409 })
    const statusText = vi.fn(() => {
      throw new Error('The overridden metadata must not be read')
    })
    Object.defineProperty(error, 'statusText', { get: statusText })
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        setResponseStatus(418, 'Helper Status')
        throw error
      }),
    ]
    const entry = createServerEntry({ fetch: createHandler() })

    const response = await entry.fetch(request('status text'))

    expect(statusText).not.toHaveBeenCalled()
    expect(response.status).toBe(418)
    expect(response.statusText).toBe('Helper Status')
    expect(await response.json()).toMatchObject({ statusText: 'Helper Status' })
  })

  it('includes synchronous helper writes made while reporting an error', async () => {
    const error = new Error('reported failure')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {
      setResponseStatus(503, 'Reported Failure')
      setCookie('reported', 'yes')
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        throw error
      }),
    ]
    const entry = createServerEntry({ fetch: createHandler() })

    try {
      const response = await entry.fetch(request('reporting'))

      expect(report).toHaveBeenCalledExactlyOnceWith(error)
      expect(response.status).toBe(503)
      expect(response.headers.getSetCookie()).toEqual(['reported=yes; Path=/'])
      expect(await response.json()).toMatchObject({
        status: 503,
        statusText: 'Reported Failure',
      })
    } finally {
      report.mockRestore()
    }
  })

  it.each(['clear', 'remove', 'empty'] as const)(
    'preserves the %s Content-Type helper operation on a generic error',
    async (operation) => {
      const errorHeaders = new Headers({
        'content-type': 'application/problem+json',
      })
      const error = Object.assign(new Error('private error message'), {
        status: 418,
        statusText: 'Teapot',
        headers: errorHeaders,
      })
      startMocks.requestMiddleware = [
        createMiddleware().server(() => {
          if (operation === 'clear') {
            clearResponseHeaders()
          } else if (operation === 'remove') {
            removeResponseHeader('content-type')
          } else {
            setResponseHeader('content-type', '')
          }
          setResponseHeader('x-response-marker', 'preserved')
          throw error
        }),
      ]
      const entry = createServerEntry({ fetch: createHandler() })

      const response = await entry.fetch(request(operation))

      expect(response.status).toBe(418)
      expect(response.statusText).toBe('Teapot')
      expect(response.headers.get('content-type')).toBe(
        operation === 'empty' ? '' : null,
      )
      expect(response.headers.get('x-response-marker')).toBe('preserved')
      expect(await response.json()).toEqual({
        status: 418,
        statusText: 'Teapot',
        unhandled: true,
        message: 'HTTPError',
      })
      expect(errorHeaders.get('content-type')).toBe('application/problem+json')
    },
  )

  it('applies helper appends once when a converted error returns through middleware', async () => {
    const error = Object.assign(new Error('handled'), {
      status: 409,
      headers: { vary: 'Accept-Encoding' },
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        expect(getResponseHeader('vary')).toBe(
          'Accept-Encoding, Origin, User-Agent',
        )
        return result
      }),
      createMiddleware().server(() => {
        appendResponseHeader('vary', 'Origin')
        const response = handleStartError(error)
        expect(getResponseHeader('vary')).toBe('Accept-Encoding, Origin')
        appendResponseHeader('vary', 'User-Agent')
        return response
      }),
    ]
    const entry = createServerEntry({ fetch: createHandler() })

    const response = await entry.fetch(request('appends'))

    expect(response.headers.get('vary')).toBe(
      'Accept-Encoding, Origin, User-Agent',
    )
    expect(await response.json()).toMatchObject({ status: 409 })
  })

  it.each([204, 205, 304])(
    'ignores bodyless helper status %i for an uncaught error',
    async (status) => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      startMocks.requestMiddleware = [
        createMiddleware().server(() => {
          setResponseStatus(status)
          setResponseHeader('x-response-marker', 'bodyless')
          throw new Error('bodyless failure')
        }),
      ]
      const entry = createServerEntry({ fetch: createHandler() })

      try {
        const response = await entry.fetch(request('bodyless'))

        expect(response.status).toBe(500)
        expect(response.headers.get('x-response-marker')).toBe('bodyless')
        expect(await response.json()).toMatchObject({ status: 500 })
        expect(consoleError).toHaveBeenCalledOnce()
      } finally {
        consoleError.mockRestore()
      }
    },
  )

  it('keeps shared error headers and cookies isolated from each invocation', async () => {
    const errorHeaders = new Headers([
      ['vary', 'Accept-Encoding'],
      ['set-cookie', 'session=original; Path=/'],
      ['set-cookie', 'independent=preserved; Path=/'],
    ])
    const error = Object.assign(new Error('shared failure'), {
      status: 409,
      headers: errorHeaders,
    })
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        const marker = getRequestHeader('x-request-marker')!
        appendResponseHeader('vary', marker)
        setCookie('session', marker, { path: '/' })
        throw error
      }),
    ]
    const entry = createServerEntry({ fetch: createHandler() })

    const responses = await Promise.all([
      entry.fetch(request('first')),
      entry.fetch(request('second')),
    ])

    for (const [index, marker] of ['first', 'second'].entries()) {
      const response = responses[index]!
      expect(response.headers.get('vary')).toBe(`Accept-Encoding, ${marker}`)
      expect(response.headers.getSetCookie()).toEqual([
        'independent=preserved; Path=/',
        `session=${marker}; Path=/`,
      ])
      expect(await response.json()).toMatchObject({ status: 409 })
    }
    expect(errorHeaders.get('vary')).toBe('Accept-Encoding')
    expect(errorHeaders.getSetCookie()).toEqual([
      'session=original; Path=/',
      'independent=preserved; Path=/',
    ])
  })
})

describe('server entry request ownership', () => {
  it.each(['GET', 'HEAD'])(
    'finalizes a primitive error in the %s request context',
    async (method) => {
      startMocks.requestMiddleware = [
        createMiddleware().server(() => {
          setRequestResponseState()
          throw 'example failure'
        }),
      ]
      const entry = createServerEntry({ fetch: createHandler() })

      const response = await entry.fetch(request('primitive', method))

      expect(response.status).toBe(418)
      expect(response.statusText).toBe('Example Error')
      expect(response.headers.get('x-response-marker')).toBe('primitive')
      if (method === 'HEAD') {
        expect(response.body).toBeNull()
      } else {
        expect(await response.json()).toMatchObject({ status: 418 })
      }
    },
  )

  it('preserves the original rejection from the raw Start handler', async () => {
    const error = new Error('example failure')
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        setRequestResponseState()
        throw error
      }),
    ]

    await expect(createHandler()(request('raw'))).rejects.toBe(error)
  })

  it('removes a thrown Response body for HEAD without a helper write', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const entry = createServerEntry({
      fetch() {
        throw new Response(body, { status: 400 })
      },
    })

    const response = await entry.fetch(request('response failure', 'HEAD'))

    expect(response.status).toBe(400)
    expect(response.body).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each(['handleStartError', 'rethrow'])(
    'keeps a reporting catch in the request context with %s',
    async (conversion) => {
      const error = new Error('example failure')
      startMocks.requestMiddleware = [
        createMiddleware().server(() => {
          setRequestResponseState()
          throw error
        }),
      ]
      const handler = createHandler()
      let caught: unknown
      let caughtRequest: Request | undefined
      const entry = createServerEntry({
        async fetch(input, opts) {
          setResponseHeader('x-entry-marker', 'entry')
          try {
            return await handler(input, opts)
          } catch (value) {
            caught = value
            caughtRequest = getRequest()
            if (conversion === 'rethrow') {
              throw value
            }
            return handleStartError(value)
          }
        },
      })
      const input = request('custom')

      const response = await entry.fetch(input)

      expect(caught).toBe(error)
      expect(caughtRequest).toBe(input)
      expect(response.status).toBe(418)
      expect(response.headers.get('x-entry-marker')).toBe('entry')
      expect(response.headers.get('x-response-marker')).toBe('custom')
    },
  )

  it('allows a custom catch to replace the response without Start helper state', async () => {
    const error = new Error('example failure')
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        setRequestResponseState()
        throw error
      }),
    ]
    const handler = createHandler()
    let caught: unknown
    const replacement = new Response('custom response', { status: 202 })
    const entry = createServerEntry({
      async fetch(input, opts) {
        try {
          return await handler(input, opts)
        } catch (value) {
          caught = value
          return replacement
        }
      },
    })

    const response = await entry.fetch(request('custom replacement'))

    expect(caught).toBe(error)
    expect(response).toBe(replacement)
    expect(response.status).toBe(202)
    expect(response.headers.get('x-response-marker')).toBeNull()
    expect(await response.text()).toBe('custom response')
  })

  it('finalizes each overlapping invocation in its own context', async () => {
    const error = new Error('shared example failure')
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        setRequestResponseState()
        throw error
      }),
    ]
    const handler = createHandler()
    let caughtCount = 0
    let release!: () => void
    const bothCaught = new Promise<void>((resolve) => {
      release = resolve
    })
    const entry = createServerEntry({
      async fetch(input, opts) {
        try {
          return await handler(input, opts)
        } catch (value) {
          caughtCount++
          if (caughtCount === 2) {
            release()
          }
          await bothCaught
          return handleStartError(value)
        }
      },
    })

    const responses = await Promise.all([
      entry.fetch(request('first')),
      entry.fetch(request('second')),
    ])

    expect(responses.map((response) => response.status)).toEqual([418, 418])
    expect(
      responses.map((response) => response.headers.get('x-response-marker')),
    ).toEqual(['first', 'second'])
  })

  it.each(['return', 'throw'])(
    'does not mutate a reusable bodyless Response when middleware uses %s',
    async (result) => {
      const source = new Response(null, {
        headers: { 'x-source-marker': 'source' },
      })
      startMocks.requestMiddleware = [
        createMiddleware().server(() => {
          setResponseHeader(
            'x-response-marker',
            getRequestHeader('x-request-marker')!,
          )
          if (result === 'throw') {
            throw source
          }
          return source
        }),
      ]
      const entry = createServerEntry({ fetch: createHandler() })

      const first = await entry.fetch(request('first'))
      const second = await entry.fetch(request('second'))

      expect(first.headers.get('x-response-marker')).toBe('first')
      expect(second.headers.get('x-response-marker')).toBe('second')
      expect(first.headers.get('x-source-marker')).toBe('source')
      expect(second.headers.get('x-source-marker')).toBe('source')
      expect(source.headers.get('x-response-marker')).toBeNull()
      expect(source.headers.get('x-source-marker')).toBe('source')
    },
  )

  it('isolates overlapping top-level entry invocations that reuse the same Request', async () => {
    let invocationCount = 0
    let release!: () => void
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve
    })
    const entry = createServerEntry({
      async fetch() {
        invocationCount++
        setResponseStatus(418)
        setResponseHeader('x-invocation-marker', String(invocationCount))
        if (invocationCount === 2) {
          release()
        }
        await bothStarted
        throw 'example failure'
      },
    })
    const input = request('shared input')

    const responses = await Promise.all([
      entry.fetch(input),
      entry.fetch(input),
    ])

    expect(responses.map((response) => response.status)).toEqual([418, 418])
    expect(
      responses.map((response) => response.headers.get('x-invocation-marker')),
    ).toEqual(['1', '2'])
  })

  it('restores the outer request context after a nested entry handles another request', async () => {
    startMocks.requestMiddleware = [
      createMiddleware().server(() => {
        setRequestResponseState()
        throw 'example failure'
      }),
    ]
    const handler = createHandler()
    const inner = createServerEntry({ fetch: handler })
    let innerResponse: Response | undefined
    let restoredRequest: Request | undefined
    const outer = createServerEntry({
      async fetch(input, opts) {
        setResponseHeader('x-outer-marker', 'outer')
        innerResponse = await inner.fetch(request('inner'))
        restoredRequest = getRequest()
        return handler(input, opts)
      },
    })
    const input = request('outer')

    const outerResponse = await outer.fetch(input)

    expect(restoredRequest).toBe(input)
    expect(innerResponse?.headers.get('x-response-marker')).toBe('inner')
    expect(innerResponse?.headers.get('x-outer-marker')).toBeNull()
    expect(outerResponse.headers.get('x-response-marker')).toBe('outer')
    expect(outerResponse.headers.get('x-outer-marker')).toBe('outer')
  })
})
