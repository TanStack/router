import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  retainSearchParams,
} from '../src'
import { getSearchParamsFromURI } from './utils'

afterEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe('retainSearchParams', () => {
  async function runTest(initialUrl: string) {
    const rootRoute = createRootRoute({
      validateSearch: (input) => {
        return {
          root: input.root as string | undefined,
        }
      },
      search: {
        middlewares: [
          // @ts-expect-error this requires types to be registered which does not work in tests
          retainSearchParams(['root']),
        ],
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            {/* N.B. this link does not have search params set, but the middleware will add `root` if it is currently present */}
            <Link to="/posts">Posts</Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: [initialUrl] }),
    })

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })
    expect(postsLink).toHaveAttribute('href')
    const href = postsLink.getAttribute('href')
    const search = getSearchParamsFromURI(href!)
    return search
  }

  it('should retain `root` search param', async () => {
    const search = await runTest('/?root=abc')
    expect(search.size).toBe(1)
    expect(search.get('root')).toBe('abc')
  })

  it('should do nothing if `root` search param is not set', async () => {
    const search = await runTest('/')
    expect(search.size).toBe(0)
  })
})
