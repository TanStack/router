import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('a same-id reload keeps the committed beforeLoad context visible until the next result', async () => {
  const reload = createControlledPromise<void>()
  const reloadStarted = createControlledPromise<void>()
  const observedContexts: Array<unknown> = []
  let beforeLoadRuns = 0

  const rootRoute = createRootRoute({
    beforeLoad: async ({ matches }) => {
      beforeLoadRuns++
      if (beforeLoadRuns > 1) {
        observedContexts.push(matches[0]?.context)
        reloadStarted.resolve()
        await reload
      }
      return { locale: 'en' }
    },
    component: () => {
      const { locale } = rootRoute.useRouteContext()
      return <div data-testid="locale">{locale ?? 'missing'}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('locale')).toHaveTextContent('en')

  let invalidation!: Promise<void>
  await act(async () => {
    invalidation = router.invalidate()
    await reloadStarted
  })

  expect(beforeLoadRuns).toBe(2)
  expect(screen.getByTestId('locale')).toHaveTextContent('en')

  reload.resolve()
  await act(() => invalidation)

  expect(observedContexts).toEqual([{ locale: 'en' }])
})
