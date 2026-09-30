import { describe, expect, it, vi } from 'vitest'
import {
  createCsrfMiddleware,
  csrfSymbol,
  getCsrfRequestValidationResult,
  isCsrfRequestAllowed,
} from '@tanstack/start-client-core'
import type { RequestServerOptions } from '@tanstack/start-client-core'
import type { Register } from '@tanstack/router-core'

const requestOrigin = 'https://app.example.com'

function trackHeaders(init: Record<string, string>) {
  const headers = new Map(
    Object.entries(init).map(([key, value]) => [key.toLowerCase(), value]),
  )
  const reads: Array<string> = []

  return {
    reads,
    request: {
      url: `${requestOrigin}/_serverFn/test`,
      headers: {
        get(name: string) {
          reads.push(name)
          return headers.get(name.toLowerCase()) ?? null
        },
      },
    } as Request,
  }
}

function createContext(init: {
  headers?: Record<string, string>
  handlerType?: 'serverFn' | 'router'
  origin?: string
}): RequestServerOptions<Register, undefined> {
  const { request } = trackHeaders(init.headers ?? {})
  return {
    request,
    pathname: new URL(request.url).pathname,
    context: undefined,
    next: (() => undefined) as any,
    handlerType: init.handlerType ?? 'serverFn',
  }
}

async function runMiddleware(
  middleware: ReturnType<typeof createCsrfMiddleware>,
  ctx: RequestServerOptions<Register, undefined>,
) {
  const next = vi.fn(() => ({ request: ctx.request, pathname: ctx.pathname }))
  const result = await middleware.options.server!({
    ...ctx,
    next,
  } as any)
  return { result, next }
}

describe('getCsrfRequestValidationResult', () => {
  it('allows same-origin fetch metadata without reading Origin or Referer', async () => {
    const { request, reads } = trackHeaders({
      'Sec-Fetch-Site': 'same-origin',
      Origin: 'https://evil.example.com',
      Referer: 'https://evil.example.com/path',
    })

    await expect(
      getCsrfRequestValidationResult({}, createContextFromRequest(request)),
    ).resolves.toBe(true)
    expect(reads).toEqual(['Sec-Fetch-Site'])
  })

  it.each(['same-site', 'cross-site', 'none', 'invalid'])(
    'rejects %s fetch metadata',
    async (fetchSite) => {
      const ctx = createContext({
        headers: {
          'Sec-Fetch-Site': fetchSite,
          Origin: requestOrigin,
          Referer: `${requestOrigin}/path`,
        },
      })

      await expect(getCsrfRequestValidationResult({}, ctx)).resolves.toBe(false)
    },
  )

  it('allows matching Origin without reading Referer', async () => {
    const { request, reads } = trackHeaders({
      Origin: requestOrigin,
      Referer: 'https://evil.example.com/path',
    })

    await expect(
      getCsrfRequestValidationResult({}, createContextFromRequest(request)),
    ).resolves.toBe(true)
    expect(reads).toEqual(['Sec-Fetch-Site', 'Origin'])
  })

  it('rejects mismatched Origin without reading Referer', async () => {
    const { request, reads } = trackHeaders({
      Origin: 'https://evil.example.com',
      Referer: `${requestOrigin}/path`,
    })

    await expect(
      getCsrfRequestValidationResult({}, createContextFromRequest(request)),
    ).resolves.toBe(false)
    expect(reads).toEqual(['Sec-Fetch-Site', 'Origin'])
  })

  it.each([
    requestOrigin,
    `${requestOrigin}/path`,
    `${requestOrigin}?query=1`,
    `${requestOrigin}#hash`,
  ])('allows same-origin Referer fallback: %s', async (referer) => {
    const ctx = createContext({ headers: { Referer: referer } })

    await expect(getCsrfRequestValidationResult({}, ctx)).resolves.toBe(true)
  })

  it.each([
    'https://evil.example.com/path',
    `${requestOrigin}.evil/path`,
    `${requestOrigin}:443/path`,
  ])('rejects cross-origin Referer fallback: %s', async (referer) => {
    const ctx = createContext({ headers: { Referer: referer } })

    await expect(getCsrfRequestValidationResult({}, ctx)).resolves.toBe(false)
  })

  it('returns undefined for requests without origin check headers', async () => {
    const ctx = createContext({})

    await expect(
      getCsrfRequestValidationResult({}, ctx),
    ).resolves.toBeUndefined()
  })

  it('rejects empty Referer header as known invalid origin check', async () => {
    const ctx = createContext({ headers: { Referer: '' } })

    await expect(getCsrfRequestValidationResult({}, ctx)).resolves.toBe(false)
  })

  it('rejects missing origin check headers by default', async () => {
    const ctx = createContext({})

    await expect(isCsrfRequestAllowed({}, ctx)).resolves.toBe(false)
  })

  it('allows missing origin check headers with the opt-in', async () => {
    const ctx = createContext({})

    await expect(
      isCsrfRequestAllowed({ allowRequestsWithoutOriginCheck: true }, ctx),
    ).resolves.toBe(true)
  })

  it('does not allow invalid origin check headers with the opt-in', async () => {
    const ctx = createContext({ headers: { 'Sec-Fetch-Site': 'cross-site' } })

    await expect(
      isCsrfRequestAllowed({ allowRequestsWithoutOriginCheck: true }, ctx),
    ).resolves.toBe(false)
  })

  it('uses custom origin matchers', async () => {
    const ctx = createContext({
      headers: { Origin: 'https://preview.example.com' },
    })

    await expect(
      getCsrfRequestValidationResult(
        { origin: ['https://app.example.com', 'https://preview.example.com'] },
        ctx,
      ),
    ).resolves.toBe(true)
  })

  it('uses custom Sec-Fetch-Site matchers', async () => {
    const ctx = createContext({ headers: { 'Sec-Fetch-Site': 'same-site' } })

    await expect(
      getCsrfRequestValidationResult(
        { secFetchSite: ['same-origin', 'same-site'] },
        ctx,
      ),
    ).resolves.toBe(true)
  })

  it('reads request URL origin only when needed', async () => {
    const getUrl = vi.fn(() => `${requestOrigin}/_serverFn/test`)
    const sameOriginFetch = createContext({
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    })
    Object.defineProperty(sameOriginFetch.request, 'url', { get: getUrl })

    await expect(
      getCsrfRequestValidationResult({}, sameOriginFetch),
    ).resolves.toBe(true)
    expect(getUrl).not.toHaveBeenCalled()

    const originFallback = createContext({
      headers: { Origin: requestOrigin },
    })
    Object.defineProperty(originFallback.request, 'url', { get: getUrl })

    await expect(
      getCsrfRequestValidationResult({}, originFallback),
    ).resolves.toBe(true)
    expect(getUrl).toHaveBeenCalledTimes(1)
  })
})

describe('createCsrfMiddleware', () => {
  it('marks middleware with csrfSymbol in non-production environments', () => {
    const middleware = createCsrfMiddleware()

    expect(csrfSymbol in middleware).toBe(true)
  })

  it('protects router requests by default', async () => {
    const middleware = createCsrfMiddleware()
    const ctx = createContext({ handlerType: 'router' })

    const { result, next } = await runMiddleware(middleware, ctx)

    expect(next).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
  })

  it('protects server function requests by default', async () => {
    const middleware = createCsrfMiddleware()
    const ctx = createContext({ handlerType: 'serverFn' })

    const { result, next } = await runMiddleware(middleware, ctx)

    expect(next).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(403)
  })

  it('filters requests', async () => {
    const middleware = createCsrfMiddleware({ filter: () => false })
    const ctx = createContext({ handlerType: 'serverFn' })

    const { next } = await runMiddleware(middleware, ctx)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('can filter to server function requests', async () => {
    const middleware = createCsrfMiddleware({
      filter: (ctx) => ctx.handlerType === 'serverFn',
    })
    const ctx = createContext({ handlerType: 'router' })

    const { next } = await runMiddleware(middleware, ctx)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])(
    'waits for an async filter returning %s before validating',
    async (shouldValidate) => {
      let resolveFilter!: (result: boolean) => void
      const filterResult = new Promise<boolean>((resolve) => {
        resolveFilter = resolve
      })
      const matcher = vi.fn(() => false)
      const middleware = createCsrfMiddleware({
        filter: () => filterResult,
        secFetchSite: matcher,
      })
      const ctx = createContext({
        headers: { 'Sec-Fetch-Site': 'same-origin' },
      })
      const pending = runMiddleware(middleware, ctx)

      expect(matcher).not.toHaveBeenCalled()
      resolveFilter(shouldValidate)
      const { result, next } = await pending

      expect(matcher).toHaveBeenCalledTimes(shouldValidate ? 1 : 0)
      expect(next).toHaveBeenCalledTimes(shouldValidate ? 0 : 1)
      if (shouldValidate) {
        expect((result as Response).status).toBe(403)
      }
    },
  )

  it.each([
    ['secFetchSite', 'Sec-Fetch-Site', 'same-origin'],
    ['origin', 'Origin', requestOrigin],
    ['referer', 'Referer', `${requestOrigin}/path`],
  ] as const)(
    'awaits async %s matchers before continuing or rejecting',
    async (option, header, value) => {
      for (const allowed of [false, true]) {
        const matcher = vi.fn(async () => allowed)
        const middleware = createCsrfMiddleware({ [option]: matcher })
        const ctx = createContext({ headers: { [header]: value } })

        const { result, next } = await runMiddleware(middleware, ctx)

        expect(matcher).toHaveBeenCalledOnce()
        expect(matcher).toHaveBeenCalledWith(
          value,
          expect.objectContaining({ request: ctx.request }),
        )
        expect(next).toHaveBeenCalledTimes(allowed ? 1 : 0)
        if (!allowed) {
          expect((result as Response).status).toBe(403)
        }
      }
    },
  )

  it('matches a Referer origin with an async origin matcher', async () => {
    const matcher = vi.fn(async () => true)
    const middleware = createCsrfMiddleware({ origin: matcher })
    const ctx = createContext({
      headers: { Referer: `${requestOrigin}/path` },
    })

    const { next } = await runMiddleware(middleware, ctx)

    expect(matcher).toHaveBeenCalledWith(
      requestOrigin,
      expect.objectContaining({ request: ctx.request }),
    )
    expect(next).toHaveBeenCalledOnce()
  })

  it.each(['filter', 'secFetchSite', 'origin', 'referer', 'failureResponse'])(
    'rejects when a synchronous or async %s callback throws',
    async (option) => {
      const error = new Error('CSRF callback failed')
      const ctx = createContext({
        headers:
          option === 'secFetchSite'
            ? { 'Sec-Fetch-Site': 'same-origin' }
            : option === 'origin'
              ? { Origin: requestOrigin }
              : option === 'referer'
                ? { Referer: `${requestOrigin}/path` }
                : {},
      })

      for (const callback of [
        () => {
          throw error
        },
        () => Promise.reject(error),
      ]) {
        const middleware = createCsrfMiddleware({ [option]: callback })
        const next = vi.fn()
        // Synchronous callback errors must still become rejected promises.
        const result = middleware.options.server!({ ...ctx, next } as any)

        await expect(result).rejects.toBe(error)
        expect(next).not.toHaveBeenCalled()
      }
    },
  )

  it('uses custom failure responses', async () => {
    const middleware = createCsrfMiddleware({
      failureResponse: new Response('CSRF failed', { status: 419 }),
    })
    const ctx = createContext({ handlerType: 'serverFn' })

    const { result } = await runMiddleware(middleware, ctx)

    expect((result as Response).status).toBe(419)
    await expect((result as Response).text()).resolves.toBe('CSRF failed')
  })

  it('awaits custom failure response callbacks', async () => {
    const response = new Response('CSRF failed', { status: 419 })
    const failureResponse = vi.fn(async () => response)
    const middleware = createCsrfMiddleware({ failureResponse })
    const ctx = createContext({})

    const { result, next } = await runMiddleware(middleware, ctx)

    expect(failureResponse).toHaveBeenCalledWith(
      expect.objectContaining({ request: ctx.request }),
    )
    expect(result).toBe(response)
    expect(next).not.toHaveBeenCalled()
  })

  it('clones a configured failure response for every request', async () => {
    const failureResponse = new Response('CSRF failed', { status: 419 })
    const middleware = createCsrfMiddleware({ failureResponse })

    for (let i = 0; i < 2; i++) {
      const { result, next } = await runMiddleware(
        middleware,
        createContext({}),
      )

      expect(result).not.toBe(failureResponse)
      expect((result as Response).status).toBe(419)
      await expect((result as Response).text()).resolves.toBe('CSRF failed')
      expect(next).not.toHaveBeenCalled()
    }
    expect(failureResponse.bodyUsed).toBe(false)
  })
})

function createContextFromRequest(
  request: Request,
): RequestServerOptions<Register, undefined> {
  return {
    request,
    pathname: new URL(request.url).pathname,
    context: undefined,
    next: (() => undefined) as any,
    handlerType: 'serverFn',
  }
}
