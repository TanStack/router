import * as React from 'react'
import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import { hydrate } from '../src/ssr/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createControlledPromise,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { MockInstance } from 'vitest'
import type { AnyRouter, RouteComponent } from '../src'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  vi.restoreAllMocks()
  window.$_TSR = undefined
  document.body.innerHTML = ''
})

function Home() {
  return (
    <main>
      <Link to="/about" data-testid="content-link">
        about
      </Link>
    </main>
  )
}

function Footer() {
  return (
    <footer>
      <Link to="/about" data-testid="footer-link">
        about
      </Link>
    </footer>
  )
}

function makeRouteTree(opts: {
  Home: RouteComponent
  Footer?: RouteComponent
  aboutLoader?: () => Promise<void>
  homeSsr?: false
  homeLoader?: () => Promise<void>
}) {
  const { Home: HomeComponent, Footer: FooterComponent } = opts
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <nav>
          <Link to="/about" data-testid="header-link">
            About
          </Link>
        </nav>
        <Outlet />
        {FooterComponent ? (
          <React.Suspense fallback={null}>
            <FooterComponent />
          </React.Suspense>
        ) : null}
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    ssr: opts.homeSsr,
    loader: opts.homeLoader,
    component: HomeComponent,
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    loader: opts.aboutLoader,
    component: () => <div>About</div>,
  })
  return rootRoute.addChildren([indexRoute, aboutRoute])
}

async function renderServer(serverRouter: AnyRouter) {
  serverRouter.isServer = true
  await serverRouter.load()
  const html = renderToString(<RouterProvider router={serverRouter} />)
  expect(html).not.toContain('data-status')
  return html
}

async function hydrateClient(
  serverRouter: AnyRouter,
  clientRouter: AnyRouter,
  serverHtml: string,
) {
  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      dehydratedData: {},
      matches: serverRouter.stores.matches.get().map((match) => ({
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
  await hydrate(clientRouter)

  const container = document.createElement('div')
  container.innerHTML = serverHtml
  document.body.appendChild(container)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  let root!: ReturnType<typeof hydrateRoot>
  await act(async () => {
    root = hydrateRoot(container, <RouterProvider router={clientRouter} />)
    testCleanups.push(async () => {
      await act(() => root.unmount())
    })
    await Promise.resolve()
  })
  return { container, consoleError }
}

function hydrationMismatches(consoleError: MockInstance<typeof console.error>) {
  return consoleError.mock.calls.filter((call) =>
    call.map(String).join(' ').includes("didn't match"),
  )
}

test('a Link inside a late-hydrating boundary hydrates against the server location when a navigation is pending', async () => {
  const aboutLoader = createControlledPromise<void>()
  const serverRouter = createRouter({
    routeTree: makeRouteTree({ Home, aboutLoader: () => aboutLoader }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const serverHtml = await renderServer(serverRouter)

  // The route content is a lazy chunk so its Suspense boundary hydrates after
  // the shell, leaving a window in which the header link is interactive.
  const chunk = createControlledPromise<{ default: typeof Home }>()
  const clientRouter = createRouter({
    routeTree: makeRouteTree({
      Home: React.lazy(() => chunk),
      aboutLoader: () => aboutLoader,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const { container, consoleError } = await hydrateClient(
    serverRouter,
    clientRouter,
    serverHtml,
  )

  // Shell is hydrated, route content is still a dehydrated boundary.
  const headerLink = container.querySelector('[data-testid="header-link"]')!
  const contentLink = container.querySelector('[data-testid="content-link"]')!
  expect(headerLink).not.toHaveAttribute('data-status')
  expect(contentLink).not.toHaveAttribute('data-status')

  let navigation!: Promise<void>
  await act(async () => {
    navigation = clientRouter.navigate({ to: '/about' })
    await Promise.resolve()
  })
  expect(clientRouter.state.location.pathname).toBe('/about')
  expect(clientRouter.state.resolvedLocation?.pathname).toBe('/')
  expect(clientRouter.state.status).toBe('pending')
  expect(headerLink).toHaveAttribute('data-status', 'active')

  // Now the route content hydrates while the navigation is still pending.
  await act(async () => {
    chunk.resolve({ default: Home })
    await chunk
  })

  expect(hydrationMismatches(consoleError)).toEqual([])
  // After hydration the link follows the live location like the header link.
  expect(contentLink).toHaveAttribute('data-status', 'active')

  await act(async () => {
    aboutLoader.resolve()
    await navigation
  })
  expect(container).toHaveTextContent('About')
})

test('a Link inside a boundary that hydrates after a navigation committed still matches the server HTML', async () => {
  const serverRouter = createRouter({
    routeTree: makeRouteTree({ Home, Footer }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const serverHtml = await renderServer(serverRouter)

  // The footer lives in the root layout and is a lazy chunk, so its server
  // HTML survives the navigation and only hydrates once the chunk arrives.
  const chunk = createControlledPromise<{ default: typeof Footer }>()
  const clientRouter = createRouter({
    routeTree: makeRouteTree({ Home, Footer: React.lazy(() => chunk) }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const { container, consoleError } = await hydrateClient(
    serverRouter,
    clientRouter,
    serverHtml,
  )
  const footerLink = container.querySelector('[data-testid="footer-link"]')!
  expect(footerLink).not.toHaveAttribute('data-status')

  await act(async () => {
    await clientRouter.navigate({ to: '/about' })
  })
  expect(clientRouter.state.resolvedLocation?.pathname).toBe('/about')
  expect(container).toHaveTextContent('About')
  expect(footerLink).not.toHaveAttribute('data-status')

  await act(async () => {
    chunk.resolve({ default: Footer })
    await chunk
  })

  expect(hydrationMismatches(consoleError)).toEqual([])
  expect(footerLink).toHaveAttribute('data-status', 'active')
})

test('a Link inside a boundary that hydrates while the initial client load is still pending matches the server HTML', async () => {
  // An `ssr: false` route leaves `resolvedLocation` unset until its client
  // load commits, so the server-rendered location has to come from `hydrate()`.
  const homeLoader = createControlledPromise<void>()
  const aboutLoader = createControlledPromise<void>()
  const serverRouter = createRouter({
    routeTree: makeRouteTree({
      Home,
      Footer,
      homeSsr: false,
      homeLoader: () => homeLoader,
      aboutLoader: () => aboutLoader,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const serverHtml = await renderServer(serverRouter)
  expect(serverHtml).not.toContain('data-testid="content-link"')

  const chunk = createControlledPromise<{ default: typeof Footer }>()
  const clientRouter = createRouter({
    routeTree: makeRouteTree({
      Home,
      Footer: React.lazy(() => chunk),
      homeSsr: false,
      homeLoader: () => homeLoader,
      aboutLoader: () => aboutLoader,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const { container, consoleError } = await hydrateClient(
    serverRouter,
    clientRouter,
    serverHtml,
  )
  const footerLink = container.querySelector('[data-testid="footer-link"]')!
  expect(footerLink).not.toHaveAttribute('data-status')
  expect(clientRouter.state.status).toBe('pending')
  expect(clientRouter.state.resolvedLocation).toBeUndefined()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = clientRouter.navigate({ to: '/about' })
    await Promise.resolve()
  })
  expect(clientRouter.state.location.pathname).toBe('/about')
  expect(clientRouter.state.resolvedLocation).toBeUndefined()

  await act(async () => {
    chunk.resolve({ default: Footer })
    await chunk
  })

  expect(hydrationMismatches(consoleError)).toEqual([])
  expect(footerLink).toHaveAttribute('data-status', 'active')

  await act(async () => {
    aboutLoader.resolve()
    await navigation
  })
  expect(container).toHaveTextContent('About')
})
