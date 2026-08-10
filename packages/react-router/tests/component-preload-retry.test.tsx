import * as React from 'react'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createControlledPromise } from '@tanstack/router-core'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  useRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

afterEach(() => {
  cleanup()
})

test('a successful server component download is reused', async () => {
  vi.stubGlobal('window', undefined)
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  const importer = vi.fn().mockResolvedValue({ default: () => null })
  const Page = lazyRouteComponent(importer)

  await Page.preload?.()
  await Page.preload?.()
  expect(importer).toHaveBeenCalledTimes(1)
})

test('concurrent component preloads share the import', async () => {
  const componentImport = createControlledPromise<{
    default: () => null
  }>()
  const importer = vi.fn(() => componentImport)
  const Page = lazyRouteComponent(importer)

  const first = Page.preload?.()
  const second = Page.preload?.()
  expect(importer).toHaveBeenCalledOnce()

  componentImport.resolve({ default: () => null })
  await Promise.all([first, second])
})

test('a failed component download is retried from the route error UI', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  onTestFinished(() => consoleError.mockRestore())

  const PageContent = () => <div>Page content</div>
  const importer = vi
    .fn<() => Promise<{ default: typeof PageContent }>>()
    .mockRejectedValueOnce(new Error('component download failed'))
    .mockResolvedValue({ default: PageContent })
  const Page = lazyRouteComponent(importer)

  function RouteError({ reset }: ErrorComponentProps) {
    const router = useRouter()
    return (
      <button
        type="button"
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Retry
      </button>
    )
  }

  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
    errorComponent: RouteError,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  const retryButton = await screen.findByRole('button', { name: 'Retry' })
  expect(importer).toHaveBeenCalledTimes(1)

  fireEvent.click(retryButton)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
  expect(
    screen.queryByRole('button', { name: 'Retry' }),
  ).not.toBeInTheDocument()
})

test('renders after retrying a module download that failed during preload', async () => {
  onTestFinished(() => sessionStorage.clear())
  const PageContent = () => <div>Page content</div>
  const importer = vi
    .fn<() => Promise<{ default: typeof PageContent }>>()
    .mockRejectedValueOnce(
      new TypeError(
        'Failed to fetch dynamically imported module: /assets/page.js',
      ),
    )
    .mockResolvedValue({ default: PageContent })
  const Page = lazyRouteComponent(importer)

  await Page.preload?.()

  const rootRoute = createRootRoute()
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledTimes(2)
})
