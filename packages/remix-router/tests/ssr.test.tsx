/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { describe, expect, test } from 'vitest'
import { renderToString } from '@remix-run/ui/server'
import { createMemoryHistory } from '@tanstack/history'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useLoaderData,
} from '../src'
import type { Handle } from '@remix-run/ui'

function buildTree() {
  function Root(_handle: Handle) {
    return () => (
      <body>
        <nav>
          <Link to="/">Home</Link>
          {' · '}
          <Link to="/posts">Posts</Link>
        </nav>
        <Outlet />
      </body>
    )
  }
  function Index(_handle: Handle) {
    return () => <h1>Home</h1>
  }
  function Posts(handle: Handle) {
    const data = useLoaderData(handle, { from: '/posts' })
    return () => {
      const list = (data() as Array<string>) ?? []
      return (
        <ul>
          {list.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )
    }
  }

  const root = createRootRoute({ component: Root })
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: Index,
  })
  const posts = createRoute({
    getParentRoute: () => root,
    path: '/posts',
    loader: async () => ['ada', 'bjarne'],
    component: Posts,
  })
  root.addChildren([index, posts])
  return root
}

async function renderRoute(initialPath: string) {
  const router = createRouter({
    routeTree: buildTree(),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

describe('SSR rendering', () => {
  test('renders the index match through Outlet', async () => {
    const html = await renderRoute('/')
    expect(html).toContain('<h1>Home</h1>')
    // Active state on /
    expect(html).toMatch(/<a href="\/" data-status="active"/)
  })

  test('renders nested loader data', async () => {
    const html = await renderRoute('/posts')
    expect(html).toContain('<li>ada</li>')
    expect(html).toContain('<li>bjarne</li>')
  })

  test('Link renders correct hrefs', async () => {
    const html = await renderRoute('/')
    expect(html).toContain('<a href="/"')
    expect(html).toContain('<a href="/posts"')
  })
})
