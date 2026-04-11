import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  Link,
  RouterProvider,
  createBrowserHistory,
  createLazyRoute,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { ErrorComponentProps, RouterHistory } from '../src'

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

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
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
                history,
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
                history,
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

    describe('stale route errors do not leak after navigation', () => {
      test.each([
        {
          caller: 'loader' as const,
          routeOptions: {
            loader: throwFn,
          },
        },
        {
          caller: 'render' as const,
          routeOptions: {
            component: function RenderErrorComponent() {
              throwFn()
            },
          },
        },
      ])(
        'navigating away from a $caller error does not call the next route errorComponent',
        async ({ routeOptions }) => {
          const rootRoute = createRootRoute()
          const indexErrorComponent = vi.fn(() => <div>Index error</div>)

          const indexRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: '/',
            component: function Home() {
              return (
                <div>
                  <div>Index route content</div>
                  <Link to="/about">link to about</Link>
                </div>
              )
            },
            errorComponent: indexErrorComponent,
          })

          const aboutRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: '/about',
            component: function About() {
              return <div>About route content</div>
            },
            errorComponent: isUsingLazyError ? undefined : MyErrorComponent,
            ...routeOptions,
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
            history,
          })

          render(<RouterProvider router={router} />)

          const linkToAbout = await screen.findByRole('link', {
            name: 'link to about',
          })

          await act(() => fireEvent.click(linkToAbout))

          expect(
            await screen.findByText('Error: error thrown', undefined, {
              timeout: 1500,
            }),
          ).toBeInTheDocument()

          await act(() => router.navigate({ to: '/' }))

          expect(
            await screen.findByText('Index route content'),
          ).toBeInTheDocument()
          expect(indexErrorComponent).not.toHaveBeenCalled()
        },
      )
    })
  },
)
