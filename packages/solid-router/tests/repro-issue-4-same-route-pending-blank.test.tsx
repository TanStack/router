import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

/**
 * Issue 4: Solid same-route pending replacement should not blank stale content
 * before pending UI is ready. Core can expose a replacement pending match while
 * the route has no pending fallback and a long pendingMs delay.
 *
 * This test renders a real Solid RouterProvider, navigates from page 1 to page
 * 2 on the same route, and leaves the page 2 loader unresolved. Until pendingMs
 * elapses, the previously committed page 1 content should remain visible.
 */

let resolvePendingPage2: (() => void) | undefined
let pendingNavigation: Promise<unknown> | undefined

afterEach(async () => {
  resolvePendingPage2?.()
  if (pendingNavigation) {
    await Promise.allSettled([pendingNavigation])
  }
  resolvePendingPage2 = undefined
  pendingNavigation = undefined
  cleanup()
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })

  return { promise, resolve }
}

test('same-route pending replacement without fallback keeps stale content until pendingMs', async () => {
  const pendingMs = 10_000
  const page2Gate = deferred<void>()
  resolvePendingPage2 = page2Gate.resolve
  const history = createMemoryHistory({ initialEntries: ['/posts?page=1'] })
  const root = createRootRoute({
    component: () => <Outlet />,
  })

  function Posts() {
    const data = postsRoute.useLoaderData()
    return <div data-testid="post-content">{data()}</div>
  }

  const postsRoute = createRoute({
    getParentRoute: () => root,
    path: '/posts',
    validateSearch: (search) => ({
      page: Number(search.page ?? 1),
    }),
    loaderDeps: ({ search }) => ({ page: search.page }),
    pendingMs,
    loader: async ({ deps }) => {
      if (deps.page === 2) {
        await page2Gate.promise
      }

      return `Page ${deps.page}`
    },
    component: Posts,
  })
  const router = createRouter({
    routeTree: root.addChildren([postsRoute]),
    history,
    defaultPendingMs: pendingMs,
  })

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Page 1')).toBeInTheDocument()

  const currentMatch = () =>
    router.stores.matches.get().find((match) => match.routeId === postsRoute.id)
  const navigation = router.navigate({
    to: '/posts',
    search: { page: 2 },
  })
  pendingNavigation = navigation

  await waitFor(
    () => {
      const current = currentMatch()
      expect(current).toBeDefined()
      expect(
        router.stores.pendingMatches
          .get()
          .some(
            (match) =>
              match.routeId === postsRoute.id &&
              match.status === 'pending' &&
              match.id !== current?.id,
          ),
      ).toBe(true)
    },
    { timeout: 1000 },
  )

  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(screen.getByTestId('post-content')).toHaveTextContent('Page 1')

  page2Gate.resolve()
  await navigation
  pendingNavigation = undefined

  expect(await screen.findByText('Page 2')).toBeInTheDocument()
})
