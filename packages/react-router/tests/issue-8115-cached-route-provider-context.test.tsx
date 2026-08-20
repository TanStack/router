import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('a same-match reload merges new provider context with cached route context', async () => {
  type ProviderContext = {
    providerValue: string
    collision: string
  }

  const providerA: ProviderContext = {
    providerValue: 'A',
    collision: 'provider:A',
  }
  const providerB: ProviderContext = {
    providerValue: 'B',
    collision: 'provider:B',
  }
  const rootRoute = createRootRouteWithContext<ProviderContext>()()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: ({ context }) => ({
      derivedFromProvider: `derived:${context.providerValue}`,
      collision: `route-cached:${context.providerValue}`,
    }),
    component: () => (
      <pre data-testid="full-context">
        {JSON.stringify(indexRoute.useRouteContext())}
      </pre>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: providerA,
  })

  const view = render(
    <RouterProvider router={router} context={providerA} />,
  )
  expect(await screen.findByTestId('full-context')).toHaveTextContent(
    JSON.stringify({
      providerValue: 'A',
      collision: 'route-cached:A',
      derivedFromProvider: 'derived:A',
    }),
  )

  view.rerender(<RouterProvider router={router} context={providerB} />)
  await act(() => router.invalidate())

  expect(screen.getByTestId('full-context')).toHaveTextContent(
    JSON.stringify({
      providerValue: 'B',
      collision: 'route-cached:A',
      derivedFromProvider: 'derived:A',
    }),
  )
})
