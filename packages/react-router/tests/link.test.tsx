// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import * as React from 'react'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import {
  Link,
  RouterProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

describe('Link', () => {
  it('should NOT pass the "disabled" prop to the rendered Link component', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <Link to="/" disabled>
          Index
        </Link>
      ),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const rendered = render(<RouterProvider router={router} />)
    const customElement = rendered.queryByText('Index')

    expect(customElement!.hasAttribute('disabled')).toBe(false)
  })
  describe('building urls', () => {
    const buildRouter = async (
      component: React.ReactNode,
      opts?: { page?: string },
    ) => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })

      const invoicesRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'invoices',
      })

      const invoicesIndexRoute = createRoute({
        getParentRoute: () => invoicesRoute,
        path: '/',
      })

      const invoiceRoute = createRoute({
        getParentRoute: () => invoicesRoute,
        path: '$invoiceId',
      })

      const subInvoiceRoute = createRoute({
        getParentRoute: () => invoiceRoute,
        path: 'sub',
      })

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'posts',
      })

      const postsIndexRoute = createRoute({
        getParentRoute: () => postsRoute,
        path: '/',
      })

      const postRoute = createRoute({
        getParentRoute: () => postsRoute,
        path: '$postId',
      })

      const router = createRouter({
        defaultComponent: () => component,
        routeTree: rootRoute.addChildren([
          invoicesRoute.addChildren([
            invoicesIndexRoute,
            invoiceRoute.addChildren([subInvoiceRoute]),
          ]),
          postsRoute.addChildren([postsIndexRoute, postRoute]),
          indexRoute,
        ]),
        history: createMemoryHistory({ initialEntries: [opts?.page ?? '/'] }),
      })

      await router.load()

      return router
    }

    it('should build correct url for absolute to property', async () => {
      const router = await buildRouter(<Link to="/invoices/123/sub">Link</Link>)

      const rendered = render(<RouterProvider router={router} />)

      const link = rendered.getByText('Link')

      expect(link.getAttribute('href')).toBe('/invoices/123/sub')
    })

    it('should build correct url for relative to property', async () => {
      const router = await buildRouter(
        <Link from="/invoices/123" to="./sub">
          Link
        </Link>,
        { page: '/invoices/123' },
      )

      const rendered = render(<RouterProvider router={router} />)

      const link = rendered.getByText('Link')

      expect(link.getAttribute('href')).toBe('/invoices/123/sub')
    })
  })
})

describe('createLink', () => {
  it('should pass the "disabled" prop to the rendered target element', async () => {
    const CustomLink = createLink('button')

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <CustomLink to="/" disabled>
          Index
        </CustomLink>
      ),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const rendered = render(<RouterProvider router={router} />)
    const customElement = rendered.queryByText('Index')

    expect(customElement!.hasAttribute('disabled')).toBe(true)
    expect(customElement!.getAttribute('disabled')).toBe('')
  })

  it('should pass the "foo" prop to the rendered target element', async () => {
    const CustomLink = createLink('button')

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <CustomLink
          to="/"
          // @ts-expect-error
          foo="bar"
        >
          Index
        </CustomLink>
      ),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const rendered = render(<RouterProvider router={router} />)
    const customElement = rendered.queryByText('Index')

    expect(customElement!.hasAttribute('foo')).toBe(true)
    expect(customElement!.getAttribute('foo')).toBe('bar')
  })
})
