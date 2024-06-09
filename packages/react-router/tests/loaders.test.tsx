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

const WAIT_TIME = 100

describe('loaders are being called', () => {
  test('loader is called on /', async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        mock('foo')
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = await act(() => createRouter({ routeTree }))

    await act(() => render(<RouterProvider router={router} />))

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(mock).toHaveBeenCalled()
  })

  test('loaders are called on /foo/bar', async () => {
    const mock1 = vi.fn()
    const mock2 = vi.fn()

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
        mock1('nested')
      },
    })
    const fooRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/foo',
      loader: async () => {
        await sleep(WAIT_TIME)
        mock2('foo')
      },
      component: () => <div>Nested Foo page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([fooRoute]),
      indexRoute,
    ])
    const router = await act(() => createRouter({ routeTree }))

    await act(() => render(<RouterProvider router={router} />))

    const linkToAbout = await screen.findByText('link to foo')
    await act(() => fireEvent.click(linkToAbout))

    const fooElement = await screen.findByText('Nested Foo page')
    expect(fooElement).toBeInTheDocument()

    expect(router.state.location.href).toBe('/nested/foo')
    expect(window.location.pathname).toBe('/nested/foo')

    expect(mock1).toHaveBeenCalled()
    expect(mock2).toHaveBeenCalled()
  })
})
