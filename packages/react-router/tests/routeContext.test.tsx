import React, { act } from 'react'
import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
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
const SLEEP_MODIFIER = 1.5

describe('beforeLoad in the route definition', () => {
  configure({ reactStrictMode: true })

  // Present at the root route
  test('route context, present in the root route', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: ({ context }) => {
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
      beforeLoad: ({ context }) => {
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
      beforeLoad: ({ context }) => {
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
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
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await sleep(WAIT_TIME * (SLEEP_MODIFIER * 2))
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
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mock).toHaveBeenCalledOnce())
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
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([aboutRoute, indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
      loader: ({ context }) => {
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
      loader: ({ context }) => {
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([
      personRoute,
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
    expect(window.location.pathname).toBe('/person')
    expect(router.state.location.pathname).toBe('/person')

    expect(mock).toHaveBeenCalledWith({ foo: 'bar' })
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
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await sleep(WAIT_TIME * (SLEEP_MODIFIER * 2))
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
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([aboutRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
    })
    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([personRoute]),
      aboutRoute,
      indexRoute,
    ])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    await act(() => router.navigate({ to: '/about' }))

    await sleep(WAIT_TIME * SLEEP_MODIFIER)
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
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

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
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

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
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

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
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

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
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

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
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))
    await waitFor(() => expect(content).toBeInTheDocument())

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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    const linkToAbout = await screen.findByRole('link', {
      name: 'link to about',
    })
    expect(linkToAbout).toBeInTheDocument()
    await act(() => fireEvent.click(linkToAbout))

    const content = await screen.findByText(JSON.stringify({ foo: 'bar' }))
    await waitFor(() => expect(content).toBeInTheDocument())

    expect(router.state.location.href).toBe('/person')
    expect(window.location.pathname).toBe('/person')
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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

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
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

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
