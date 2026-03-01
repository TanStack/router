import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { stripSearchParams } from '@tanstack/router-core'
import {
  Link,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  retainSearchParams,
} from '../src'
import { getSearchParamsFromURI } from './utils'
import type { RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  vi.clearAllMocks()
  vi.resetAllMocks()
})

function setupTest(opts: {
  initial: { route: string; search?: { value?: string } }
  middlewares: Array<any>
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

  @Angular.Component({
    imports: [Link],
    template: `
      <h1>Index</h1>
      <a [link]="{ to: '/posts', search: linkSearch }" data-testid="posts-link">Posts</a>
    `,
    standalone: true,
  })
  class IndexComponent {
    linkSearch = opts.linkSearch
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => IndexComponent,
  })

  @Angular.Component({
    template: `
      <h1 data-testid="posts-heading">Posts</h1>
      <div data-testid="search">{{ searchText() }}</div>
    `,
    standalone: true,
  })
  class PostsComponent {
    search = postsRoute.injectSearch()
    searchText = Angular.computed(() => this.search().value ?? '$undefined')
  }

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    component: () => PostsComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    history,
  })

  window.history.replaceState(
    null,
    '',
    `${opts.initial.route}?${new URLSearchParams(opts.initial.search).toString()}`,
  )

  return router
}

async function runTest(
  router: any,
  expectedSearch: { root: { value?: string }; posts: { value?: string } },
) {
  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })

  const postsLink = await screen.findByTestId('posts-link')
  const href = postsLink.getAttribute('href')
  const linkSearchOnRoot = getSearchParamsFromURI(href!)

  fireEvent.click(postsLink)

  await expect(screen.findByTestId('posts-heading')).resolves.toBeTruthy()
  const searchNode = await screen.findByTestId('search')
  expect(searchNode.textContent).toContain(
    expectedSearch.posts.value ?? '$undefined',
  )
  expect(router.state.location.search).toEqual(expectedSearch.posts)
  return linkSearchOnRoot
}

describe('retainSearchParams', () => {
  test('retains value on link generation and navigation', async () => {
    const router = setupTest({
      initial: { route: '/', search: { value: 'abc' } },
      middlewares: [retainSearchParams(['value'])],
    })

    const linkSearch = await runTest(router, {
      root: { value: 'abc' },
      posts: { value: 'abc' },
    })

    expect(linkSearch.get('value')).toBe('abc')
  })
})

describe('stripSearchParams', () => {
  test('strips by key', async () => {
    const router = setupTest({
      initial: { route: '/', search: { value: 'abc' } },
      middlewares: [stripSearchParams(['value'])],
      linkSearch: { value: 'xyz' },
    })

    const linkSearch = await runTest(router, {
      root: {},
      posts: {},
    })

    expect(linkSearch.size).toBe(0)
  })

  test('strips by object default but preserves differing explicit value', async () => {
    const router = setupTest({
      initial: { route: '/', search: { value: 'abc' } },
      middlewares: [stripSearchParams({ value: 'abc' })],
      linkSearch: { value: 'xyz' },
    })

    const linkSearch = await runTest(router, {
      root: {},
      posts: { value: 'xyz' },
    })

    expect(linkSearch.get('value')).toBe('xyz')
  })
})
