/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useLoaderData,
  useParams,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function setup(initialPath = '/') {
  function Root(_h: Handle) {
    return () => (
      <>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/users/$id" params={{ id: '7' }}>
            User 7
          </Link>
        </nav>
        <Outlet />
      </>
    )
  }
  function Index(_h: Handle) {
    return () => <h1>Home</h1>
  }
  function User(handle: Handle) {
    const params = useParams(handle, { from: '/users/$id' })
    const data = useLoaderData(handle, { from: '/users/$id' })
    return () => (
      <article>
        <h2 id="name">{(data() as { name: string } | undefined)?.name}</h2>
        <p id="id">id={params()?.id}</p>
      </article>
    )
  }

  const root = createRootRoute({ component: Root })
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: Index,
  })
  const user = createRoute({
    getParentRoute: () => root,
    path: 'users/$id',
    loader: async ({ params }: { params: { id: string } }) => ({
      id: params.id,
      name: `User #${params.id}`,
    }),
    component: User,
  })
  root.addChildren([index, user])

  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return router
}

describe('client navigation', () => {
  test('renders the index match through Outlet on mount', async () => {
    const router = setup('/')
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('h1')?.textContent).toBe('Home')
    expect(result.$$('nav a').length).toBe(2)
  })

  test('navigating to /users/$id renders the nested route with loader data', async () => {
    const router = setup('/')
    // Trigger and await the loader BEFORE rendering, so the match is in
    // 'success' state and the route component reads loaderData on first
    // render. (The remix/ui scheduler runs after the test thread, so we
    // can't easily await mid-render reactivity in jsdom.)
    await router.navigate({ to: '/users/$id', params: { id: '7' } })
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#name')?.textContent).toBe('User #7')
    expect(result.$('#id')?.textContent).toBe('id=7')
  })
})
