import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import { createControlledPromise } from '@tanstack/router-core'

import {
  Link,
  Outlet,
  RouterProvider,
  createLazyRoute,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

function MyErrorComponent(props: ErrorComponentProps) {
  const message =
    props.error instanceof Error ? props.error.message : String(props.error)

  return <div>Error: {message}</div>
}

async function asyncToThrowFn() {
  await new Promise((resolve) => setTimeout(resolve, 500))
  throw new Error('error thrown')
}

function throwFn() {
  throw new Error('error thrown')
}

afterEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe.each([true, false])(
  'with lazy errorComponent=%s',
  (isUsingLazyError) => {
    describe.each([{ preload: false }, { preload: 'intent' }] as const)(
      'errorComponent is rendered when the preload=$preload',
      (options) => {
        describe.each([true, false])('with async=%s', (isAsync) => {
          const throwableFn = isAsync ? asyncToThrowFn : throwFn

          const callers = [
            { caller: 'beforeLoad', testFn: throwableFn },
            { caller: 'loader', testFn: throwableFn },
          ]

          test.each(callers)(
            'an Error is thrown on navigate in the route $caller function',
            async ({ caller, testFn }) => {
              const rootRoute = createRootRoute()
              const indexRoute = createRoute({
                getParentRoute: () => rootRoute,
                path: '/',
                component: function Home() {
                  return (
                    <div>
                      <Link to="/about">link to about</Link>
                    </div>
                  )
                },
              })
              const aboutRoute = createRoute({
                getParentRoute: () => rootRoute,
                path: '/about',
                beforeLoad: caller === 'beforeLoad' ? testFn : undefined,
                loader: caller === 'loader' ? testFn : undefined,
                component: function Home() {
                  return <div>About route content</div>
                },
                errorComponent: isUsingLazyError ? undefined : MyErrorComponent,
              })

              if (isUsingLazyError) {
                aboutRoute.lazy(() =>
                  Promise.resolve(
                    createLazyRoute('/about')({
                      errorComponent: MyErrorComponent,
                    }),
                  ),
                )
              }

              const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

              const router = createRouter({
                routeTree,
                defaultPreload: options.preload,
              })

              render(<RouterProvider router={router} />)

              const linkToAbout = await screen.findByRole('link', {
                name: 'link to about',
              })

              expect(linkToAbout).toBeInTheDocument()
              fireEvent.mouseOver(linkToAbout)
              fireEvent.focus(linkToAbout)
              fireEvent.click(linkToAbout)

              const errorComponent = await screen.findByText(
                `Error: error thrown`,
                undefined,
                { timeout: 1500 },
              )
              await expect(
                screen.findByText('About route content'),
              ).rejects.toThrow()
              expect(errorComponent).toBeInTheDocument()
            },
          )

          test.each(callers)(
            'an Error is thrown on first load in the route $caller function',
            async ({ caller, testFn }) => {
              const rootRoute = createRootRoute()
              const indexRoute = createRoute({
                getParentRoute: () => rootRoute,
                path: '/',
                beforeLoad: caller === 'beforeLoad' ? testFn : undefined,
                loader: caller === 'loader' ? testFn : undefined,
                component: function Home() {
                  return <div>Index route content</div>
                },
                errorComponent: isUsingLazyError ? undefined : MyErrorComponent,
              })

              if (isUsingLazyError) {
                indexRoute.lazy(() =>
                  Promise.resolve(
                    createLazyRoute('/')({
                      errorComponent: MyErrorComponent,
                    }),
                  ),
                )
              }

              const routeTree = rootRoute.addChildren([indexRoute])

              const router = createRouter({
                routeTree,
                defaultPreload: options.preload,
              })

              render(<RouterProvider router={router} />)

              const errorComponent = await screen.findByText(
                `Error: error thrown`,
                undefined,
                { timeout: 750 },
              )
              await expect(
                screen.findByText('Index route content'),
              ).rejects.toThrow()
              expect(errorComponent).toBeInTheDocument()
            },
          )
        })
      },
    )
  },
)

test('global catch boundary resets when a background child generation recovers', async () => {
  const refresh = createControlledPromise<number>()
  let loaderCalls = 0
  const rootRoute = createRootRoute({ component: Outlet })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: {
      staleReloadMode: 'background',
      handler: () => (++loaderCalls === 1 ? 1 : refresh),
    },
    component: () => {
      const revision = childRoute.useLoaderData()
      if (revision.value === 1) {
        throw new Error('stale child render failed')
      }
      return <div>Recovered child revision {revision.value}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  render(<RouterProvider router={router} />)
  expect(
    await screen.findByText('stale child render failed'),
  ).toBeInTheDocument()

  const invalidation = router.invalidate()
  await vi.waitFor(() => expect(loaderCalls).toBe(2))
  expect(screen.getByText('stale child render failed')).toBeInTheDocument()
  expect(screen.queryByText(/Recovered child revision/)).not.toBeInTheDocument()
  refresh.resolve(2)
  await invalidation

  expect(
    await screen.findByText('Recovered child revision 2'),
  ).toBeInTheDocument()
  expect(
    screen.queryByText('stale child render failed'),
  ).not.toBeInTheDocument()
})

test('ancestor route errorComponent resets when a background child generation recovers', async () => {
  const refresh = createControlledPromise<number>()
  let loaderCalls = 0
  const rootRoute = createRootRoute({
    component: Outlet,
    errorComponent: ({ error }) => <div>Ancestor error: {error.message}</div>,
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: {
      staleReloadMode: 'background',
      handler: () => (++loaderCalls === 1 ? 1 : refresh),
    },
    component: () => {
      const revision = childRoute.useLoaderData()
      if (revision.value === 1) {
        throw new Error('stale child render failed')
      }
      return <div>Recovered child revision {revision.value}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  let invalidation: Promise<void> | undefined
  try {
    render(<RouterProvider router={router} />)
    expect(
      await screen.findByText('Ancestor error: stale child render failed'),
    ).toBeInTheDocument()

    invalidation = router.invalidate({
      filter: (match) => match.routeId === childRoute.id,
    })
    await vi.waitFor(() => expect(loaderCalls).toBe(2))
    expect(
      screen.getByText('Ancestor error: stale child render failed'),
    ).toBeInTheDocument()
    refresh.resolve(2)
    await invalidation

    expect(
      await screen.findByText('Recovered child revision 2'),
    ).toBeInTheDocument()
  } finally {
    refresh.resolve(2)
    if (invalidation) {
      await Promise.allSettled([invalidation])
    }
  }
})
