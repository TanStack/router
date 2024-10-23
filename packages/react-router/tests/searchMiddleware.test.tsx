import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import {
  Link,
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
      return {
        value: input.value as string | undefined,
      }
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
          <Link to="/posts" search={opts.linkSearch}>
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
        <h1>Posts</h1>
        <div data-testid="search">{value ?? '$undefined'}</div>
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

  const postsLink = await screen.findByRole('link', { name: 'Posts' })
  expect(postsLink).toHaveAttribute('href')
  const href = postsLink.getAttribute('href')
  const linkSearchOnRoot = getSearchParamsFromURI(href!)
  checkLocationSearch(expectedSearch.root)
  expect(router.state.location.search).toEqual(expectedSearch.root)

  postsLink.click()
  await expect(await screen.findByTestId('search')).toHaveTextContent(
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
