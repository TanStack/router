import { afterEach, expect, test, vi } from 'vitest'
import { zodValidator } from '../src'
import { z } from 'zod'
import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  validateSearchWithRawInput,
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

test('raw URL number search params still use the default parsed input', async () => {
  const rootRoute = createRootRoute()

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

  const routeTree = rootRoute.addChildren([invoicesRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/invoices?page=0'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Page: 0')).toBeInTheDocument()
})

test('validateSearchWithRawInput preserves numeric-looking strings from the URL', async () => {
  const rootRoute = createRootRoute()

  const Files = () => {
    const search = filesRoute.useSearch()

    return (
      <>
        <h1>Files</h1>
        <span>Folder: {search.folder}</span>
      </>
    )
  }

  const filesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'files',
    validateSearch: validateSearchWithRawInput(
      z.object({
        folder: z.string(),
      }),
    ),
    component: Files,
  })

  const routeTree = rootRoute.addChildren([filesRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/files?folder=34324324235325352523'],
    }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByText('Folder: 34324324235325352523'),
  ).toBeInTheDocument()
})

test('buildLocation with search=true preserves raw string search values', async () => {
  const rootRoute = createRootRoute()

  const filesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'files',
    validateSearch: validateSearchWithRawInput(
      z.object({
        folder: z.string(),
      }),
    ),
  })

  const routeTree = rootRoute.addChildren([filesRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/files?folder=34324324235325352523'],
    }),
  })

  await router.load()

  const nextLocation = router.buildLocation({
    to: '.',
    search: true,
  })

  expect(nextLocation.search).toEqual({
    folder: '34324324235325352523',
  })
})

test('defaultRawSearchInput on router preserves numeric-looking strings globally', async () => {
  const rootRoute = createRootRoute()

  const Files = () => {
    const search = filesRoute.useSearch()

    return (
      <>
        <h1>Files</h1>
        <span>Folder: {search.folder}</span>
      </>
    )
  }

  const filesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'files',
    validateSearch: z.object({
      folder: z.string(),
    }),
    component: Files,
  })

  const routeTree = rootRoute.addChildren([filesRoute])
  const router = createRouter({
    routeTree,
    defaultRawSearchInput: true,
    history: createMemoryHistory({
      initialEntries: ['/files?folder=34324324235325352523'],
    }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByText('Folder: 34324324235325352523'),
  ).toBeInTheDocument()
})

test('defaultRawSearchInput does not affect routes using validateSearchWithRawInput', async () => {
  const rootRoute = createRootRoute()

  const filesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'files',
    validateSearch: validateSearchWithRawInput(
      z.object({
        folder: z.string(),
      }),
    ),
  })

  const routeTree = rootRoute.addChildren([filesRoute])
  const router = createRouter({
    routeTree,
    defaultRawSearchInput: true,
    history: createMemoryHistory({
      initialEntries: ['/files?folder=34324324235325352523'],
    }),
  })

  await router.load()

  const nextLocation = router.buildLocation({
    to: '.',
    search: true,
  })

  expect(nextLocation.search).toEqual({
    folder: '34324324235325352523',
  })
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
