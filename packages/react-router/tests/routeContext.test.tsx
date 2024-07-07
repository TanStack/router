import React, { act } from 'react'
import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'

import { sleep } from './utils'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

const WAIT_TIME = 150

describe('beforeLoad in the route definition', () => {
  configure({ reactStrictMode: true })

  // Present at the root route
  test('route context, present in the root route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: ({ context }) => {
        mock(context)
      },
      component: () => <div>Root page</div>,
    })
    const routeTree = rootRoute.addChildren([])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const rootElement = await screen.findByText('Root page')
    expect(rootElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('route context (sleep), present in the root route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Root page</div>,
    })
    const routeTree = rootRoute.addChildren([])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const rootElement = await screen.findByText('Root page')
    expect(rootElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Present at the index route
  test('route context, present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: ({ context }) => {
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('route context (sleep), present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context that is updated at the root, is the same in the index route
  test('modified route context, present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return {
          ...context,
          foo: 'sean',
        }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'sean' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context the context is available after a redirect on first-load
  test('on first-load, route context is present in the /about route after a redirect is thrown in the beforeLoad of the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')
    expect(router.state.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('on first-load, route context is present in the /about route after a redirect is thrown in the loader of the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')
    expect(router.state.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context the context is available after a redirect on navigate
  test('on navigate, route context is present in the /person route after a redirect is thrown in the beforeLoad of the /about route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('on navigate, route context is present in the /person route after a redirect is thrown in the loader of the /about route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // TODO: Move this test to the loader section
  test("on navigate (with preload using router methods), loader isn't invoked with undefined context if beforeLoad is pending when navigation happens", async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME) // Use a longer delay here
        return { mock }
      },
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        context.mock()
      },
    })

    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    await router.load()

    // Don't await, simulate user clicking before preload is done
    router.preloadRoute(aboutRoute)

    await router.navigate(aboutRoute)
    await router.invalidate()

    // Expect double call: once from preload, once from navigate
    expect(mock).toHaveBeenCalledTimes(2)
  })

  // TODO: Move this test to the loader section
  test("on navigate (with preload), loader isn't invoked with undefined context if beforeLoad is pending when navigation happens", async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME) // Use a longer delay here
        return { mock }
      },
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        context.mock()
      },
      component: () => <div>About page</div>,
    })

    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()

    // Don't await, simulate user clicking before preload is done
    linkToAbout.focus()
    linkToAbout.click()

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')

    // Expect double call: once from preload, once from navigate
    expect(mock).toHaveBeenCalledTimes(2)
  })

  // Check if context returned by /nested/about, is the same as its parent route /nested on navigate
  test('nested destination on navigate, route context in the /nested/about route is correctly inherited from the /nested parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/nested/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/about',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/about')
    expect(window.location.pathname).toBe('/nested/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by /nested/person route, is the same as its parent route /nested on navigate after a redirect /about
  test('nested destination on navigate, when a redirect is thrown in beforeLoad in /about, the /nested/person route context is correctly inherited from its parent /nested', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('nested destination on navigate, when a redirect is thrown in loader in /about, the /nested/person route context is correctly inherited from parent /nested', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (index route) on first-load
  test('_layout on first-load, route context in the index route is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (about route) on navigate
  test('_layout on navigate, route context in the /about route is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/about',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (about route) on after a redirect on navigate
  test('_layout on navigate, when a redirect is thrown in beforeLoad in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('_layout on navigate, when a redirect is thrown in loader in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })
})

describe('loader in the route definition', () => {
  configure({ reactStrictMode: true })

  // Present at the root route
  test('route context, present in the root route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      loader: ({ context }) => {
        mock(context)
      },
      component: () => <div>Root page</div>,
    })
    const routeTree = rootRoute.addChildren([])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const rootElement = await screen.findByText('Root page')
    expect(rootElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('route context (sleep), present in the root route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Root page</div>,
    })
    const routeTree = rootRoute.addChildren([])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const rootElement = await screen.findByText('Root page')
    expect(rootElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Present at the index route
  test('route context, present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: ({ context }) => {
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('route context (sleep), present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context that is updated at the root, is the same in the index route
  test('modified route context, present in the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return {
          ...context,
          foo: 'sean',
        }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(mock).toHaveBeenCalledWith({ foo: 'sean' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context the context is available after a redirect on first-load
  test('on first-load, route context is present in the /about route after a redirect is thrown in beforeLoad of the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')
    expect(router.state.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('on first-load, route context is present in the /about route after a redirect is thrown in loader of the index route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/about')
    expect(router.state.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context the context is available after a redirect on navigate
  test('on navigate, route context is present in the /person route after a redirect is thrown in the beforeLoad of the /about route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('on navigate, route context is present in the /person route after a redirect is thrown in the loader of the /about route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a /nested/about, is the same as its parent route /nested on navigate
  test('nested destination on navigate, route context in the /nested/about route is correctly inherited from the /nested parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/nested/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/about',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/about')
    expect(window.location.pathname).toBe('/nested/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a /nested/person route, is the same as its parent route /nested on navigate after a redirect /about
  test('nested destination on navigate, when a redirect is thrown in beforeLoad in /about, the /nested/person route context is correctly inherited from its parent /nested', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('nested destination on navigate, when a redirect is thrown in loader in /about, the /nested/person route context is correctly inherited from parent /nested', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'nested' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (index route) on first-load
  test('_layout on first-load, route context in the index route is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (about route) on navigate
  test('_layout on navigate, route context in the /about route is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/about',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  // Check if context returned by a layout route, is the same its child route (about route) on after a redirect on navigate
  test('_layout on navigate, when a redirect is thrown in beforeLoad in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('_layout on navigate, when a redirect is thrown in loader in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const navigate = indexRoute.useNavigate()
        return (
          <div>
            <h1>Index page</h1>
            <button
              onClick={() => {
                navigate({ to: '/about' })
              }}
            >
              button to about
            </button>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      loader: async ({ context }) => {
        await sleep(WAIT_TIME)
        mock(context)
      },
      component: () => <div>Person page</div>,
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const buttonToAbout = await screen.findByRole('button', {
      name: 'button to about',
    })
    expect(buttonToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(buttonToAbout))

    const personElement = await screen.findByText('Person page')
    expect(personElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar', layout: 'layout' })
    expect(mock).toHaveBeenCalledTimes(1)
  })
})

describe('useRouteContext in the component', () => {
  configure({ reactStrictMode: true })

  // Present at the root route
  test('route context, present in the root route', async () => {
    const rootRoute = createRootRoute({
      component: () => {
        const context = rootRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  test('route context (sleep in beforeLoad), present in the root route', async () => {
    const rootRoute = createRootRoute({
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = rootRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  test('route context (sleep in loader), present root route', async () => {
    const rootRoute = createRootRoute({
      loader: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = rootRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  // Present at the index route
  test('route context, present in the index route', async () => {
    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const context = indexRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  test('route context (sleep in beforeLoad), present in the index route', async () => {
    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = indexRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  test('route context (sleep in loader), present in the index route', async () => {
    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = indexRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(content).toBeInTheDocument()
  })

  // Check if context that is updated at the root, is the same in the root route
  test('modified route context, present in the root route', async () => {
    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return {
          ...context,
          foo: 'sean',
        }
      },
      component: () => {
        const context = rootRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })

    const routeTree = rootRoute.addChildren([])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'sean' }))

    expect(content).toBeInTheDocument()
  })

  // Check if the context that is updated at the root, is the same in the index route
  test('modified route context, present in the index route', async () => {
    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return {
          ...context,
          foo: 'sean',
        }
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const context = indexRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'sean' }))

    expect(content).toBeInTheDocument()
  })

  // Check if the context that is available after a redirect on first-load
  test('on first-load, route context is present in the /about route after a redirect is thrown in the beforeLoad of the index route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => {
        const context = aboutRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(content).toBeInTheDocument()
  })

  test('on first-load, route context is present in the /about route after a redirect is thrown in the loader of the index route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/about' })
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => {
        const context = aboutRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(content).toBeInTheDocument()
  })

  // Check if the context that is available after a redirect on navigate
  test('on navigate, route context is present in the /person route after a redirect is thrown in the beforeLoad of the /about route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))
    expect(content).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')
  })

  test('on navigate, route context is present in the /person route after a redirect is thrown in the loader of the /about route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const personRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))
    expect(content).toBeInTheDocument()

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')
  })

  // Check if context returned by /nested/about, is the same its parent /nested on navigate
  test('nested destination on navigate, route context in the /nested/about route is correctly inherited from its parent /nested', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/nested/about">link to about</Link>
          </div>
        )
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
      component: () => <Outlet />,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/about',
      component: () => {
        const context = aboutRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'nested' }),
    )

    expect(router.state.location.href).toBe('/nested/about')
    expect(window.location.pathname).toBe('/nested/about')

    expect(content).toBeInTheDocument()
  })

  // Check if context returned by a layout route, is the same its child route (about route) on after a redirect on navigate
  test('nested destination on navigate, when a redirect is thrown in beforeLoad in /about, the /nested/person route context is correctly inherited from its parent /nested', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
      component: () => <Outlet />,
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'nested' }),
    )

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(content).toBeInTheDocument()
  })

  test('nested destination on navigate, when a redirect is thrown in loader in /about, the /nested/person route context is correctly inherited from its parent /nested', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/nested/person' })
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'nested' }
      },
      component: () => <Outlet />,
    })
    const personRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'nested' }),
    )

    expect(router.state.location.href).toBe('/nested/person')
    expect(window.location.pathname).toBe('/nested/person')

    expect(content).toBeInTheDocument()
  })

  // Check if context returned by a layout route, is the same its child route (index route) on first-load
  test('_layout on first-load, route context in the index route is correctly inherited from the layout parent', async () => {
    const rootRoute = createRootRoute()
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
      component: () => <Outlet />,
    })
    const indexRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/',
      component: () => {
        const context = indexRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'layout' }),
    )

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(content).toBeInTheDocument()
  })

  // Check if context returned by a layout route, is the same its child route (about route) on navigate
  test('_layout on navigate, route context in the /about route is correctly inherited from the layout parent', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
      component: () => <Outlet />,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/about',
      component: () => {
        const context = aboutRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'layout' }),
    )

    expect(router.state.location.href).toBe('/about')
    expect(window.location.pathname).toBe('/about')

    expect(content).toBeInTheDocument()
  })

  // Check if context returned by a layout route, is the same its child route (about route) on after a redirect on navigate
  test('_layout on navigate, when a redirect is thrown in beforeLoad in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
      component: () => <Outlet />,
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'layout' }),
    )

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(content).toBeInTheDocument()
  })

  test('_layout on navigate, when a redirect is thrown in loader in /about, the /person route context is correctly inherited from the layout parent', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/about">link to about</Link>
          </div>
        )
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        await sleep(WAIT_TIME)
        throw redirect({ to: '/person' })
      },
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return { ...context, layout: 'layout' }
      },
      component: () => <Outlet />,
    })
    const personRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/person',
      component: () => {
        const context = personRoute.useRouteContext()
        return <div>{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = await act(() =>
      createRouter({ routeTree, context: { foo: 'bar' } }),
    )

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(
      JSON.stringify({ foo: 'bar', layout: 'layout' }),
    )

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')

    expect(content).toBeInTheDocument()
  })
})
