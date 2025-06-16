import { afterEach, expect, test, vi } from 'vitest'
import { fallback, zodValidator } from '../src'
import { z } from 'zod/v4'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

test('when navigating to a route with zodValidator', async () => {
  const rootRoute = createRootRoute()

  const Index = () => {
    return (
      <>
        <h1>Index</h1>
        <Link<typeof router, string, '/invoices'>
          to="/invoices"
          search={{
            page: 0,
          }}
        >
          To Invoices
        </Link>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
  })

  const Invoices = () => {
    const search = invoicesRoute.useSearch()

    return (
      <>
        <h1>Invoices</h1>
        <span>Page: {search.page}</span>
      </>
    )
  }

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    validateSearch: zodValidator(
      z.object({
        page: z.number(),
      }),
    ),
    component: Invoices,
  })

  const routeTree = rootRoute.addChildren([indexRoute, invoicesRoute])
  const router = createRouter({ routeTree })

  render(<RouterProvider router={router} />)

  const invoicesLink = await screen.findByRole('link', {
    name: 'To Invoices',
  })

  fireEvent.click(invoicesLink)

  expect(await screen.findByText('Page: 0')).toBeInTheDocument()
})

test('when navigating to a route with zodValidator with fallback value', async () => {
  const rootRoute = createRootRoute()

  const Index = () => {
    return (
      <>
        <h1>Index</h1>
        <Link<typeof router, string, '/invoices'>
          to="/invoices"
          search={{
            // to test fallback we need to cast to any to test invalid input
            sort: 0 as any,
          }}
        >
          To Invoices
        </Link>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
  })

  const Invoices = () => {
    const search = invoicesRoute.useSearch()

    return (
      <>
        <h1>Invoices</h1>
        <span>Sort by: {search.sort}</span>
      </>
    )
  }

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    validateSearch: zodValidator(
      z.object({
        sort: fallback(z.enum(['oldest', 'newest']), 'oldest').default(
          'oldest',
        ),
      }),
    ),
    component: Invoices,
  })

  const routeTree = rootRoute.addChildren([indexRoute, invoicesRoute])
  const router = createRouter({ routeTree })

  render(<RouterProvider router={router} />)

  const invoicesLink = await screen.findByRole('link', {
    name: 'To Invoices',
  })

  fireEvent.click(invoicesLink)

  expect(await screen.findByText('Sort by: oldest')).toBeInTheDocument()
})

test('when navigating to a route with zodValidator input set to output', async () => {
  const rootRoute = createRootRoute()

  const Index = () => {
    return (
      <>
        <h1>Index</h1>
        <Link<typeof router, string, '/invoices'>
          to="/invoices"
          search={{
            page: 0,
          }}
        >
          To Invoices
        </Link>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
  })

  const Invoices = () => {
    const search = invoicesRoute.useSearch()

    return (
      <>
        <h1>Invoices</h1>
        <span>Page: {search.page}</span>
      </>
    )
  }

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    validateSearch: zodValidator({
      schema: z.object({
        page: z.number(),
      }),
      input: 'input',
    }),
    component: Invoices,
  })

  const routeTree = rootRoute.addChildren([indexRoute, invoicesRoute])
  const router = createRouter({ routeTree })

  render(<RouterProvider router={router} />)

  const invoicesLink = await screen.findByRole('link', {
    name: 'To Invoices',
  })

  fireEvent.click(invoicesLink)

  expect(await screen.findByText('Page: 0')).toBeInTheDocument()
})

test('when navigating to a route using zod without the adapter', async () => {
  const rootRoute = createRootRoute()

  const Index = () => {
    return (
      <>
        <h1>Index</h1>
        <Link<typeof router, string, '/invoices'>
          to="/invoices"
          search={{
            page: 0,
          }}
        >
          To Invoices
        </Link>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
  })

  const Invoices = () => {
    const search = invoicesRoute.useSearch()

    return (
      <>
        <h1>Invoices</h1>
        <span>Page: {search.page}</span>
      </>
    )
  }

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    validateSearch: z.object({
      page: z.number(),
    }),
    component: Invoices,
  })

  const routeTree = rootRoute.addChildren([indexRoute, invoicesRoute])
  const router = createRouter({ routeTree })

  render(<RouterProvider router={router} />)

  const invoicesLink = await screen.findByRole('link', {
    name: 'To Invoices',
  })

  fireEvent.click(invoicesLink)

  expect(await screen.findByText('Page: 0')).toBeInTheDocument()
})

test('when navigating to a route using zod in a function without the adapter', async () => {
  const rootRoute = createRootRoute()

  const Index = () => {
    return (
      <>
        <h1>Index</h1>
        <Link<typeof router, string, '/invoices'>
          to="/invoices"
          search={{
            page: 0,
          }}
        >
          To Invoices
        </Link>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
  })

  const Invoices = () => {
    const search = invoicesRoute.useSearch()

    return (
      <>
        <h1>Invoices</h1>
        <span>Page: {search.page}</span>
      </>
    )
  }

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    validateSearch: (input) =>
      z
        .object({
          page: z.number(),
        })
        .parse(input),
    component: Invoices,
  })

  const routeTree = rootRoute.addChildren([indexRoute, invoicesRoute])
  const router = createRouter({ routeTree })

  render(<RouterProvider router={router} />)

  const invoicesLink = await screen.findByRole('link', {
    name: 'To Invoices',
  })

  fireEvent.click(invoicesLink)

  expect(await screen.findByText('Page: 0')).toBeInTheDocument()
})
