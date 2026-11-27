import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { hydrate as hydrateRouter } from '@tanstack/router-core/ssr/client'
import {
  Outlet,
  RouterProvider,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '../src'
import { dehydrateToBootstrap } from './ssr-test-utils'
import type { AnyRoute } from '@tanstack/router-core'
import type { TsrSsrGlobal } from '@tanstack/router-core/ssr/client'

declare global {
  interface Window {
    $_TSR?: TsrSsrGlobal
  }
}

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  vi.restoreAllMocks()
  window.$_TSR = undefined
  document.body.innerHTML = ''
  sessionStorage.clear()
})

const Header = () => <header>Header</header>

const Page = Vue.defineComponent({
  setup() {
    const count = Vue.ref(0)
    return () => (
      <main>
        Page body
        <button onClick={() => count.value++}>{count.value}</button>
      </main>
    )
  },
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeRouter(
  configurePage: (pageRoute: AnyRoute) => AnyRoute,
  component?: any,
) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Header />
        <Outlet />
      </>
    ),
  })
  const pageRoute = configurePage(
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      component,
    }),
  )
  return createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })
}

async function renderOnServer() {
  const router = makeRouter(
    (route) => route,
    lazyRouteComponent(() => Promise.resolve({ default: Page })),
  )
  router.isServer = true
  testCleanups.push(() => router.serverSsr?.cleanup())
  window.$_TSR = await dehydrateToBootstrap(router)
  return renderToString(
    Vue.createSSRApp(
      Vue.defineComponent({
        setup: () => () => <RouterProvider router={router} />,
      }),
    ),
  )
}

function settleWithin(promise: Promise<void>, ms: number) {
  return Promise.race([
    promise.then(() => 'hydrated' as const),
    new Promise<'waiting'>((resolve) =>
      setTimeout(() => resolve('waiting'), ms),
    ),
  ])
}

function hydrateDocument(router: ReturnType<typeof makeRouter>, html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const app = Vue.createSSRApp(
    Vue.defineComponent({
      setup: () => () => <RouterProvider router={router} />,
    }),
  )
  app.mount(container)
  testCleanups.push(() => app.unmount())
  return {
    container,
    logs: () =>
      [consoleError.mock.calls, consoleWarn.mock.calls].flat(2).join(' '),
  }
}

describe('hydrating with route chunks still downloading', () => {
  test('keeps the server HTML while a code-split component chunk downloads', async () => {
    const serverHtml = await renderOnServer()
    const pageModule = deferred<{ default: typeof Page }>()
    const router = makeRouter(
      (route) => route,
      lazyRouteComponent(() => pageModule.promise),
    )

    expect(await settleWithin(hydrateRouter(router), 50)).toBe('hydrated')

    const { container, logs } = hydrateDocument(router, serverHtml)
    const main = container.querySelector('main')
    await Vue.nextTick()
    expect(container.innerHTML).toBe(serverHtml)

    pageModule.resolve({ default: Page })
    await pageModule.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.innerHTML).toBe(serverHtml)
    expect(container.querySelector('main')).toBe(main)
    expect(logs()).toBe('')

    container.querySelector('button')!.click()
    await Vue.nextTick()
    expect(container.querySelector('button')).toHaveTextContent('1')
  })

  test('waits only for lazy route options, not the component chunk they name', async () => {
    const serverHtml = await renderOnServer()
    const lazyOptions =
      deferred<ReturnType<ReturnType<typeof createLazyRoute>>>()
    const pageModule = deferred<{ default: typeof Page }>()
    const router = makeRouter((route) => route.lazy(() => lazyOptions.promise))

    const hydration = hydrateRouter(router)
    expect(await settleWithin(hydration, 50)).toBe('waiting')

    lazyOptions.resolve(
      createLazyRoute('/page')({
        component: lazyRouteComponent(() => pageModule.promise),
      }),
    )
    expect(await settleWithin(hydration, 50)).toBe('hydrated')

    const { container, logs } = hydrateDocument(router, serverHtml)
    await Vue.nextTick()
    expect(container.innerHTML).toBe(serverHtml)

    pageModule.resolve({ default: Page })
    await pageModule.promise
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.innerHTML).toBe(serverHtml)
    expect(logs()).toBe('')
  })

  test('reloads once and keeps the server HTML when the chunk is missing', async () => {
    const serverHtml = await renderOnServer()
    const pageModule = deferred<{ default: typeof Page }>()
    const router = makeRouter(
      (route) => route,
      lazyRouteComponent(() => pageModule.promise),
    )
    await hydrateRouter(router)

    const { container } = hydrateDocument(router, serverHtml)
    const message =
      'Failed to fetch dynamically imported module: /assets/page.js'
    pageModule.reject(new Error(message))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sessionStorage.getItem(`tanstack_router_reload:${message}`)).toBe(
      '1',
    )
    expect(container.innerHTML).toBe(serverHtml)
  })
})
