import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createHydrationSerializer,
  getLocalHeaderScript,
} from '@solidjs/web/serialization'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  createSerializationAdapter,
} from '../src'
import type * as SolidWeb from 'solid-js/web'

const solidMocks = vi.hoisted(() => ({
  renderToStream: vi.fn(),
  pipeTo: vi.fn(),
}))

vi.mock('solid-js/web', async () => {
  const actual = await vi.importActual<typeof SolidWeb>('solid-js/web')
  return {
    ...actual,
    renderToStream: solidMocks.renderToStream,
  }
})

// Imported after mock so the wrapper picks up the mocked binding.
const { renderRouterToStream } = await import('../src/ssr/renderRouterToStream')

function unwrapResponse(
  result: Awaited<ReturnType<typeof renderRouterToStream>>,
) {
  return result.response
}

afterEach(() => {
  solidMocks.renderToStream.mockReset()
  solidMocks.pipeTo.mockReset()
  vi.restoreAllMocks()
  delete (window as any).$_TSR
  delete (window as any)._$HY
  delete (window as any).$R
})

async function buildRouter() {
  const rootRoute = createRootRoute({
    component: () => null,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute,
  })
  router.isServer = true
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  return router
}

function drainBody(response: Response) {
  const reader = response.body!.getReader()
  return (async () => {
    for (;;) {
      const { done } = await reader.read()
      if (done) return true
    }
  })().catch(() => true)
}

class Money {
  constructor(public readonly cents: number) {}

  format() {
    return `$${(this.cents / 100).toFixed(2)}`
  }
}

const moneyAdapter = createSerializationAdapter({
  key: 'Money',
  test: (value): value is Money => value instanceof Money,
  toSerializable: (value) => value.cents,
  fromSerializable: (cents: number) => new Money(cents),
})

function installPendingTsrBootstrap() {
  return ((window as any).$_TSR = {
    initialized: false,
    buffer: [] as Array<() => void>,
    p(script: () => void) {
      !this.initialized ? this.buffer.push(script) : script()
    },
  })
}

function installMoneyTransformer(tsr: {
  buffer: Array<() => void>
  t?: Map<string, (value: number) => Money>
}) {
  tsr.t = new Map([['Money', (cents: number) => new Money(cents)]])
  tsr.buffer.splice(0).forEach((script) => script())
}

async function getMoneyHydrationPayload() {
  solidMocks.pipeTo.mockImplementationOnce(
    async (writable: WritableStream<Uint8Array>) => {
      const writer = writable.getWriter()
      await writer.write(
        new TextEncoder().encode('<html><body>solid</body></html>'),
      )
      await writer.close()
    },
  )
  solidMocks.renderToStream.mockImplementationOnce(
    () => ({ pipeTo: solidMocks.pipeTo }) as any,
  )

  const router = await buildRouter()
  router.options.serializationAdapters = [moneyAdapter]
  const abortController = new AbortController()

  const response = unwrapResponse(
    await renderRouterToStream({
      request: new Request('http://localhost/', {
        signal: abortController.signal,
      }),
      router,
      responseHeaders: new Headers(),
      children: () => null,
    }),
  )

  const options = solidMocks.renderToStream.mock.calls[0]![1] as {
    plugins: Array<any>
    serializer?: typeof createHydrationSerializer
  }
  const payloads: Array<string> = []
  const serializer = (options.serializer ?? createHydrationSerializer)({
    plugins: options.plugins,
    scopeId: '',
    onData: (payload) => payloads.push(payload),
  })
  serializer.write('money', new Money(1234))
  serializer.flush()

  abortController.abort()
  await drainBody(response)
  router.serverSsr?.cleanup()

  return payloads.join(';')
}

function installSolidSerializationHeader() {
  new Function(getLocalHeaderScript(''))()
}

describe('renderRouterToStream - serialization adapters', () => {
  test('defers adapter payloads until hydration installs the transformer map', async () => {
    const payload = await getMoneyHydrationPayload()
    ;(window as any)._$HY = { r: {} }
    installSolidSerializationHeader()

    expect(() => new Function(payload)()).not.toThrow()

    const earlyTsr = (window as any).$_TSR
    expect(earlyTsr.buffer).toHaveLength(1)
    expect((window as any)._$HY.r.money).toBeUndefined()

    installMoneyTransformer(earlyTsr)
    expect((window as any)._$HY.r.money).toBeInstanceOf(Money)
    expect((window as any)._$HY.r.money.format()).toBe('$12.34')
    ;(window as any)._$HY = { r: {} }
    installSolidSerializationHeader()
    const pendingTsr = installPendingTsrBootstrap()

    expect(() => new Function(payload)()).not.toThrow()
    expect(pendingTsr.buffer).toHaveLength(1)
    expect((window as any)._$HY.r.money).toBeUndefined()

    installMoneyTransformer(pendingTsr)
    expect((window as any)._$HY.r.money).toBeInstanceOf(Money)
    expect((window as any)._$HY.r.money.format()).toBe('$12.34')
    ;(window as any)._$HY = { r: {} }
    installSolidSerializationHeader()
    const initializedTsr = installPendingTsrBootstrap()
    installMoneyTransformer(initializedTsr)
    initializedTsr.initialized = true

    expect(() => new Function(payload)()).not.toThrow()
    expect(initializedTsr.buffer).toHaveLength(0)
    expect((window as any)._$HY.r.money).toBeInstanceOf(Money)
    expect((window as any)._$HY.r.money.format()).toBe('$12.34')
  })

  test('uses Solid default serialization when adapters are not configured', async () => {
    const abortController = new AbortController()
    solidMocks.renderToStream.mockImplementationOnce(
      () => ({ pipeTo: () => Promise.resolve() }) as any,
    )
    const router = await buildRouter()

    const response = unwrapResponse(
      await renderRouterToStream({
        request: new Request('http://localhost/', {
          signal: abortController.signal,
        }),
        router,
        responseHeaders: new Headers(),
        children: () => null,
      }),
    )

    const options = solidMocks.renderToStream.mock.calls[0]![1]
    expect(options).not.toHaveProperty('serializer')
    expect(options.plugins).toBeUndefined()

    abortController.abort()
    await drainBody(response)
    router.serverSsr?.cleanup()
  })
})

describe('renderRouterToStream - bot abort', () => {
  test('request abort during bot wait terminates before rendering starts', async () => {
    const neverReady = new Promise<void>(() => {})
    solidMocks.pipeTo.mockImplementationOnce(
      (writable: WritableStream<Uint8Array>) => {
        const writer = writable.getWriter()
        return writer
          .write(new TextEncoder().encode('<html><body>solid</body></html>'))
          .catch(() => {})
      },
    )
    solidMocks.renderToStream.mockImplementationOnce(
      () =>
        ({
          then: neverReady.then.bind(neverReady),
          pipeTo: solidMocks.pipeTo,
        }) as any,
    )

    const router = await buildRouter()
    const abortController = new AbortController()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const responsePromise = renderRouterToStream({
        request: new Request('http://localhost/', {
          headers: { 'User-Agent': 'Googlebot' },
          signal: abortController.signal,
        }),
        router,
        responseHeaders: new Headers(),
        children: () => null,
      })

      await Promise.resolve()
      abortController.abort(new Error('client-gone'))

      const result = await Promise.race([
        responsePromise,
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
      ])

      expect(result).not.toBe(false)
      expect(solidMocks.pipeTo).not.toHaveBeenCalled()
      const response = unwrapResponse(result as Exclude<typeof result, false>)
      expect(response.body).not.toBeNull()

      const terminated = await Promise.race([
        drainBody(response),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
      ])

      expect(terminated).toBe(true)
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })

  test('pipeTo rejection aborts writer and terminates response stream', async () => {
    solidMocks.renderToStream.mockImplementationOnce(
      () =>
        ({
          pipeTo: () => Promise.reject(new Error('solid-pipe-failed')),
        }) as any,
    )

    const router = await buildRouter()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = unwrapResponse(
        await renderRouterToStream({
          request: new Request('http://localhost/'),
          router,
          responseHeaders: new Headers(),
          children: () => null,
        }),
      )

      const terminated = await Promise.race([
        drainBody(response),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
      ])

      expect(terminated).toBe(true)
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      router.serverSsr?.cleanup()
    }
  })
})
