import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouteContext,
  rootRouteId,
} from '../src'

import { sleep } from './utils'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

const WAIT_TIME = 150

describe('beforeLoad', () => {
  // Present at the root route
  test('sync route context, present in beforeLoad, root route', () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      beforeLoad: ({ context }) => {
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'bar' }))
  })

  test('async route context, present in beforeLoad, root route', () => {
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

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'bar' }))
  })

  // Present at the index route
  test('sync route context, present in beforeLoad, index route', () => {
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

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'bar' }))
  })

  test('async route context, present in beforeLoad, index route', () => {
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

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'bar' }))
  })

  // Check if context that is updated at the root, is the same in the index route
  test('modified route context, present in beforeLoad, index route', async () => {
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

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'sean' }))
  })
})

describe('loader', () => {
  // Present at the root route
  test('sync route context, present in loader, root route', () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({
      loader: ({ context }) => {
        mock(context)
      },
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'bar' }))
  })

  test('async route context, present in loader, root route', () => {
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

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'bar' }))
  })

  // Present at the index route
  test('sync route context, present in loader, index route', () => {
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

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'bar' }))
  })

  test('async route context, present in loader, index route', () => {
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

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'bar' }))
  })

  // Check if context that is updated at the root, is the same in the index route
  test('modified route context, present in loader, index route', async () => {
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

    waitFor(() => expect(mock).toHaveBeenCalledWith({ foo: 'sean' }))
  })
})

describe('useRouteContext', () => {
  // Present at the root route
  test('sync route context, present in component, root route', async () => {
    const rootRoute = createRootRoute({
      component: () => {
        const context = useRouteContext({ from: rootRouteId })
        return <div id="root-route-content">{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([])
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

    expect(content).toBeInTheDocument()
  })

  test('async route context beforeLoad, present in component, root route', async () => {
    const rootRoute = createRootRoute({
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = useRouteContext({ from: rootRouteId })
        return <div id="root-route-content">{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([])
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

    expect(content).toBeInTheDocument()
  })

  test('async route context loader, present in component, root route', async () => {
    const rootRoute = createRootRoute({
      loader: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = useRouteContext({ from: rootRouteId })
        return <div id="root-route-content">{JSON.stringify(context)}</div>
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
  test('sync route context, present in component, index route', async () => {
    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const context = useRouteContext({ from: rootRouteId })
        return <div id="index-route-content">{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

    expect(content).toBeInTheDocument()
  })

  test('async route context beforeLoad, present in component, index route', async () => {
    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = useRouteContext({ from: rootRouteId })
        return <div id="index-route-content">{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const ctx = { foo: 'bar' }
    const router = createRouter({ routeTree, context: ctx })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify(ctx))

    expect(content).toBeInTheDocument()
  })

  test('async route context loader, present in component, index route', async () => {
    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => {
        const context = useRouteContext({ from: rootRouteId })
        return <div id="index-route-content">{JSON.stringify(context)}</div>
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
  test('modified route context, present in component, root route', async () => {
    const rootRoute = createRootRoute({
      beforeLoad: async ({ context }) => {
        await sleep(WAIT_TIME)
        return {
          ...context,
          foo: 'sean',
        }
      },
      component: () => {
        const context = useRouteContext({ from: rootRouteId })
        return <div id="index-route-content">{JSON.stringify(context)}</div>
      },
    })

    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'sean' }))

    expect(content).toBeInTheDocument()
  })

  // Check if context that is updated at the root, is the same in the index route
  test('modified route context, present in component, index route', async () => {
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
        const context = useRouteContext({ from: rootRouteId })
        return <div id="index-route-content">{JSON.stringify(context)}</div>
      },
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, context: { foo: 'bar' } })

    render(<RouterProvider router={router} />)

    const content = await screen.findByText(JSON.stringify({ foo: 'sean' }))

    expect(content).toBeInTheDocument()
  })
})
