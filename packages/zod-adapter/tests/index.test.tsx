import { afterEach, expect, test, vi } from 'vitest'
import { zodValidator } from '../src'
import * as z3 from 'zod/v3'
import * as z4 from 'zod/v4'
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
      z3.object({
        page: z3.number(),
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
      schema: z3.object({
        page: z3.number(),
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
    validateSearch: z3.object({
      page: z3.number(),
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
      z3
        .object({
          page: z3.number(),
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

test('when navigating to a route with zodValidator using Zod 4 schema', async () => {
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
      z4.object({
        page: z4.number(),
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

test('when navigating to a route with zodValidator options using Zod 4 schema', async () => {
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
      schema: z4.object({
        page: z4.number(),
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
