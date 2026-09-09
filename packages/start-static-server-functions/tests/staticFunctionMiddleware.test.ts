import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { toJSONAsync } from 'seroval'

// `getDefaultSerovalPlugins` reads the Start options through an isomorphic
// function. Uncompiled, that chain resolves to its server implementation and
// wants a Start context in AsyncLocalStorage, which a browser never has. The
// adapter list is irrelevant to the cache lookup under test, so stub it out and
// serialize the fixtures the same way.
vi.mock('@tanstack/start-client-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/start-client-core')>()
  return { ...actual, getDefaultSerovalPlugins: () => [] }
})

const { staticFunctionMiddleware } =
  await import('../src/staticFunctionMiddleware')

const clientMiddleware = staticFunctionMiddleware.options.client!

/** The result the live server function produces when the cache is not used. */
const LIVE_RESULT = { result: 'from the server function' }

/**
 * Each test uses its own `data`, so it hashes to its own cache URL and cannot
 * be served by the module level client cache another test populated.
 */
function callClientMiddleware(data: unknown) {
  const next = vi.fn(async () => LIVE_RESULT)
  const promise = clientMiddleware({
    serverFnMeta: { id: 'test_fn' },
    data,
    context: {},
    next,
  } as any)
  return { promise, next }
}

function jsonResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** What the application's catch-all route serves for a missing cache file. */
function htmlShellResponse(status = 200) {
  return new Response('<!DOCTYPE html><html><body></body></html>', {
    status,
    headers: { 'content-type': 'text/html' },
  })
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('staticFunctionMiddleware client on a cache miss', () => {
  test('falls back to the server function when the HTML shell is served with a 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlShellResponse(200)),
    )

    const { promise, next } = callClientMiddleware({ case: 'html-200' })

    await expect(promise).resolves.toBe(LIVE_RESULT)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('falls back to the server function on a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlShellResponse(404)),
    )

    const { promise, next } = callClientMiddleware({ case: 'html-404' })

    await expect(promise).resolves.toBe(LIVE_RESULT)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('falls back to the server function when the body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('not json at all')),
    )

    const { promise, next } = callClientMiddleware({ case: 'bad-json' })

    await expect(promise).resolves.toBe(LIVE_RESULT)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('falls back to the server function when the payload is not a cached result', async () => {
    // Valid seroval, but for a plain string rather than a StaticCachedResult.
    // It decodes to a truthy value, so only a shape check can tell it apart
    // from a real hit.
    const payload = JSON.stringify(await toJSONAsync('not a cached result'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(payload)),
    )

    const { promise, next } = callClientMiddleware({ case: 'wrong-shape' })

    await expect(promise).resolves.toBe(LIVE_RESULT)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('falls back to the server function when the payload is missing context', async () => {
    const payload = JSON.stringify(await toJSONAsync({ result: 'partial' }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(payload)),
    )

    const { promise, next } = callClientMiddleware({ case: 'partial-shape' })

    await expect(promise).resolves.toBe(LIVE_RESULT)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('falls back to the server function when the request fails outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    const { promise, next } = callClientMiddleware({ case: 'network-error' })

    await expect(promise).resolves.toBe(LIVE_RESULT)
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('staticFunctionMiddleware client on a cache hit', () => {
  test('returns the prerendered result without calling the server function', async () => {
    const payload = JSON.stringify(
      await toJSONAsync({
        result: 'from the static cache',
        context: { user: 'sean' },
      }),
    )
    const fetchMock = vi.fn(async () => jsonResponse(payload))
    vi.stubGlobal('fetch', fetchMock)

    const first = callClientMiddleware({ case: 'hit' })
    await expect(first.promise).resolves.toMatchObject({
      result: 'from the static cache',
      context: { user: 'sean' },
    })
    expect(first.next).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // The same call is served from the client cache rather than refetched.
    const second = callClientMiddleware({ case: 'hit' })
    await expect(second.promise).resolves.toMatchObject({
      result: 'from the static cache',
    })
    expect(second.next).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('staticFunctionMiddleware client outside production', () => {
  test('does not request the cache at all', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const fetchMock = vi.fn(async () => jsonResponse('{}'))
    vi.stubGlobal('fetch', fetchMock)

    const { promise, next } = callClientMiddleware({ case: 'development' })

    await expect(promise).resolves.toBe(LIVE_RESULT)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
