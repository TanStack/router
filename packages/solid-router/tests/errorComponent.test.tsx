import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'

import {
  Link,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
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

          render(() => <RouterProvider router={router} />)

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
            errorComponent: MyErrorComponent,
          })

          const routeTree = rootRoute.addChildren([indexRoute])

          const router = createRouter({
            routeTree,
            defaultPreload: options.preload,
          })

          render(() => <RouterProvider router={router} />)

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

describe('errorComponent is rendered when an Error is thrown in lifecycle methods', () => {
  test('an Error thrown in `context` renders errorComponent on navigate', async () => {
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
      context: () => {
        throw new Error('context error thrown')
      },
      component: function About() {
        return <div>About route content</div>
      },
      errorComponent: MyErrorComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })

    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const errorComponent = await screen.findByText(
      'Error: context error thrown',
      undefined,
      { timeout: 1500 },
    )
    await expect(screen.findByText('About route content')).rejects.toThrow()
    expect(errorComponent).toBeInTheDocument()
  })

  test('an Error thrown in `context` with invalidate renders errorComponent on navigate', async () => {
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
      context: {
        handler: () => {
          throw new Error('context invalidate error thrown')
        },
        revalidate: true,
      },
      component: function About() {
        return <div>About route content</div>
      },
      errorComponent: MyErrorComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })

    expect(linkToAbout).toBeInTheDocument()
    fireEvent.click(linkToAbout)

    const errorComponent = await screen.findByText(
      'Error: context invalidate error thrown',
      undefined,
      { timeout: 1500 },
    )
    await expect(screen.findByText('About route content')).rejects.toThrow()
    expect(errorComponent).toBeInTheDocument()
  })

  test('an Error thrown in `context` renders errorComponent on first load', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      context: () => {
        throw new Error('context error thrown')
      },
      component: function Home() {
        return <div>Index route content</div>
      },
      errorComponent: MyErrorComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const errorComponent = await screen.findByText(
      'Error: context error thrown',
      undefined,
      { timeout: 750 },
    )
    await expect(screen.findByText('Index route content')).rejects.toThrow()
    expect(errorComponent).toBeInTheDocument()
  })

  test('an Error thrown in `context` with invalidate renders errorComponent on first load', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      context: {
        handler: () => {
          throw new Error('context invalidate error thrown')
        },
        revalidate: true,
      },
      component: function Home() {
        return <div>Index route content</div>
      },
      errorComponent: MyErrorComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const errorComponent = await screen.findByText(
      'Error: context invalidate error thrown',
      undefined,
      { timeout: 750 },
    )
    await expect(screen.findByText('Index route content')).rejects.toThrow()
    expect(errorComponent).toBeInTheDocument()
  })

  test('an async Error thrown in `context` renders errorComponent', async () => {
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
      context: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        throw new Error('async context error')
      },
      component: function About() {
        return <div>About route content</div>
      },
      errorComponent: MyErrorComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    fireEvent.click(linkToAbout)

    const errorComponent = await screen.findByText(
      'Error: async context error',
      undefined,
      { timeout: 1500 },
    )
    expect(errorComponent).toBeInTheDocument()
  })

  test('an async Error thrown in `context` with invalidate renders errorComponent', async () => {
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
      context: {
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          throw new Error('async context invalidate error')
        },
        revalidate: true,
      },
      component: function About() {
        return <div>About route content</div>
      },
      errorComponent: MyErrorComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    fireEvent.click(linkToAbout)

    const errorComponent = await screen.findByText(
      'Error: async context invalidate error',
      undefined,
      { timeout: 1500 },
    )
    expect(errorComponent).toBeInTheDocument()
  })
})
