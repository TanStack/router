import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('#8115: a successful root never renders without its context while a child is pending on cold load', async () => {
  let resolveChildLoader!: () => void
  const childLoader = new Promise<void>((resolve) => {
    resolveChildLoader = resolve
  })
  const rootRenderValues: Array<string | undefined> = []

  const rootRoute = createRootRoute({
    context: () => ({ locale: 'en' }),
    component: () => {
      const locale = rootRoute.useRouteContext().locale
      rootRenderValues.push(locale)

      return (
        <main>
          <p data-testid="root-locale">Locale: {locale ?? 'missing'}</p>
          <Outlet />
        </main>
      )
    },
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => childLoader,
    pendingMs: 0,
    pendingComponent: () => <p role="status">Loading child</p>,
    component: () => <p>Child content</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  try {
    expect(await screen.findByRole('status')).toHaveTextContent('Loading child')
    expect(screen.getByTestId('root-locale')).toHaveTextContent('Locale: en')
    expect(rootRenderValues.length).toBeGreaterThan(0)
    expect(rootRenderValues.every((locale) => locale === 'en')).toBe(true)
  } finally {
    await act(async () => {
      resolveChildLoader()
      await childLoader
    })
  }
})
