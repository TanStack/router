import * as React from 'react'
import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import { hydrate } from '../src/ssr/client'
import {
  Outlet,
  RouterProvider,
  createLazyRoute,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '../src'
import type { RouteComponent } from '../src'
import type { AnyRoute, AnyRouter } from '@tanstack/router-core'
import type { TsrSsrGlobal } from '../src/ssr/client'

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
})

function Header() {
  return <header>Header</header>
}

function Page() {
  return <main>Page body</main>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function makeRootRoute() {
  return createRootRoute({
    component: () => (
      <>
        <Header />
        <Outlet />
      </>
    ),
  })
}

async function renderOnServer() {
  const rootRoute = makeRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })
  router.isServer = true
  await router.load()
  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      dehydratedData: {},
      matches: router.stores.matches.get().map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        u: match.updatedAt,
        s: match.status,
        l: match.loaderData,
        e: match.error,
        ssr: match.ssr,
      })),
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }
  return renderToString(<RouterProvider router={router} />)
}

function createClientRouter(
  configurePage: (pageRoute: AnyRoute) => AnyRoute,
  component?: RouteComponent,
) {
  const rootRoute = makeRootRoute()
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

function settleWithin(promise: Promise<void>, ms: number) {
  return Promise.race([
    promise.then(() => 'hydrated' as const),
    new Promise<'waiting'>((resolve) =>
      setTimeout(() => resolve('waiting'), ms),
    ),
  ])
}

async function hydrateDocument(router: AnyRouter, serverHtml: string) {
  const onRecoverableError = vi.fn()
  const container = document.createElement('div')
  container.innerHTML = serverHtml
  document.body.appendChild(container)
  await act(async () => {
    const root = hydrateRoot(container, <RouterProvider router={router} />, {
      onRecoverableError,
    })
    testCleanups.push(async () => {
      await act(() => root.unmount())
    })
  })
  return { container, onRecoverableError }
}

describe('hydrating with route chunks still downloading', () => {
  test('commits the matches before a code-split component chunk arrives', async () => {
    const serverHtml = await renderOnServer()
    const pageModule = deferred<{ default: typeof Page }>()
    const router = createClientRouter(
      (route) => route,
      lazyRouteComponent(() => pageModule.promise),
    )

    expect(await settleWithin(hydrate(router), 50)).toBe('hydrated')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/page',
    ])
    expect(router.state.status).toBe('idle')

    const { container, onRecoverableError } = await hydrateDocument(
      router,
      serverHtml,
    )
    expect(container.innerHTML).toBe(serverHtml)

    await act(async () => {
      pageModule.resolve({ default: Page })
      await pageModule.promise
    })
    expect(container.innerHTML).toBe(serverHtml)
    expect(container).toHaveTextContent('HeaderPage body')
    expect(onRecoverableError.mock.calls).toEqual([])
  })

  test('waits for lazy route options before committing the matches', async () => {
    const serverHtml = await renderOnServer()
    const lazyOptions =
      deferred<ReturnType<ReturnType<typeof createLazyRoute>>>()
    const router = createClientRouter((route) =>
      route.lazy(() => lazyOptions.promise),
    )

    const hydration = hydrate(router)
    expect(await settleWithin(hydration, 50)).toBe('waiting')
    expect(router.state.matches).toEqual([])

    lazyOptions.resolve(createLazyRoute('/page')({ component: Page }))
    expect(await settleWithin(hydration, 50)).toBe('hydrated')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/page',
    ])

    const { container, onRecoverableError } = await hydrateDocument(
      router,
      serverHtml,
    )
    expect(container.innerHTML).toBe(serverHtml)
    expect(onRecoverableError.mock.calls).toEqual([])
  })
})
