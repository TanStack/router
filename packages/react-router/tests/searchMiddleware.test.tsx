import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  Link,
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  retainSearchParams,
  stripSearchParams,
} from '../src'
import { getSearchParamsFromURI } from './utils'
import type { AnyRouter } from '../src'
import type { SearchMiddleware } from '../src/route'

afterEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

function setupTest(opts: {
  initial: { route: string; search?: { value?: string } }
  middlewares: Array<SearchMiddleware<any>>
  linkSearch?: { value?: string }
}) {
  const rootRoute = createRootRoute({
    validateSearch: (input) => {
      if (input.value !== undefined) {
        return { value: input.value as string }
      }
      return {}
    },
    search: {
      middlewares: opts.middlewares,
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
          <Link data-testid="posts-link" to="/posts" search={opts.linkSearch}>
            Posts
          </Link>
        </>
      )
    },
  })

  const PostsComponent = () => {
    const { value } = postsRoute.useSearch()
    return (
      <>
        <h1 data-testid="posts-heading">Posts</h1>
        <div data-testid="search">{value ?? '$undefined'}</div>
      </>
    )
  }

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const navigateComponentRootRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/root-with-retained-search-params',
    validateSearch: (sp) => ({
      default: sp.default,
    }),
    search: {
      middlewares: [retainSearchParams(['default'])],
    },
    component: () => {
      const search = navigateComponentRootRoute.useSearch()

      return (
        <>
          <h1 data-testid={'root-with-retained-search-params-default'}>
            {search.default}
          </h1>
          <Outlet></Outlet>
        </>
      )
    },
  })

  const navigateComponentAddSpRoute = createRoute({
    getParentRoute: () => navigateComponentRootRoute,
    path: '/add-sp',
    component: () => {
      return (
        <>
          <Navigate to="../" search={{ default: 'd1' }}></Navigate>
        </>
      )
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      postsRoute,
      navigateComponentRootRoute.addChildren([navigateComponentAddSpRoute]),
    ]),
  })
  window.history.replaceState(
    null,
    '',
    `${opts.initial.route}?${new URLSearchParams(opts.initial.search).toString()}`,
  )
  return router
}

async function runTest(
  router: AnyRouter,
  expectedSearch: { root: { value?: string }; posts: { value?: string } },
) {
  render(<RouterProvider router={router} />)

  const postsLink = await screen.findByTestId('posts-link')
  expect(postsLink).toHaveAttribute('href')
  const href = postsLink.getAttribute('href')
  const linkSearchOnRoot = getSearchParamsFromURI(href!)
  checkLocationSearch(expectedSearch.root)
  expect(router.state.location.search).toEqual(expectedSearch.root)

  fireEvent.click(postsLink)

  const postHeading = await screen.findByTestId('posts-heading')
  expect(postHeading).toBeInTheDocument()
  expect(window.location.pathname).toBe('/posts')

  expect(await screen.findByTestId('search')).toHaveTextContent(
    expectedSearch.posts.value ?? '$undefined',
  )
  checkLocationSearch(expectedSearch.posts)
  expect(router.state.location.search).toEqual(expectedSearch.posts)
  return linkSearchOnRoot
}

function checkLocationSearch(search: object) {
  const parsedSearch = new URLSearchParams(window.location.search)
  expect(parsedSearch.size).toBe(Object.keys(search).length)
  for (const [key, value] of Object.entries(search)) {
    expect(parsedSearch.get(key)).toBe(value)
  }
}

describe('retainSearchParams', () => {
  const middlewares = [retainSearchParams(['value'])]

  it('should retain `value` search param', async () => {
    const router = setupTest({
      initial: { route: '/', search: { value: 'abc' } },
      middlewares,
    })
    const linkSearch = await runTest(router, {
      root: { value: 'abc' },
      posts: { value: 'abc' },
    })
    expect(linkSearch.size).toBe(1)
    expect(linkSearch.get('value')).toBe('abc')
  })

  it('should do nothing if `value` search param is not set', async () => {
    const router = setupTest({ initial: { route: '/' }, middlewares })
    const expectedLocationSearch = {}
    const linkSearch = await runTest(router, { root: {}, posts: {} })
    expect(linkSearch.size).toBe(0)
    expect(router.state.location.search).toEqual(expectedLocationSearch)
    checkLocationSearch(expectedLocationSearch)
  })

  it("should ignore undefined sp and use don't retain it (for sub routes)", async () => {
    const router = setupTest({
      initial: {
        route: '/root-with-retained-search-params/add-sp',
      },
      middlewares: [],
    })

    render(<RouterProvider router={router} />)
    await act(() => router.load())

    expect(router.state.location.pathname).toEqual(
      '/root-with-retained-search-params',
    )

    const sp = await screen.findByTestId(
      'root-with-retained-search-params-default',
    )

    expect(sp.innerHTML).toEqual('d1')
  })
})

describe('stripSearchParams', () => {
  it('by key', async () => {
    const middlewares = [stripSearchParams(['value'])]
    const router = setupTest({
      initial: { route: '/', search: { value: 'abc' } },
      middlewares,
      linkSearch: { value: 'xyz' },
    })
    const linkSearch = await runTest(router, { root: {}, posts: {} })
    expect(linkSearch.size).toBe(0)
  })

  it('true', async () => {
    const middlewares = [stripSearchParams(true)]
    const router = setupTest({
      initial: { route: '/', search: { value: 'abc' } },
      middlewares,
      linkSearch: { value: 'xyz' },
    })
    const linkSearch = await runTest(router, { root: {}, posts: {} })
    expect(linkSearch.size).toBe(0)
  })

  it('by value', async () => {
    const middlewares = [stripSearchParams({ value: 'abc' })]
    const router = setupTest({
      initial: { route: '/', search: { value: 'abc' } },
      middlewares,
      linkSearch: { value: 'xyz' },
    })
    const linkSearch = await runTest(router, {
      root: {},
      posts: { value: 'xyz' },
    })
    expect(linkSearch.size).toBe(1)
  })
})
