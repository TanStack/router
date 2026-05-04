/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * SPA navigation regression tests. Each test exercises one of the
 * three reactivity bugs we fixed (atom subscribe wrap, dynamic match
 * store, MatchContext-in-render):
 *
 * - Sibling navigation under a layout (reuses the leaf `<Match>` with
 *   a different matchId — exercises `subscribeDynamicStore`).
 * - Cross-layout navigation (replaces the layout component, mounts a
 *   new sub-tree — exercises diff replace).
 * - Deeply nested layouts (`__root → users → users.$id` then to a
 *   parallel sibling) — exercises `MatchContext` propagation through
 *   reused `<Outlet>` instances.
 * - Sibling param swap of leaf-only — exercises the matchId in
 *   `useMatch`/`useParams` reactivity end-to-end.
 */
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

/** Three-route fixture: `/`, `/users`, `/users/$id`, `/posts`, `/posts/$slug`. */
function setup(initialPath = '/') {
  function Root(_h: Handle) {
    return () => (
      <>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/users">Users</Link>
          <Link to="/users/$id" params={{ id: '1' }}>U1</Link>
          <Link to="/users/$id" params={{ id: '2' }}>U2</Link>
          <Link to="/posts">Posts</Link>
          <Link to="/posts/$slug" params={{ slug: 'hello' }}>P-Hello</Link>
        </nav>
        <Outlet />
      </>
    )
  }
  function Index(_h: Handle) {
    return () => <h1 id="page">Home</h1>
  }
  function UsersLayout(handle: Handle) {
    const data = useLoaderData(handle, { from: '/users' })
    return () => (
      <section id="users-layout">
        <h1 id="page">Users</h1>
        <p id="users-loader">{String((data() as { count: number } | undefined)?.count)}</p>
        <Outlet />
      </section>
    )
  }
  function User(handle: Handle) {
    const params = useParams(handle, { from: '/users/$id' })
    const data = useLoaderData(handle, { from: '/users/$id' })
    return () => (
      <article id="user-detail">
        <h2 id="user-name">{(data() as { name: string } | undefined)?.name}</h2>
        <p id="user-id">id={params()?.id}</p>
      </article>
    )
  }
  function PostsLayout(_h: Handle) {
    return () => (
      <section id="posts-layout">
        <h1 id="page">Posts</h1>
        <Outlet />
      </section>
    )
  }
  function Post(handle: Handle) {
    const params = useParams(handle, { from: '/posts/$slug' })
    return () => (
      <article id="post-detail">
        <p id="post-slug">slug={params()?.slug}</p>
      </article>
    )
  }

  const root = createRootRoute({ component: Root })
  const index = createRoute({ getParentRoute: () => root, path: '/', component: Index })
  const users = createRoute({
    getParentRoute: () => root,
    path: 'users',
    component: UsersLayout,
    loader: async () => ({ count: 3 }),
  })
  const user = createRoute({
    getParentRoute: () => users,
    path: '$id',
    loader: async ({ params }: { params: { id: string } }) => ({
      id: params.id,
      name: `User #${params.id}`,
    }),
    component: User,
  })
  const posts = createRoute({
    getParentRoute: () => root,
    path: 'posts',
    component: PostsLayout,
  })
  const post = createRoute({
    getParentRoute: () => posts,
    path: '$slug',
    component: Post,
  })
  users.addChildren([user])
  posts.addChildren([post])
  root.addChildren([index, users, posts])

  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return router
}

async function flush() {
  // Allow Remix UI's scheduler queue to drain.
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('SPA navigation — nested routes re-render correctly', () => {
  test('cross-layout: home → users → users renders the layout content', async () => {
    const router = setup('/')
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup
    expect(result.$('#page')?.textContent).toBe('Home')

    await router.navigate({ to: '/users' })
    await router.load()
    await flush()

    expect(result.$('#page')?.textContent).toBe('Users')
    expect(result.$('#users-layout')).toBeTruthy()
    expect(result.$('#users-loader')?.textContent).toBe('3')
  })

  test('drilling in: users → users/$id renders BOTH layout and leaf', async () => {
    const router = setup('/users')
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup
    expect(result.$('#users-layout')).toBeTruthy()
    expect(result.$('#user-detail')).toBeFalsy()

    await router.navigate({ to: '/users/$id', params: { id: '7' } })
    await router.load()
    await flush()

    // Layout AND leaf both rendered — this is the regression that broke
    // when MatchContext set its value in setup. The inner Outlet inside
    // UsersLayout was returning null because its captured parentMatchId
    // was stale.
    expect(result.$('#users-layout')).toBeTruthy()
    expect(result.$('#user-detail')).toBeTruthy()
    expect(result.$('#user-name')?.textContent).toBe('User #7')
    expect(result.$('#user-id')?.textContent).toBe('id=7')
  })

  test('sibling param swap: users/1 → users/2 updates leaf without remounting layout', async () => {
    const router = setup('/users/1')
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup
    expect(result.$('#user-name')?.textContent).toBe('User #1')

    await router.navigate({ to: '/users/$id', params: { id: '2' } })
    await router.load()
    await flush()

    // Same UsersLayout instance (matchId for /users didn't change), but
    // the leaf's data must update — exercises subscribeDynamicStore in
    // <Match> walking from users/1's match store to users/2's.
    expect(result.$('#users-layout')).toBeTruthy()
    expect(result.$('#user-name')?.textContent).toBe('User #2')
    expect(result.$('#user-id')?.textContent).toBe('id=2')
  })

  test('cross-layout deep: users/1 → posts/hello swaps both layout and leaf', async () => {
    const router = setup('/users/1')
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup
    expect(result.$('#users-layout')).toBeTruthy()
    expect(result.$('#user-name')?.textContent).toBe('User #1')

    await router.navigate({ to: '/posts/$slug', params: { slug: 'hello' } })
    await router.load()
    await flush()

    expect(result.$('#users-layout')).toBeFalsy()
    expect(result.$('#posts-layout')).toBeTruthy()
    expect(result.$('#post-slug')?.textContent).toBe('slug=hello')
  })

  test('round-trip: home → users/1 → home returns to index without leftover content', async () => {
    const router = setup('/')
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    await router.navigate({ to: '/users/$id', params: { id: '5' } })
    await router.load()
    await flush()
    expect(result.$('#user-detail')).toBeTruthy()

    await router.navigate({ to: '/' })
    await router.load()
    await flush()

    expect(result.$('#page')?.textContent).toBe('Home')
    expect(result.$('#user-detail')).toBeFalsy()
    expect(result.$('#users-layout')).toBeFalsy()
  })
})
