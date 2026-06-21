import { afterEach, describe, expect, test, vi } from 'vitest'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { createMemoryHistory, createRootRoute, createRouter } from '../src'

const reactDomServerMocks = vi.hoisted(() => ({
  renderToReadableStream: undefined as undefined | (() => unknown),
  renderToPipeableStream: vi.fn(),
}))

vi.mock('react-dom/server', () => ({
  default: reactDomServerMocks,
  ...reactDomServerMocks,
}))

const { renderRouterToStream } = await import('../src/ssr/renderRouterToStream')

afterEach(() => {
  reactDomServerMocks.renderToReadableStream = undefined
  reactDomServerMocks.renderToPipeableStream.mockReset()
  vi.restoreAllMocks()
})

async function buildRouter(ssr?: {
  isBot?: boolean | ((request: Request) => boolean)
}) {
  const rootRoute = createRootRoute({ component: () => null })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute,
    ...(ssr ? { ssr } : {}),
  })
  router.isServer = true
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  await router.serverSsr!.dehydrate()
  return router
}

async function expectBodyRejects(response: Response, message: string) {
  const reader = response.body!.getReader()
  await expect(
    (async () => {
      for (;;) {
        const { done } = await reader.read()
        if (done) return
      }
    })(),
  ).rejects.toThrow(message)
}

function unwrapResponse(
  result: Awaited<ReturnType<typeof renderRouterToStream>>,
) {
  return result.response
}

describe('renderRouterToStream - pipeable sync errors', () => {
  test('sync onError before pipeable is assigned still aborts pipeable', async () => {
    const abort = vi.fn()
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, opts) => {
        opts.onError(new Error('sync-react-error'), { componentStack: '' })
        return { abort, pipe: vi.fn() }
      },
    )

    const router = await buildRouter()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      expect(abort).toHaveBeenCalledOnce()
      await expectBodyRejects(response, 'sync-react-error')
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('sync non-Error onError before pipeable assignment still errors body', async () => {
    const abort = vi.fn()
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, opts) => {
        opts.onError('string-react-error', { componentStack: '' })
        return { abort, pipe: vi.fn() }
      },
    )

    const router = await buildRouter()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      expect(abort).toHaveBeenCalledOnce()
      await expectBodyRejects(response, 'string-react-error')
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('sync undefined onError before pipeable assignment still errors body', async () => {
    const abort = vi.fn()
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, opts) => {
        opts.onError(undefined, { componentStack: '' })
        return { abort, pipe: vi.fn() }
      },
    )

    const router = await buildRouter()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      expect(abort).toHaveBeenCalledOnce()
      await expectBodyRejects(response, 'SSR aborted')
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('undefined onError after response attach errors body', async () => {
    const abort = vi.fn()
    let onError!: (error: unknown, info: unknown) => void
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, opts) => {
        onError = opts.onError
        return { abort, pipe: vi.fn() }
      },
    )

    const router = await buildRouter()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      onError(undefined, { componentStack: '' })
      expect(abort).toHaveBeenCalledOnce()
      await expectBodyRejects(response, 'SSR aborted')
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('setup throw rejects instead of returning streamed 200', async () => {
    const setupError = new Error('setup-boom')
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(() => {
      throw setupError
    })

    const router = await buildRouter()
    const cleanup = vi.spyOn(router.serverSsr!, 'cleanup')
    const originalServerSsr = router.serverSsr!
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      ).rejects.toThrow('setup-boom')

      expect(cleanup).toHaveBeenCalledOnce()
    } finally {
      errorSpy.mockRestore()
      originalServerSsr.cleanup()
    }
  })

  test('request abort aborts pipeable and errors body', async () => {
    const abort = vi.fn()
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, opts) => {
        queueMicrotask(() => opts.onShellReady())
        return { abort, pipe: vi.fn() }
      },
    )

    const router = await buildRouter()
    const controller = new AbortController()
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/', {
            signal: controller.signal,
          }),
          router,
          responseHeaders: new Headers(),
          children: null,
        }),
      )

      controller.abort(new Error('request-gone'))
      const terminated = await Promise.race<true | false>([
        expectBodyRejects(response, 'request-gone').then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
      ])
      expect(terminated).toBe(true)
      expect(abort).toHaveBeenCalledOnce()
    } finally {
      router.serverSsr?.cleanup()
    }
  })
})

describe('renderRouterToStream - bot detection (ssr.isBot)', () => {
  const BOT_UA = 'Googlebot/2.1 (+http://www.google.com/bot.html)'
  const HUMAN_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

  function requestWith(headers: Record<string, string>) {
    return new Request('http://localhost/', { headers })
  }

  // Captures whether renderToPipeableStream was given `onAllReady` (bot, wait
  // for the full document) or `onShellReady` (stream the shell first).
  async function getStreamMode(
    router: Awaited<ReturnType<typeof buildRouter>>,
    request: Request,
  ): Promise<'allReady' | 'shellReady' | undefined> {
    let mode: 'allReady' | 'shellReady' | undefined
    reactDomServerMocks.renderToPipeableStream.mockImplementationOnce(
      (_children, opts) => {
        mode = opts.onAllReady ? 'allReady' : 'shellReady'
        queueMicrotask(() => (opts.onAllReady ?? opts.onShellReady)())
        return { abort: vi.fn(), pipe: vi.fn() }
      },
    )

    const result = await renderRouterToStream({
      request,
      router,
      responseHeaders: new Headers(),
      children: null,
    })
    try {
      return mode
    } finally {
      await unwrapResponse(result)
        .body?.cancel()
        .catch(() => {})
      router.serverSsr?.cleanup()
    }
  }

  test('default: bot User-Agent waits for allReady', async () => {
    const mode = await getStreamMode(
      await buildRouter(),
      requestWith({ 'user-agent': BOT_UA }),
    )
    expect(mode).toBe('allReady')
  })

  test('default: human User-Agent streams the shell', async () => {
    const mode = await getStreamMode(
      await buildRouter(),
      requestWith({ 'user-agent': HUMAN_UA }),
    )
    expect(mode).toBe('shellReady')
  })

  test('ssr.isBot=false: bot User-Agent still streams the shell', async () => {
    const mode = await getStreamMode(
      await buildRouter({ isBot: false }),
      requestWith({ 'user-agent': BOT_UA }),
    )
    expect(mode).toBe('shellReady')
  })

  test('ssr.isBot=true: human User-Agent waits for allReady', async () => {
    const mode = await getStreamMode(
      await buildRouter({ isBot: true }),
      requestWith({ 'user-agent': HUMAN_UA }),
    )
    expect(mode).toBe('allReady')
  })

  test('ssr.isBot predicate receives the request and controls the mode', async () => {
    const isBot = vi.fn(
      (request: Request) => request.headers.get('x-prerender') === '1',
    )
    const router = await buildRouter({ isBot })
    const request = requestWith({ 'user-agent': HUMAN_UA, 'x-prerender': '1' })

    const mode = await getStreamMode(router, request)

    expect(mode).toBe('allReady')
    expect(isBot).toHaveBeenCalledWith(request)
  })
})
