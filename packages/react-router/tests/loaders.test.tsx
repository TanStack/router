import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { z } from 'zod'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

import { sleep } from './utils'

afterEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

const WAIT_TIME = 100

describe('loaders are being called', () => {
  configure({ reactStrictMode: true })

  test('called on /', async () => {
    const indexLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        indexLoaderMock('foo')
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree })

    render(<RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(indexLoaderMock).toHaveBeenCalled()
  })

  test('both are called on /nested/foo', async () => {
    const nestedLoaderMock = vi.fn()
    const nestedFooLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/nested/foo">link to foo</Link>
          </div>
        )
      },
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      loader: async () => {
        await sleep(WAIT_TIME)
        nestedLoaderMock('nested')
      },
    })
    const fooRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/foo',
      loader: async () => {
        await sleep(WAIT_TIME)
        nestedFooLoaderMock('foo')
      },
      component: () => <div>Nested Foo page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([fooRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree })

    render(<RouterProvider router={router} />)

    const linkToAbout = await screen.findByText('link to foo')
    fireEvent.click(linkToAbout)

    const fooElement = await screen.findByText('Nested Foo page')
    expect(fooElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/foo')
    expect(window.location.pathname).toBe('/nested/foo')

    expect(nestedLoaderMock).toHaveBeenCalled()
    expect(nestedFooLoaderMock).toHaveBeenCalled()
  })
})

describe('loaders parentMatchPromise', () => {
  test('parentMatchPromise is defined in a child route', async () => {
    const nestedLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <div>
          Index page
          <Link to="/nested/foo">link to foo</Link>
        </div>
      ),
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      loader: async () => {
        await sleep(WAIT_TIME)
      },
      component: () => <Outlet />,
    })
    const fooRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/foo',
      loader: ({ parentMatchPromise }) => {
        nestedLoaderMock(parentMatchPromise)
      },
      component: () => <div>Nested Foo page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([fooRoute]),
      indexRoute,
    ])
    const router = createRouter({ routeTree })

    render(<RouterProvider router={router} />)

    const linkToFoo = await screen.findByRole('link', { name: 'link to foo' })

    expect(linkToFoo).toBeInTheDocument()

    fireEvent.click(linkToFoo)

    const fooElement = await screen.findByText('Nested Foo page')
    expect(fooElement).toBeInTheDocument()

    expect(nestedLoaderMock).toHaveBeenCalled()
    expect(nestedLoaderMock.mock.calls[0][0]).toBeInstanceOf(Promise)
  })
})

test('reproducer for #2031', async () => {
  const rootRoute = createRootRoute({
    beforeLoad: () => {
      console.log('beforeload called')
    },
  })

  const searchSchema = z.object({
    data: z.string().array().default([]),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index page</div>,

    validateSearch: searchSchema,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({ routeTree })

  render(<RouterProvider router={router} />)

  const indexElement = await screen.findByText('Index page')
  expect(indexElement).toBeInTheDocument()
})

test('reproducer for #2053', async () => {
  const rootRoute = createRootRoute({
    beforeLoad: () => {
      console.log('beforeload called')
    },
  })

  const fooRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/foo/$fooId',
    component: () => {
      const { fooId } = fooRoute.useParams()
      return <div>fooId: {fooId}</div>
    },
  })

  window.history.replaceState(null, 'root', '/foo/3ΚΑΠΠΑ')

  const routeTree = rootRoute.addChildren([fooRoute])

  const router = createRouter({
    routeTree,
  })

  render(<RouterProvider router={router} />)

  const fooElement = await screen.findByText('fooId: 3ΚΑΠΠΑ')
  expect(fooElement).toBeInTheDocument()
})
