import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  Link,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../src'
import type { ErrorComponentProps } from '../src'

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
          fireEvent.focus(linkToAbout)
          fireEvent.click(linkToAbout)

          const errorComponent = await screen.findByText(
            `Error: error thrown`,
            undefined,
            { timeout: 1500 },
          )
          expect(screen.findByText('About route content')).rejects.toThrow()
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
          expect(screen.findByText('Index route content')).rejects.toThrow()
          expect(errorComponent).toBeInTheDocument()
        },
      )
    })
  },
)

describe('notFoundComponent is rendered when an error is thrown in params.parse', () => {
  test('displays notFoundComponent when error is thrown in params.parse', async () => {
    const rootRoute = createRootRoute({
      component: function Root() {
        return <div>Root</div>
      },
      notFoundComponent: function NotFound() {
        return <div>Not Found</div>
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: function Home() {
        return (
          <div>
            <Link to="/pizza/rotten">link to rotten pizza</Link>
          </div>
        )
      },
    })

    const pizzaRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/pizza/:pizzaType',
      component: function Pizza() {
        return <div>Pizza</div>
      },
      params: {
        parse: (p) => {
          if (p.pizzaType === 'rotten') {
            throw new Error('404 No rotten pizzas')
          }
          return { pizzaType: p.pizzaType }
        },
        stringify: (p) => ({ pizzaType: p.pizzaType }),
      },
      onError: () => {
        throw notFound()
      },
    })

    const routeTree = rootRoute.addChildren([indexRoute, pizzaRoute])

    const router = createRouter({
      routeTree,
    })

    render(<RouterProvider router={router} />)

    const linkToRottenPizza = await screen.findByRole('link', {
      name: 'link to rotten pizza',
    })

    expect(linkToRottenPizza).toBeInTheDocument()
    fireEvent.mouseOver(linkToRottenPizza)
    fireEvent.click(linkToRottenPizza)

    const notFoundComponent = await screen.findByText('Not Found', undefined, {
      timeout: 750,
    })
    expect(notFoundComponent).toBeInTheDocument()
  })
})
