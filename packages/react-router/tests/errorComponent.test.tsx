import React from 'react'
import { afterEach, describe, expect, it, test, vi } from 'vitest'
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import {
  type ErrorComponentProps,
  Link,
  Outlet,
  RouterProvider,
  createLink,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouteMask,
  createRouter,
  redirect,
  useLoaderData,
  useMatchRoute,
  useParams,
  useRouteContext,
  useSearch,
} from '../src'

function MyErrorComponent(props: ErrorComponentProps) {
  return <div>Error: {props.error.message}</div>
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
            errorComponent: MyErrorComponent,
          })

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
          fireEvent.click(linkToAbout)

          const errorComponent = await screen.findByText(
            `Error: error thrown`,
            undefined,
            { timeout: 750 },
          )
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
            errorComponent: MyErrorComponent,
          })

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
          expect(errorComponent).toBeInTheDocument()
        },
      )
    })
  },
)
