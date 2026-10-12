import { JSDOM, VirtualConsole } from 'jsdom'
import { ErrorBoundary, Suspense, createResource } from 'solid-js'
import { HydrationScript } from 'solid-js/web'
import { expect, test } from 'vitest'
import {
  attachRouterServerSsrUtils,
  renderRouterToStream,
  renderRouterToString,
} from '../../src/ssr/server'
import {
  RouterProvider,
  Scripts,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  createSerializationAdapter,
} from '../../src'

class Message {
  constructor(public text: string) {}
}

const messageAdapter = createSerializationAdapter({
  key: 'message',
  test: (value): value is Message => value instanceof Message,
  toSerializable: (value) => value.text,
  fromSerializable: (value) => new Message(value),
})

test.each([
  ['browser', 'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36', true],
  ['bot', 'Googlebot', true],
  ['without HydrationScript', 'Googlebot', false],
] as const)(
  'custom resource scripts wait for client initialization: %s',
  async (_name, userAgent, hydrationScript) => {
    const message = new Message(
      'こんにちは </script><script>throw "unexpected"</script>; $df("trap")',
    )
    function Resource() {
      const [data] = createResource(() =>
        Promise.resolve({ message, pattern: /;\$df\("trap"\);/ }),
      )
      return <p>{data()?.message.text}</p>
    }
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: createRootRoute({
        component: () => (
          <html>
            <head>{hydrationScript && <HydrationScript />}</head>
            <body>
              <Suspense fallback={<p>waiting</p>}>
                <Resource />
              </Suspense>
              <Scripts />
            </body>
          </html>
        ),
      }),
      isServer: true,
      ssr: { nonce: 'test-nonce' },
    })
    router.update({
      ...router.options,
      ...{ serializationAdapters: [messageAdapter] },
    })
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    await router.serverSsr!.dehydrate()
    const { response } = await renderRouterToStream({
      router,
      request: new Request('http://localhost/', {
        headers: { 'User-Agent': userAgent },
      }),
      responseHeaders: new Headers(),
      children: () => <RouterProvider router={router} />,
    })
    const errors: Array<Error> = []
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', (error) => errors.push(error))
    const dom = new JSDOM(await response.text(), {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      virtualConsole,
    })
    try {
      expect(dom.window.document.querySelector('p')?.textContent).toBe(
        message.text,
      )
      expect(errors).toEqual([])
    } finally {
      dom.window.close()
    }
  },
)

test('string renderer buffers custom errors emitted before Router bootstrap', async () => {
  class CustomError extends Error {}
  const adapter = createSerializationAdapter({
    key: 'custom-error',
    test: (value): value is CustomError => value instanceof CustomError,
    toSerializable: (value) => value.message,
    fromSerializable: (value) => new CustomError(value),
  })
  function Broken(): never {
    throw new CustomError('expected failure')
  }
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: createRootRoute({
      component: () => (
        <html>
          <head>
            <HydrationScript />
          </head>
          <body>
            <ErrorBoundary fallback={(error) => <p>{error.message}</p>}>
              <Broken />
            </ErrorBoundary>
            <Scripts />
          </body>
        </html>
      ),
    }),
    isServer: true,
  })
  router.update({ ...router.options, ...{ serializationAdapters: [adapter] } })
  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  await router.serverSsr!.dehydrate()
  const response = await renderRouterToString({
    router,
    responseHeaders: new Headers(),
    children: () => <RouterProvider router={router} />,
  })
  const errors: Array<Error> = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => errors.push(error))
  const dom = new JSDOM(await response.text(), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    virtualConsole,
  })
  try {
    expect(dom.window.document.querySelector('p')?.textContent).toBe(
      'expected failure',
    )
    expect(errors).toEqual([])
  } finally {
    dom.window.close()
  }
})
