import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
} from '../src'

declare module '@tanstack/history' {
  interface HistoryState {
    issue8115Revision?: 'old' | 'new'
  }
}

afterEach(() => {
  cleanup()
})

test('a same-id navigation merges new inherited context with cached route context', async () => {
  const history = createMemoryHistory({ initialEntries: ['/'] })
  history.replace('/', { issue8115Revision: 'old' })

  const rootRoute = createRootRoute({
    beforeLoad: ({ location }) => ({
      inheritedRevision: location.state.issue8115Revision,
    }),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: ({ location }) => ({
      selfRevision: location.state.issue8115Revision,
    }),
    component: () => {
      const location = useLocation()
      const context = indexRoute.useRouteContext()
      const matchId = indexRoute.useMatch({ select: (match) => match.id })
      const navigate = indexRoute.useNavigate()

      return (
        <>
          <output data-testid="match-id">{matchId}</output>
          <output data-testid="snapshot">
            location: {location.state.issue8115Revision}; inherited:{' '}
            {context.inheritedRevision}; self: {context.selfRevision}
          </output>
          <button
            onClick={() => {
              void navigate({
                to: '/',
                state: { issue8115Revision: 'new' },
              })
            }}
          >
            Update state
          </button>
        </>
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history,
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('snapshot')).toHaveTextContent(
    'location: old; inherited: old; self: old',
  )
  const initialMatchId = screen.getByTestId('match-id').textContent

  fireEvent.click(screen.getByRole('button', { name: 'Update state' }))

  await waitFor(() => {
    expect(screen.getByTestId('match-id').textContent).toBe(initialMatchId)
    expect(screen.getByTestId('snapshot')).toHaveTextContent(
      'location: new; inherited: new; self: old',
    )
  })
})
