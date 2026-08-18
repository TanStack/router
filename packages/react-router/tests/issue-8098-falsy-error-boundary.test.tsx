import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/history'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function setupThrowingRoute(thrownValue: unknown) {
  const rootRoute = createRootRoute({
    errorComponent: ({ error }) => (
      <div data-testid="route-error">{String(error)}</div>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: function Boom(): never {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw thrownValue
    },
  })
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

test.each([
  ['undefined', undefined],
  ['null', null],
  ['zero', 0],
  ['empty string', ''],
])(
  'renders the errorComponent when a component throws %s',
  async (_label, thrownValue) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const router = setupThrowingRoute(thrownValue)
    render(<RouterProvider router={router} />)

    const errorEl = await screen.findByTestId('route-error')
    expect(errorEl.textContent).toBe(String(thrownValue))
  },
)

test('passes real errors through to the errorComponent unchanged', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  const router = setupThrowingRoute(new Error('real failure'))
  render(<RouterProvider router={router} />)

  const errorEl = await screen.findByTestId('route-error')
  expect(errorEl.textContent).toContain('real failure')
})
