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

test('a same-id search navigation merges fresh inherited context with cached route context', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    validateSearch: (search: Record<string, unknown>) => ({
      revision: typeof search.revision === 'string' ? search.revision : 'one',
    }),
    loaderDeps: ({ search }) => ({ revision: search.revision }),
    context: ({ deps }) => ({ inheritedRevision: deps.revision }),
    component: Outlet,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loaderDeps: () => ({}),
    context: ({ context, location }) => ({
      cachedSelfRevision: `${context.inheritedRevision}:${String(location.search.revision)}`,
    }),
    component: () => {
      const context = childRoute.useRouteContext()
      const search = childRoute.useSearch()
      const matchId = childRoute.useMatch({ select: (match) => match.id })

      return (
        <>
          <div data-testid="match-id">{matchId}</div>
          <div data-testid="current-search">{search.revision}</div>
          <div data-testid="inherited-context">
            {context.inheritedRevision}
          </div>
          <div data-testid="cached-self-context">
            {context.cachedSelfRevision}
          </div>
        </>
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({
      initialEntries: ['/parent/child?revision=one'],
    }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('current-search')).toHaveTextContent('one')
  expect(screen.getByTestId('inherited-context')).toHaveTextContent('one')
  expect(screen.getByTestId('cached-self-context')).toHaveTextContent(
    'one:one',
  )
  const initialMatchId = screen.getByTestId('match-id').textContent

  await act(() =>
    router.navigate({
      to: '/parent/child',
      search: { revision: 'two' },
    }),
  )

  expect(await screen.findByTestId('current-search')).toHaveTextContent('two')
  expect(screen.getByTestId('match-id').textContent).toBe(initialMatchId)
  expect(screen.getByTestId('inherited-context')).toHaveTextContent('two')
  expect(screen.getByTestId('cached-self-context')).toHaveTextContent(
    'one:one',
  )
})
