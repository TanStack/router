import * as Angular from '@angular/core'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'


import { trailingSlashOptions } from '@tanstack/router-core'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  injectErrorState,
  injectLoaderData,
  injectMatch,
  injectParams,
  injectRouterContext,
  injectSearch,
  redirect,
  retainSearchParams,
} from '../src'
import {
  getIntersectionObserverMock,
  getSearchParamsFromURI,
  sleep,
} from './utils'
import type { RouterHistory } from '../src'

const ioObserveMock = vi.fn()
const ioDisconnectMock = vi.fn()
let history: RouterHistory

beforeEach(() => {
  const io = getIntersectionObserverMock({
    observe: ioObserveMock,
    disconnect: ioDisconnectMock,
  })
  vi.stubGlobal('IntersectionObserver', io)
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  vi.resetAllMocks()
})

const WAIT_TIME = 300

describe('Link', () => {
  test('when a Link is disabled', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index</h1>
            <a [link]="{ to: '/posts', disabled: true }">Posts</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        @Angular.Component({
          template: '<h1>Posts</h1>',
          standalone: true,
        })
        class PostsComponent {}
        return PostsComponent
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(window.location.pathname).toBe('/')

    expect(postsLink.hasAttribute('disabled')).toBe(false)
    expect(postsLink.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(postsLink)

    await expect(
      screen.findByRole('header', { name: 'Posts' }),
    ).rejects.toThrow()
  })

  test('when a Link has children', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index</h1>
            <a [link]="{ to: '/posts' }">
              <button>Posts</button>
            </a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        @Angular.Component({
          template: '<h1>Posts</h1>',
          standalone: true,
        })
        class PostsComponent {}
        return PostsComponent
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const postsHeading = await screen.findByRole('heading', { name: 'Posts' })
    expect(postsHeading).toBeTruthy()
  })

  describe('when the current route has a search fields with undefined values', () => {
    @Angular.Component({
      imports: [Link],
      template: `
        <h1>Index</h1>
        <a [link]="{ to: '/', activeOptions: { exact: true } }">Index exact</a>
        <a [link]="{
          to: '/',
          search: { foo: undefined },
          activeOptions: { explicitUndefined: false }
        }">Index foo=undefined</a>
        <a [link]="{
          to: '/',
          search: { foo: undefined },
          activeOptions: { exact: true, explicitUndefined: false }
        }">Index foo=undefined-exact</a>
        <a [link]="{ to: '/', search: { foo: 'bar' } }">Index foo=bar</a>
      `,
      standalone: true,
    })
    class SearchUndefinedIndexExplicitFalseComponent {}

    @Angular.Component({
      imports: [Link],
      template: `
        <h1>Index</h1>
        <a [link]="{ to: '/', activeOptions: { exact: true } }">Index exact</a>
        <a [link]="{
          to: '/',
          search: { foo: undefined },
          activeOptions: { explicitUndefined: true }
        }">Index foo=undefined</a>
        <a [link]="{
          to: '/',
          search: { foo: undefined },
          activeOptions: { exact: true, explicitUndefined: true }
        }">Index foo=undefined-exact</a>
        <a [link]="{ to: '/', search: { foo: 'bar' } }">Index foo=bar</a>
      `,
      standalone: true,
    })
    class SearchUndefinedIndexExplicitTrueComponent {}

    async function runTest(opts: { explicitUndefined: boolean | undefined }) {
      const IndexComponent =
        opts.explicitUndefined === true
          ? SearchUndefinedIndexExplicitTrueComponent
          : SearchUndefinedIndexExplicitFalseComponent
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => IndexComponent,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      // round 1
      const indexExactLink = await screen.findByRole('link', {
        name: 'Index exact',
      })

      const indexFooUndefinedLink = await screen.findByRole('link', {
        name: 'Index foo=undefined',
      })

      const indexFooUndefinedExactLink = await screen.findByRole('link', {
        name: 'Index foo=undefined-exact',
      })

      const indexFooBarLink = await screen.findByRole('link', {
        name: 'Index foo=bar',
      })

      expect(window.location.pathname).toBe('/')

      expect(indexExactLink.getAttribute('href')).toBe('/')
      expect(indexExactLink.getAttribute('aria-current')).toBe('page')
      expect(indexExactLink.getAttribute('data-status')).toBe('active')

      if (opts.explicitUndefined) {
        expect(indexFooUndefinedLink.getAttribute('aria-current')).toBe('page')
        expect(indexFooUndefinedLink.getAttribute('data-status')).toBe('active')
      } else {
        expect(indexFooUndefinedLink.getAttribute('aria-current')).toBe('page')
        expect(indexFooUndefinedLink.getAttribute('data-status')).toBe('active')
      }

      expect(indexFooUndefinedLink.getAttribute('href')).toBe('/')

      if (opts.explicitUndefined) {
        expect(
          indexFooUndefinedExactLink.getAttribute('aria-current'),
        ).toBeNull()
        expect(
          indexFooUndefinedExactLink.getAttribute('data-status'),
        ).toBeNull()
      } else {
        expect(indexFooUndefinedExactLink.getAttribute('aria-current')).toBe(
          'page',
        )
        expect(indexFooUndefinedExactLink.getAttribute('data-status')).toBe(
          'active',
        )
      }

      expect(indexFooUndefinedExactLink.getAttribute('href')).toBe('/')

      expect(indexFooBarLink.getAttribute('href')).toBe('/?foo=bar')
      expect(indexFooBarLink.getAttribute('aria-current')).toBeNull()
      expect(indexFooBarLink.getAttribute('data-status')).toBeNull()

      // navigate to /?foo=bar
      fireEvent.click(indexFooBarLink)

      await waitFor(() => {
        expect(window.location.search).toBe('?foo=bar')
      })

      expect(indexExactLink.getAttribute('href')).toBe('/')
      expect(indexExactLink.getAttribute('aria-current')).toBeNull()
      expect(indexExactLink.getAttribute('data-status')).toBeNull()

      if (opts.explicitUndefined) {
        expect(indexFooUndefinedLink.getAttribute('aria-current')).toBeNull()
        expect(indexFooUndefinedLink.getAttribute('data-status')).toBeNull()
      } else {
        expect(indexFooUndefinedLink.getAttribute('aria-current')).toBe('page')
        expect(indexFooUndefinedLink.getAttribute('data-status')).toBe('active')
      }

      expect(indexFooUndefinedLink.getAttribute('href')).toBe('/')

      expect(indexFooUndefinedExactLink.getAttribute('href')).toBe('/')
      expect(indexFooUndefinedExactLink.getAttribute('aria-current')).toBeNull()
      expect(indexFooUndefinedExactLink.getAttribute('data-status')).toBeNull()

      expect(indexFooBarLink.getAttribute('href')).toBe('/?foo=bar')
      expect(indexFooBarLink.getAttribute('aria-current')).toBe('page')
      expect(indexFooBarLink.getAttribute('data-status')).toBe('active')
    }

    test.each([undefined, false])(
      'activeOptions.explicitUndefined=%s',
      async (explicitUndefined) => {
        await runTest({ explicitUndefined })
      },
    )

    test('activeOptions.explicitUndefined=true', async () => {
      await runTest({ explicitUndefined: true })
    })
  })

  test('when navigating to /posts with search', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index</h1>
            <a [link]="{ to: '/posts', search: { page: 0 } }">Posts</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const PostsComponent = () => {
      @Angular.Component({
        template: `
          <h1>Posts</h1>
          <span>Page: {{ search().page }}</span>
        `,
        standalone: true,
      })
      class PostsComponentClass {
        search = injectSearch({ strict: false })
      }
      return PostsComponentClass
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (input: Record<string, unknown>) => {
        return {
          page: input.page,
        }
      },
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink.getAttribute('href')).toBe('/posts?page=0')

    fireEvent.click(postsLink)

    const postsHeading = await screen.findByRole('heading', { name: 'Posts' })
    expect(postsHeading).toBeTruthy()

    expect(window.location.pathname).toBe('/posts')
    expect(window.location.search).toBe('?page=0')

    const pageZero = await screen.findByText('Page: 0')
    expect(pageZero).toBeTruthy()
  })

  test('when navigation to . from /posts while updating search from /', async () => {
    @Angular.Component({
      selector: 'nav-from-posts-root',
      imports: [Link, Outlet],
      template: `
        <div data-testid="root-nav">
          <a [link]="{ to: '.', search: { page: 2, filter: 'inactive' } }" data-testid="update-search">
            Update Search
          </a>
        </div>
        <outlet />
      `,
      standalone: true,
    })
    class NavFromPostsRootComponent {}

    @Angular.Component({
      selector: 'nav-from-posts-index',
      imports: [Link],
      template: `
        <h1>Index</h1>
        <a [link]="{ to: '/posts', search: { page: 1, filter: 'active' } }" data-testid="to-posts">
          Go to Posts
        </a>
      `,
      standalone: true,
    })
    class NavFromPostsIndexComponent {}

    @Angular.Component({
      selector: 'nav-from-posts-posts',
      template: `
        <h1>Posts</h1>
        <span data-testid="current-page">Page: {{ search().page }}</span>
        <span data-testid="current-filter">Filter: {{ search().filter }}</span>
      `,
      standalone: true,
    })
    class NavFromPostsPostsComponent {
      search = injectSearch({ strict: false })
    }

    const rootRoute = createRootRoute({
      component: () => NavFromPostsRootComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => NavFromPostsIndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (input: Record<string, unknown>) => {
        return {
          page: input.page ? Number(input.page) : 1,
          filter: (input.filter as string) || 'all',
        }
      },
      component: () => NavFromPostsPostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    // Start at index page
    const toPostsLink = await screen.findByTestId('to-posts')
    expect(toPostsLink.getAttribute('href')).toBe('/posts?page=1&filter=active')

    // Navigate to posts with initial search params
    fireEvent.click(toPostsLink)

    // Verify we're on posts with initial search
    const postsHeading = await screen.findByRole('heading', { name: 'Posts' })
    expect(postsHeading).toBeTruthy()
    expect(window.location.pathname).toBe('/posts')
    expect(window.location.search).toBe('?page=1&filter=active')

    const currentPage = await screen.findByTestId('current-page')
    const currentFilter = await screen.findByTestId('current-filter')
    expect(currentPage.textContent).toBe('Page: 1')
    expect(currentFilter.textContent).toBe('Filter: active')

    // Navigate to current route (.) with updated search
    const updateSearchLink = await screen.findByTestId('update-search')
    expect(updateSearchLink.getAttribute('href')).toBe(
      '/posts?page=2&filter=inactive',
    )

    await fireEvent.click(updateSearchLink)

    // Wait for navigation to complete and search params to update
    await waitFor(() => {
      expect(window.location.search).toBe('?page=2&filter=inactive')
    })

    // Wait for the component to re-render with updated search params
    await waitFor(() => {
      const updatedPage = screen.getByTestId('current-page')
      const updatedFilter = screen.getByTestId('current-filter')
      expect(updatedPage.textContent).toBe('Page: 2')
      expect(updatedFilter.textContent).toBe('Filter: inactive')
    })

    // Verify search was updated
    expect(window.location.pathname).toBe('/posts')
    expect(window.location.search).toBe('?page=2&filter=inactive')
  })

  test('when navigating to /posts with params', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index</h1>
            <a [link]="{ to: '/posts/$postId', params: { postId: 'id1' } }">
              To first post
            </a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const PostsComponent = () => {
      @Angular.Component({
        imports: [Link, Outlet],
        template: `
          <h1>Posts</h1>
          <a [link]="{ to: '/' }">Index</a>
          <outlet />
        `,
        standalone: true,
      })
      class PostsComponentClass {}
      return PostsComponentClass
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      @Angular.Component({
        template: '<span>Params: {{ params().postId }}</span>',
        standalone: true,
      })
      class PostComponentClass {
        params = injectParams({ strict: false })
      }
      return PostComponentClass
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postRoute]),
      ]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink.getAttribute('href')).toBe('/posts/id1')

    fireEvent.click(postLink)

    const paramText = await screen.findByText('Params: id1')
    expect(paramText).toBeTruthy()
  })

  test('when navigating to /posts with a loader', async () => {
    const loader = vi.fn((opts) => {
      return Promise.resolve({ pageDoubled: opts.deps.page.page * 2 })
    })
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index</h1>
            <a [link]="{ to: '/posts', search: { page: 2 } }">Posts</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const PostsComponent = () => {
      @Angular.Component({
        template: `
          <h1>Posts</h1>
          <span>Page: {{ data().pageDoubled }}</span>
        `,
        standalone: true,
      })
      class PostsComponentClass {
        data = injectLoaderData({ strict: false })
      }
      return PostsComponentClass
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (input: Record<string, unknown>) => {
        const page = Number(input.page)

        if (isNaN(page)) throw Error('Not a number!')

        return {
          page,
        }
      },
      loaderDeps: (opts) => ({ page: opts.search }),
      loader: loader,
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink.getAttribute('href')).toBe('/posts?page=2')

    fireEvent.click(postsLink)

    const pageFour = await screen.findByText('Page: 4')
    expect(pageFour).toBeTruthy()

    expect(loader).toHaveBeenCalledOnce()
  })

  test('when navigating to /posts with invalid search', async () => {
    const rootRoute = createRootRoute()
    const onError = vi.fn()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index</h1>
            <a [link]="{ to: '/posts', search: { page: 'invalid' } }">Posts</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const PostsComponent = () => {
      @Angular.Component({
        template: `
          <h1>Posts</h1>
          <span>Page: {{ search().page }}</span>
        `,
        standalone: true,
      })
      class PostsComponentClass {
        search = injectSearch({ strict: false })
      }
      return PostsComponentClass
    }

    const ErrorComponent = () => {
      @Angular.Component({
        template: '<h1>Oops, something went wrong</h1>',
        standalone: true,
      })
      class ErrorComponentClass {}
      return ErrorComponentClass
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      errorComponent: ErrorComponent,
      onError,
      validateSearch: (input: Record<string, unknown>) => {
        const page = Number(input.page)

        if (isNaN(page)) throw Error('Not a number!')

        return {
          page,
        }
      },
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink.getAttribute('href')).toBe('/posts?page=invalid')

    fireEvent.click(postsLink)

    await waitFor(() => expect(onError).toHaveBeenCalledOnce())

    const errorHeading = await screen.findByRole('heading', {
      name: 'Oops, something went wrong',
    })
    expect(errorHeading).toBeTruthy()
  })

  test('when navigating to /posts with a loader that errors', async () => {
    const onError = vi.fn()
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index</h1>
            <a [link]="{ to: '/posts', search: { page: 2 } }">Posts</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const PostsComponent = () => {
      @Angular.Component({
        template: `
          <h1>Posts</h1>
          <span>Page: {{ loader().pageDoubled }}</span>
        `,
        standalone: true,
      })
      class PostsComponentClass {
        loader = injectLoaderData({ strict: false })
      }
      return PostsComponentClass
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (input: Record<string, unknown>) => {
        const page = Number(input.page)

        if (isNaN(page)) throw Error('Not a number!')

        return {
          page,
        }
      },
      loaderDeps: (opts) => ({ page: opts.search }),
      onError,
      errorComponent: () => {
        @Angular.Component({
          template: '<span>Something went wrong!</span>',
          standalone: true,
        })
        class ErrorComponent {}
        return ErrorComponent
      },
      loader: () => {
        throw new Error()
      },
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink.getAttribute('href')).toBe('/posts?page=2')

    fireEvent.click(postsLink)

    const errorText = await screen.findByText('Something went wrong!')
    expect(errorText).toBeTruthy()

    expect(onError).toHaveBeenCalledOnce()
  })

  test('when navigating away from a route with a loader that errors', async () => {
    @Angular.Component({
      selector: 'loader-error-root',
      imports: [Link, Outlet],
      template: `
        <div>
          <a [link]="{ to: '/' }">Index</a> <a [link]="{ to: '/posts' }">Posts</a>
        </div>
        <hr />
        <outlet />
      `,
      standalone: true,
    })
    class LoaderErrorRootComponent {}

    @Angular.Component({
      selector: 'loader-error-index',
      template: '<h1>Index</h1>',
      standalone: true,
    })
    class LoaderErrorIndexComponent {}

    @Angular.Component({
      selector: 'loader-error-index-error',
      template: '<span>IndexError</span>',
      standalone: true,
    })
    class LoaderErrorIndexErrorComponent {}

    @Angular.Component({
      selector: 'loader-error-posts-error',
      template: '<span>PostsError</span>',
      standalone: true,
    })
    class LoaderErrorPostsErrorComponent {}

    @Angular.Component({
      selector: 'loader-error-posts',
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class LoaderErrorPostsComponent {}

    const postsOnError = vi.fn()
    const indexOnError = vi.fn()
    const rootRoute = createRootRoute({
      component: () => LoaderErrorRootComponent,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => LoaderErrorIndexComponent,
      onError: indexOnError,
      errorComponent: () => LoaderErrorIndexErrorComponent,
    })

    const error = new Error('Something went wrong!')

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      loaderDeps: (opts) => ({ page: opts.search }),
      loader: () => {
        throw error
      },
      onError: postsOnError,
      errorComponent: () => LoaderErrorPostsErrorComponent,
      component: () => LoaderErrorPostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    await sleep(WAIT_TIME)

    const postsErrorText = await screen.findByText('PostsError')
    expect(postsErrorText).toBeTruthy()

    expect(postsOnError).toHaveBeenCalledOnce()
    expect(postsOnError).toHaveBeenCalledWith(error)

    const indexLink = await screen.findByRole('link', { name: 'Index' })
    fireEvent.click(indexLink)
    await sleep(WAIT_TIME)
    await expect(screen.findByText('IndexError')).rejects.toThrow()
    expect(indexOnError).not.toHaveBeenCalledOnce()
  })

  test('when navigating to /posts with a beforeLoad that redirects', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index</h1>
            <a [link]="{ to: '/posts', search: { page: 2 } }">Posts</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const PostsComponent = () => {
      @Angular.Component({
        template: '<h1>Posts</h1>',
        standalone: true,
      })
      class PostsComponentClass {}
      return PostsComponentClass
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      beforeLoad: () => {
        throw redirect({
          to: '/login',
        })
      },
      component: PostsComponent,
    })

    const authRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'login',
      component: () => {
        @Angular.Component({
          template: '<h1>Auth!</h1>',
          standalone: true,
        })
        class AuthComponent {}
        return AuthComponent
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute, authRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const authText = await screen.findByText('Auth!')
    expect(authText).toBeTruthy()
  })

  test('when navigating to /posts with a beforeLoad that returns context', async () => {
    const rootRoute = createRootRouteWithContext<{
      userId: string
    }>()()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index</h1>
            <a [link]="{ to: '/posts' }">Posts</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const PostsComponent = () => {
      @Angular.Component({
        template: `
          <h1>Posts</h1>
          <span>UserId: {{ context().userId }}</span>
          <span>Username: {{ context().username }}</span>
        `,
        standalone: true,
      })
      class PostsComponentClass {
        context = injectRouterContext({ strict: false })
      }
      return PostsComponentClass
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      beforeLoad: () => {
        return Promise.resolve({
          username: 'username',
        })
      },
      component: PostsComponent,
    })

    const router = createRouter({
      context: { userId: 'userId' },
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const userId = await screen.findByText('UserId: userId')
    expect(userId).toBeTruthy()
  })

  test('when navigating to /posts with a beforeLoad that throws an error', async () => {
    const onError = vi.fn()
    const rootRoute = createRootRoute()
    @Angular.Component({
      imports: [Link],
      template: `
        <h1>Index</h1>
        <a [link]="{ to: '/posts' }">Posts</a>
      `,
      standalone: true,
    })
    class IndexComponent {}
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    @Angular.Component({
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class PostsComponentClass {}

    @Angular.Component({
      template: '<span>Oops! Something went wrong!</span>',
      standalone: true,
    })
    class ErrorComponent {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      beforeLoad: () => {
        throw new Error('Oops. Something went wrong!')
      },
      onError,
      errorComponent: () => ErrorComponent,
      component: () => PostsComponentClass,
    })

    const router = createRouter({
      context: { userId: 'userId' },
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const errorText = await screen.findByText('Oops! Something went wrong!')
    expect(errorText).toBeTruthy()

    expect(onError).toHaveBeenCalledOnce()
  })

  test('when navigating to /posts with a beforeLoad that throws an error bubbles to the root', async () => {
    @Angular.Component({
      template: '<span>Oops! Something went wrong!</span>',
      standalone: true,
    })
    class ErrorComponent {}

    const rootRoute = createRootRoute({
      errorComponent: () => ErrorComponent,
    })

    @Angular.Component({
      imports: [Link],
      template: `
        <h1>Index</h1>
        <a [link]="{ to: '/posts' }">Posts</a>
      `,
      standalone: true,
    })
    class IndexComponent {}
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    @Angular.Component({
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class PostsComponentClass {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      beforeLoad: () => {
        throw new Error('Oops. Something went wrong!')
      },
      component: () => PostsComponentClass,
    })

    const router = createRouter({
      context: { userId: 'userId' },
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    // Wait for the error to be processed and error component to render
    const errorText = await screen.findByText(
      'Oops! Something went wrong!',
      {},
      { timeout: 2000 },
    )
    expect(errorText).toBeTruthy()
  })

  test('when navigating to /posts with a beforeLoad that throws an error bubbles to the nearest parent', async () => {
    @Angular.Component({
      template: '<span>Root error</span>',
      standalone: true,
    })
    class ErrorComponent {}
    const rootRoute = createRootRoute({
      errorComponent: () => ErrorComponent,
    })

    @Angular.Component({
      imports: [Link],
      template: `
        <h1>Index</h1>
        <a [link]="{ to: '/posts/$postId', params: { postId: 'id1' } }">Post</a>
      `,
      standalone: true,
    })
    class IndexComponent {}

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    @Angular.Component({
      imports: [Outlet],
      template: `
        <h1>Posts</h1>
        <outlet />
      `,
      standalone: true,
    })
    class PostsComponentClass {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      errorComponent: () => {
        @Angular.Component({
          template: '<span>Oops! Something went wrong!</span>',
          standalone: true,
        })
        class ErrorComponent {}
        return ErrorComponent
      },
      component: () => PostsComponentClass,
    })

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      beforeLoad: () => {
        throw new Error('Oops. Something went wrong!')
      },
    })

    const router = createRouter({
      context: { userId: 'userId' },
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postRoute]),
      ]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postLink = await screen.findByRole('link', { name: 'Post' })

    fireEvent.click(postLink)

    // Wait for the error to be processed and error component to render
    const errorText = await screen.findByText(
      'Oops! Something went wrong!',
      {},
      { timeout: 2000 },
    )
    expect(errorText).toBeTruthy()
  })

  test('when navigating from /posts to ./$postId', async () => {
    @Angular.Component({
      selector: 'posts-to-postid-index',
      imports: [Link],
      template: `
        <h1>Index</h1>
        <a [link]="{ to: '/posts' }">Posts</a>
        <a [link]="{ to: '/posts/$postId', params: { postId: 'id1' } }">To first post</a>
      `,
      standalone: true,
    })
    class PostsToPostIdIndexComponent {}

    @Angular.Component({
      selector: 'posts-to-postid-posts',
      imports: [Outlet],
      template: `
        <h1>Posts</h1>
        <outlet />
      `,
      standalone: true,
    })
    class PostsToPostIdPostsComponent {}

    @Angular.Component({
      selector: 'posts-to-postid-posts-index',
      imports: [Link],
      template: `
        <h1>Posts Index</h1>
        <a [link]="{ from: '/posts/', to: './$postId', params: { postId: 'id1' } }">To the first post</a>
      `,
      standalone: true,
    })
    class PostsToPostIdPostsIndexComponent {}

    @Angular.Component({
      selector: 'posts-to-postid-post',
      imports: [Link],
      template: `
        <span>Params: {{ params().postId }}</span>
        <a [link]="{ to: '/' }">Index</a>
      `,
      standalone: true,
    })
    class PostsToPostIdPostComponent {
      params = injectParams({ strict: false })
    }

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => PostsToPostIdIndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: () => PostsToPostIdPostsComponent,
    })

    const postsIndexRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '/',
      component: () => PostsToPostIdPostsIndexComponent,
    })

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: () => PostsToPostIdPostComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postsIndexRoute, postRoute]),
      ]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink.getAttribute('href')).toBe('/posts')

    fireEvent.click(postsLink)

    const postsText = await screen.findByText('Posts Index')
    expect(postsText).toBeTruthy()

    const postLink = await screen.findByRole('link', {
      name: 'To the first post',
    })

    expect(postLink.getAttribute('href')).toBe('/posts/id1')

    fireEvent.click(postLink)

    const paramText = await screen.findByText('Params: id1')
    expect(paramText).toBeTruthy()

    expect(window.location.pathname).toBe('/posts/id1')
  })

  test('when navigating from /posts/$postId to "/"', async () => {
    @Angular.Component({
      imports: [Link, Outlet],
      template: `
        <a [link]="{ to: '/' }" data-testid="home-link">Home</a>
        <a [link]="{ to: '/posts' }" data-testid="posts-link">Posts</a>
        <outlet />
      `,
      standalone: true,
    })
    class RootComponent {}
    const rootRoute = createRootRoute({
      component: () => RootComponent,
    })

    @Angular.Component({
      template: '<h1 data-testid="home-heading">Index</h1>',
      standalone: true,
    })
    class IndexComponent {}

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    @Angular.Component({
      imports: [Link, Outlet],
      template: `
        <h1>Posts</h1>
        <a [link]="{ to: '/posts/$postId', params: { postId: 'id1' } }" data-testid="post1-link">
          To first post
        </a>
        <outlet />
      `,
      standalone: true,
    })
    class PostsComponentClass {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: () => PostsComponentClass,
    })

    const PostsIndexComponent = () => {
      @Angular.Component({
        template: '<h1 data-testid="posts-index-heading">Posts Index</h1>',
        standalone: true,
      })
      class PostsIndexComponentClass {}
      return PostsIndexComponentClass
    }

    const postsIndexRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '/',
      component: PostsIndexComponent,
    })

    const PostComponent = () => {
      @Angular.Component({
        template:
          '<span data-testid="post-param">Params: {{ params().postId }}</span>',
        standalone: true,
      })
      class PostComponentClass {
        params = injectParams({ strict: false })
      }
      return PostComponentClass
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postsIndexRoute, postRoute]),
      ]),
      history,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByTestId('posts-link')

    expect(postsLink.getAttribute('href')).toBe('/posts')

    fireEvent.click(postsLink)

    const postsText = await screen.findByTestId('posts-index-heading')
    expect(postsText).toBeTruthy()

    const postLink = await screen.findByTestId('post1-link')

    expect(postLink.getAttribute('href')).toBe('/posts/id1')

    fireEvent.click(postLink)

    const paramText = await screen.findByTestId('post-param')
    expect(paramText).toBeTruthy()

    expect(window.location.pathname).toBe('/posts/id1')

    const homeLink = await screen.findByTestId('home-link')

    const consoleWarnSpy = vi.spyOn(console, 'warn')

    fireEvent.click(homeLink)

    const homeHeading = await screen.findByTestId('home-heading')

    expect(window.location.pathname).toBe('/')
    expect(homeHeading).toBeTruthy()

    expect(consoleWarnSpy).not.toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })

  test('when navigating from /posts to ../posts/$postId', async () => {
    @Angular.Component({
      selector: 'posts-to-parent-postid-index',
      imports: [Link],
      template: `
        <h1>Index</h1>
        <a [link]="{ to: '/posts' }">Posts</a>
        <a [link]="{ to: '/posts/$postId', params: { postId: 'id1' } }">To first post</a>
      `,
      standalone: true,
    })
    class PostsToParentPostIdIndexComponent {}

    @Angular.Component({
      selector: 'posts-to-parent-postid-posts',
      imports: [Outlet],
      template: `
        <h1>Posts</h1>
        <outlet />
      `,
      standalone: true,
    })
    class PostsToParentPostIdPostsComponent {}

    @Angular.Component({
      selector: 'posts-to-parent-postid-posts-index',
      imports: [Link],
      template: `
        <h1>Posts Index</h1>
        <a [link]="{ from: '/posts/', to: '../posts/$postId', params: { postId: 'id1' } }">To the first post</a>
      `,
      standalone: true,
    })
    class PostsToParentPostIdPostsIndexComponent {}

    @Angular.Component({
      selector: 'posts-to-parent-postid-post',
      imports: [Link],
      template: `
        <span>Params: {{ params().postId }}</span>
        <a [link]="{ to: '/' }">Index</a>
      `,
      standalone: true,
    })
    class PostsToParentPostIdPostComponent {
      params = injectParams({ strict: false })
    }

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => PostsToParentPostIdIndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: () => PostsToParentPostIdPostsComponent,
    })

    const postsIndexRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '/',
      component: () => PostsToParentPostIdPostsIndexComponent,
    })

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: () => PostsToParentPostIdPostComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postsIndexRoute, postRoute]),
      ]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink.getAttribute('href')).toBe('/posts')

    fireEvent.click(postsLink)

    const postsIndexText = await screen.findByText('Posts Index')
    expect(postsIndexText).toBeTruthy()

    const postLink = await screen.findByRole('link', {
      name: 'To the first post',
    })

    expect(postLink.getAttribute('href')).toBe('/posts/id1')

    fireEvent.click(postLink)

    const paramText = await screen.findByText('Params: id1')
    expect(paramText).toBeTruthy()
  })

  test('when navigating from /posts to /invoices with conditionally rendering Link on the root', async () => {
    @Angular.Component({
      template: '<div>Something went wrong!</div>',
      standalone: true,
    })
    class ConditionalLinksErrorComponent {}

    const ErrorComponent = vi.fn(() => ConditionalLinksErrorComponent)

    @Angular.Component({
      selector: 'root-component-conditional-links',
      imports: [Link, Outlet],
      template: `
        @if (matchPosts()) {
          <a [link]="{ from: '/posts', to: '/posts' }">From posts</a>
        }
        @if (matchInvoices()) {
          <a [link]="{ from: '/invoices', to: '/invoices' }">From invoices</a>
        }
        <outlet />
      `,
      standalone: true,
    })
    class ConditionalLinksRootComponent {
      matchPosts = injectMatch({ from: '/posts', shouldThrow: false })
      matchInvoices = injectMatch({ from: '/invoices', shouldThrow: false })
    }

    @Angular.Component({
      selector: 'index-component-conditional',
      imports: [Link],
      template: `
        <h1>Index Route</h1>
        <a [link]="{ to: '/posts' }">Go to posts</a>
      `,
      standalone: true,
    })
    class ConditionalLinksIndexComponent {}

    @Angular.Component({
      selector: 'posts-component-conditional',
      imports: [Link],
      template: `
        <h1>On Posts</h1>
        <a [link]="{ to: '/invoices' }">To invoices</a>
      `,
      standalone: true,
    })
    class ConditionalLinksPostsComponent {}

    @Angular.Component({
      selector: 'invoices-component-conditional',
      imports: [Link],
      template: `
        <h1>On Invoices</h1>
        <a [link]="{ to: '/posts' }">To posts</a>
      `,
      standalone: true,
    })
    class ConditionalLinksInvoicesComponent {}

    const rootRoute = createRootRoute({
      component: () => ConditionalLinksRootComponent,
      errorComponent: ErrorComponent as any,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => ConditionalLinksIndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: () => ConditionalLinksPostsComponent,
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      component: () => ConditionalLinksInvoicesComponent,
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      postsRoute,
      invoicesRoute,
    ])

    const router = createRouter({
      routeTree,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsLink = await screen.findByRole('link', { name: 'Go to posts' })

    fireEvent.click(postsLink)

    const fromPostsLink = await screen.findByRole('link', {
      name: 'From posts',
    })

    expect(fromPostsLink).toBeTruthy()

    const toInvoicesLink = await screen.findByRole('link', {
      name: 'To invoices',
    })

    fireEvent.click(toInvoicesLink)

    const fromInvoicesLink = await screen.findByRole('link', {
      name: 'From invoices',
    })

    expect(fromInvoicesLink).toBeTruthy()

    // Query for 'From posts' link again after navigation - it should not exist
    expect(screen.queryByRole('link', { name: 'From posts' })).toBeNull()

    const toPostsLink = await screen.findByRole('link', {
      name: 'To posts',
    })

    fireEvent.click(toPostsLink)

    const onPostsText = await screen.findByText('On Posts')
    expect(onPostsText).toBeTruthy()

    // Query for 'From invoices' link again after navigation - it should not exist
    expect(screen.queryByRole('link', { name: 'From invoices' })).toBeNull()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when linking to self with from prop set and param containing a slash', async () => {
    const ErrorComponent = vi.fn(() => {
      @Angular.Component({
        template: '<h1>Something went wrong!</h1>',
        standalone: true,
      })
      class ErrorComponentClass {}
      return ErrorComponentClass
    })

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent as any,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <a [link]="{ to: '/$postId', params: { postId: 'id/with-slash' } }">Go to post</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/$postId',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <a [link]="{ from: '/$postId', to: '/$postId' }">Link to self with from prop set</a>
          `,
          standalone: true,
        })
        class PostComponent {}
        return PostComponent
      },
    })

    const routeTree = rootRoute.addChildren([indexRoute, postRoute])
    const router = createRouter({ routeTree })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postLink = await screen.findByRole('link', {
      name: 'Go to post',
    })

    expect(postLink.getAttribute('href')).toBe('/id%2Fwith-slash')

    fireEvent.click(postLink)

    const selfLink = await screen.findByRole('link', {
      name: 'Link to self with from prop set',
    })

    expect(selfLink).toBeTruthy()
    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating to /$postId with parseParams and stringifyParams', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <a [link]="{ to: '/$postId', params: { postId: 2 } }">Go to post</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    let parseParams: any
    let stringifyParams: any

    const PostComponent = () => {
      @Angular.Component({
        template: '<div>Post: {{ params().postId }}</div>',
        standalone: true,
      })
      class PostComponentClass {
        params = injectParams({ strict: false })
      }
      return PostComponentClass
    }

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '$postId',
      parseParams: (params) => {
        parseParams = structuredClone(params) // clone object, because source will get mutated
        return {
          status: 'parsed',
          postId: params.postId,
        }
      },
      stringifyParams: (params) => {
        stringifyParams = structuredClone(params) // clone object, because source will get mutated
        return {
          status: 'stringified',
          postId: params.postId,
        }
      },
      component: PostComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, postRoute])
    const router = createRouter({ routeTree })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postLink = await screen.findByRole('link', {
      name: 'Go to post',
    })

    expect(stringifyParams).toEqual({ postId: 2 })

    expect(postLink.getAttribute('href')).toBe('/2')

    fireEvent.click(postLink)

    const posts2Text = await screen.findByText('Post: 2')
    expect(posts2Text).toBeTruthy()

    expect(parseParams).toEqual({ postId: '2' })
  })

  test('when navigating to /$postId with params.parse and params.stringify', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <a [link]="{ to: '/$postId', params: { postId: 2 } }">Go to post</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    let parseParams: any
    let stringifyParams: any

    const PostComponent = () => {
      @Angular.Component({
        template: '<div>Post: {{ params().postId }}</div>',
        standalone: true,
      })
      class PostComponentClass {
        params = injectParams({ strict: false })
      }
      return PostComponentClass
    }

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '$postId',
      params: {
        parse: (params) => {
          parseParams = structuredClone(params) // clone object, because source will get mutated
          return {
            status: 'parsed',
            postId: params.postId,
          }
        },
        stringify: (params) => {
          stringifyParams = structuredClone(params) // clone object, because source will get mutated
          return {
            status: 'stringified',
            postId: params.postId,
          }
        },
      },
      component: PostComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, postRoute])
    const router = createRouter({ routeTree })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postLink = await screen.findByRole('link', {
      name: 'Go to post',
    })

    expect(stringifyParams).toEqual({ postId: 2 })

    expect(postLink.getAttribute('href')).toBe('/2')

    fireEvent.click(postLink)

    const posts2Text = await screen.findByText('Post: 2')
    expect(posts2Text).toBeTruthy()

    expect(parseParams).toEqual({ postId: '2' })
  })

  test('when navigating to /$postId with params.parse and params.stringify handles falsey inputs', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <a [link]="{ to: '/$postId', params: { postId: 2 } }">Go to post 2</a>
            <a [link]="{ to: '/$postId', params: { postId: 0 } }">Go to post 0</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    const stringifyParamsMock = vi.fn()

    const parseParams = ({ postId }: { postId: string }) => {
      return {
        postId: parseInt(postId),
      }
    }

    const stringifyParams = ({ postId }: { postId: number }) => {
      stringifyParamsMock({ postId })
      return {
        postId: postId.toString(),
      }
    }

    const PostComponent = () => {
      @Angular.Component({
        template: '<div>Post: {{ params().postId }}</div>',
        standalone: true,
      })
      class PostComponentClass {
        params = injectParams({ strict: false })
      }
      return PostComponentClass
    }

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '$postId',
      params: {
        parse: parseParams,
        stringify: stringifyParams,
      },
      component: PostComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, postRoute])
    const router = createRouter({ routeTree })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postLink2 = await screen.findByRole('link', {
      name: 'Go to post 2',
    })
    const postLink0 = await screen.findByRole('link', {
      name: 'Go to post 0',
    })

    expect(postLink2.getAttribute('href')).toBe('/2')
    expect(postLink0.getAttribute('href')).toBe('/0')

    expect(stringifyParamsMock).toHaveBeenCalledWith({ postId: 2 })
    expect(stringifyParamsMock).toHaveBeenCalledWith({ postId: 0 })
  })

  test.each([false, 'intent', 'render'] as const)(
    'Router.preload="%s", should not trigger the IntersectionObserver\'s observe and disconnect methods',
    async (preload) => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          @Angular.Component({
            imports: [Link],
            template: `
              <h1>Index Heading</h1>
              <a [link]="{ to: '/' }">Index Link</a>
            `,
            standalone: true,
          })
          class IndexComponent {}
          return IndexComponent
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        defaultPreload: preload,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      const indexLink = await screen.findByRole('link', { name: 'Index Link' })
      expect(indexLink).toBeTruthy()

      expect(ioObserveMock).not.toBeCalled()
      expect(ioDisconnectMock).not.toBeCalled()
    },
  )

  test.each([false, 'intent', 'viewport', 'render'] as const)(
    'Router.preload="%s" with Link.preload="false", should not trigger the IntersectionObserver\'s observe method',
    async (preload) => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          @Angular.Component({
            imports: [Link],
            template: `
              <h1>Index Heading</h1>
              <a [link]="{ to: '/', preload: false }">Index Link</a>
            `,
            standalone: true,
          })
          class IndexComponent {}
          return IndexComponent
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        defaultPreload: preload,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      const indexLink = await screen.findByRole('link', { name: 'Index Link' })
      expect(indexLink).toBeTruthy()

      expect(ioObserveMock).not.toBeCalled()
    },
  )

  test('Router.preload="viewport", should trigger the IntersectionObserver\'s observe and disconnect methods', async () => {
    const rootRoute = createRootRoute()
    const RouteComponent = () => {
      @Angular.Component({
        imports: [Link],
        template: `
          <h1>Index Heading</h1>
          <output>{{ count() }}</output>
          <button (click)="increment()">Render</button>
          <a [link]="{ to: '/' }">Index Link</a>
        `,
        standalone: true,
      })
      class RouteComponentClass {
        count = Angular.signal(0)
        increment() {
          this.count.set(this.count() + 1)
        }
      }
      return RouteComponentClass
    }
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: RouteComponent as any,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      defaultPreload: 'viewport',
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const indexLink = await screen.findByRole('link', { name: 'Index Link' })
    expect(indexLink).toBeTruthy()

    expect(ioObserveMock).toHaveBeenCalledOnce()
    expect(ioDisconnectMock).not.toHaveBeenCalled()

    const output = screen.getByRole('status')
    expect(output.textContent).toBe('0')

    const button = screen.getByRole('button', { name: 'Render' })
    fireEvent.click(button)
    await waitFor(() => {
      expect(output.textContent).toBe('1')
    })
    expect(ioObserveMock).toHaveBeenCalledOnce() // it should not observe again
    expect(ioDisconnectMock).not.toHaveBeenCalled() // it should not disconnect again
  })

  test("Router.preload='render', should trigger the route loader on render", async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => {
        mock()
      },
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>Index Heading</h1>
            <a [link]="{ to: '/about' }">About Link</a>
          `,
          standalone: true,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => {
        @Angular.Component({
          template: '<h1>About Heading</h1>',
          standalone: true,
        })
        class AboutComponent {}
        return AboutComponent
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([aboutRoute, indexRoute]),
      defaultPreload: 'render',
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const aboutLink = await screen.findByRole('link', { name: 'About Link' })
    expect(aboutLink).toBeTruthy()

    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('Router.preload="intent", pendingComponent renders during unresolved route loader', async () => {
    @Angular.Component({
      selector: 'preload-intent-index',
      imports: [Link],
      template: `
        <div>
          <h1>Index page</h1>
          <a [link]="{ to: '/posts', preload: 'intent' }">link to posts</a>
        </div>
      `,
      standalone: true,
    })
    class PreloadIntentIndexComponent {}

    @Angular.Component({
      selector: 'preload-intent-post',
      template: '<div>Posts page</div>',
      standalone: true,
    })
    class PreloadIntentPostComponent {}

    @Angular.Component({
      selector: 'preload-intent-pending',
      template: '<p>Loading...</p>',
      standalone: true,
    })
    class PreloadIntentPendingComponent {}

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => PreloadIntentIndexComponent,
    })

    const postRoute = createRoute({
      ssr: false,
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: () => sleep(WAIT_TIME),
      component: () => PreloadIntentPostComponent,
    })

    const routeTree = rootRoute.addChildren([postRoute, indexRoute])
    const router = createRouter({
      routeTree,
      defaultPreload: 'intent',
      defaultPendingMs: 200,
      defaultPendingComponent: () => PreloadIntentPendingComponent,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const linkToPosts = await screen.findByRole('link', {
      name: 'link to posts',
    })
    expect(linkToPosts).toBeTruthy()

    fireEvent.focus(linkToPosts)
    fireEvent.click(linkToPosts)

    const loadingElement = await screen.findByText('Loading...')
    expect(loadingElement).toBeTruthy()

    const postsElement = await screen.findByText('Posts page')
    expect(postsElement).toBeTruthy()

    expect(window.location.pathname).toBe('/posts')
  })

  describe('when preloading a link, `preload` should be', () => {
    @Angular.Component({
      imports: [Link, Outlet],
      template: `
        <a [link]="{ to: '/posts/$postId', params: { postId: 'id1' } }" data-testid="link-1">
          To first post
        </a>
        <a [link]="{ to: '/posts/$postId', params: { postId: 'id2' } }" data-testid="link-2">
          To second post
        </a>
        <outlet />
      `,
      standalone: true,
    })
    class PreloadRootComponent {}

    @Angular.Component({
      template: '<h1>Index</h1>',
      standalone: true,
    })
    class PreloadIndexComponent {}

    @Angular.Component({
      imports: [Outlet],
      template: `
        <h1>Posts</h1>
        <outlet />
      `,
      standalone: true,
    })
    class PreloadPostsComponent {}

    @Angular.Component({
      template: '<span>Params: {{ params().postId }}</span>',
      standalone: true,
    })
    class PreloadPostComponent {
      params = injectParams({ strict: false })
    }

    async function runTest({
      expectedPreload,
      testIdToHover,
    }: {
      expectedPreload: boolean
      testIdToHover: string
    }) {
      const rootRoute = createRootRoute({
        component: () => PreloadRootComponent,
      })

      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => PreloadIndexComponent,
      })

      const postsBeforeLoadFn = vi.fn()
      const postsLoaderFn = vi.fn()

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'posts',
        component: () => PreloadPostsComponent,
        beforeLoad: postsBeforeLoadFn,
        loader: postsLoaderFn,
      })

      const postBeforeLoadFn = vi.fn()
      const postLoaderFn = vi.fn()

      const postRoute = createRoute({
        getParentRoute: () => postsRoute,
        path: '$postId',
        component: () => PreloadPostComponent,
        beforeLoad: postBeforeLoadFn,
        loader: postLoaderFn,
      })

      const routeTree = rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postRoute]),
      ])

      const router = createRouter({
        routeTree,
        defaultPreload: 'intent',
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })
      const link = await screen.findByTestId(testIdToHover)
      fireEvent.mouseOver(link)

      const expected = expect.objectContaining({ preload: expectedPreload })
      await waitFor(() =>
        expect(postsBeforeLoadFn).toHaveBeenCalledWith(expected),
      )
      await waitFor(() => expect(postsLoaderFn).toHaveBeenCalledWith(expected))

      await waitFor(() =>
        expect(postBeforeLoadFn).toHaveBeenCalledWith(expected),
      )
      await waitFor(() => expect(postLoaderFn).toHaveBeenCalledWith(expected))
    }
    test('`true` when on / and hovering `/posts/id1` ', async () => {
      await runTest({ expectedPreload: true, testIdToHover: 'link-1' })
    })

    test('`false` when on `/posts/id1` and hovering `/posts/id1`', async () => {
      window.history.replaceState(null, 'root', '/posts/id1')
      await runTest({ expectedPreload: false, testIdToHover: 'link-1' })
    })

    test('`true` when on `/posts/id1` and hovering `/posts/id2`', async () => {
      window.history.replaceState(null, 'root', '/posts/id1')
      await runTest({ expectedPreload: false, testIdToHover: 'link-2' })
    })
  })

  describe('relative links with basepath', () => {
    @Angular.Component({
      template: '<h1>Index Route</h1>',
      standalone: true,
    })
    class RelativeLinksIndexComponent {}

    @Angular.Component({
      imports: [Outlet],
      template: `
        <h1>A Route</h1>
        <outlet />
      `,
      standalone: true,
    })
    class RelativeLinksARouteComponent {}

    @Angular.Component({
      imports: [Link],
      template: `
        <h1>B Route</h1>
        <a [link]="{ to: '..' }">Link to Parent</a>
      `,
      standalone: true,
    })
    class RelativeLinksBRouteComponent {}

    @Angular.Component({
      imports: [Link, Outlet],
      template: `
        <h1>Param Route</h1>
        <a [link]="{ from: '/param/$param', to: './a' }">Link to ./a</a>
        <a [link]="{ to: 'c', unsafeRelative: 'path' }">Link to c</a>
        <a [link]="{ to: '../c', unsafeRelative: 'path' }">Link to ../c</a>
        <outlet />
      `,
      standalone: true,
    })
    class RelativeLinksParamRouteComponent {}

    @Angular.Component({
      imports: [Link, Outlet],
      template: `
        <h1>Param A Route</h1>
        <a [link]="{ from: '/param/$param/a', to: '..' }">Link to .. from /param/foo/a</a>
        <a [link]="{ to: '..' }" data-testid="link-to-previous">Link to .. from current active route</a>
        <outlet />
      `,
      standalone: true,
    })
    class RelativeLinksParamARouteComponent {}

    @Angular.Component({
      imports: [Link],
      template: `
        <h1>Param B Route</h1>
        <a [link]="{ to: '..' }">Link to Parent</a>
        <a [link]="{ to: '.', params: { param: 'bar' } }">Link to . with param:bar</a>
        <a [link]="{ to: '..', params: { param: 'bar' } }">Link to Parent with param:bar</a>
      `,
      standalone: true,
    })
    class RelativeLinksParamBRouteComponent {}

    @Angular.Component({
      template: '<h1>Param C Route</h1>',
      standalone: true,
    })
    class RelativeLinksParamCRouteComponent {}

    const setupRouter = (basepath: string = '') => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => RelativeLinksIndexComponent,
      })
      const aRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'a',
        component: () => RelativeLinksARouteComponent,
      })

      const bRoute = createRoute({
        getParentRoute: () => aRoute,
        path: 'b',
        component: () => RelativeLinksBRouteComponent,
      })

      const paramRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'param/$param',
        component: () => RelativeLinksParamRouteComponent,
      })

      const paramARoute = createRoute({
        getParentRoute: () => paramRoute,
        path: 'a',
        component: () => RelativeLinksParamARouteComponent,
      })

      const paramBRoute = createRoute({
        getParentRoute: () => paramARoute,
        path: 'b',
        component: () => RelativeLinksParamBRouteComponent,
      })

      const paramCRoute = createRoute({
        getParentRoute: () => paramARoute,
        path: 'c',
        component: () => RelativeLinksParamCRouteComponent,
      })

      return createRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          aRoute.addChildren([bRoute]),
          paramRoute.addChildren([
            paramARoute.addChildren([paramBRoute, paramCRoute]),
          ]),
        ]),
        basepath: basepath === '' ? undefined : basepath,
      })
    }

    test('should navigate to the parent route', async () => {
      const router = setupRouter()

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      // Navigate to /a/b
      window.history.replaceState(null, 'root', '/a/b')

      // Inspect the link to go up a parent
      const parentLink = await screen.findByText('Link to Parent')
      expect(parentLink.getAttribute('href')).toBe('/a')

      // Click the link and ensure the new location
      fireEvent.click(parentLink)

      await waitFor(() => expect(window.location.pathname).toBe('/a'))
    })

    test('should navigate to the parent route and keep params', async () => {
      const router = setupRouter()

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      // Navigate to /param/oldParamValue/a/b
      window.history.replaceState(null, 'root', '/param/foo/a/b')

      // Inspect the link to go up a parent and keep the params
      const parentLink = await screen.findByText('Link to Parent')
      expect(parentLink.getAttribute('href')).toBe('/param/foo/a')

      // Click the link and ensure the new location
      fireEvent.click(parentLink)

      await waitFor(() => expect(window.location.pathname).toBe('/param/foo/a'))
    })

    test('should navigate to the parent route and change params', async () => {
      const router = setupRouter()

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      // Navigate to /param/oldParamValue/a/b
      window.history.replaceState(null, 'root', '/param/foo/a/b')

      // Inspect the link to go up a parent and keep the params
      const parentLink = await screen.findByText(
        'Link to Parent with param:bar',
      )
      expect(parentLink.getAttribute('href')).toBe('/param/bar/a')

      // Click the link and ensure the new location
      fireEvent.click(parentLink)

      await waitFor(() => expect(window.location.pathname).toBe('/param/bar/a'))
    })

    test('should navigate to a relative link based on render location', async () => {
      const router = setupRouter()

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      window.history.replaceState(null, 'root', '/param/foo/a/b')

      // Inspect the relative link to ./a
      const relativeLink = await screen.findByText('Link to ./a')
      expect(relativeLink.getAttribute('href')).toBe('/param/foo/a')

      // Click the link and ensure the new location
      fireEvent.click(relativeLink)

      await waitFor(() => expect(window.location.pathname).toBe('/param/foo/a'))
    })

    test('should navigate to a parent link based on render location', async () => {
      const router = setupRouter()

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      window.history.replaceState(null, 'root', '/param/foo/a/b')

      // Inspect the relative link to ./a
      const relativeLink = await screen.findByText(
        'Link to .. from /param/foo/a',
      )
      expect(relativeLink.getAttribute('href')).toBe('/param/foo')

      // Click the link and ensure the new location
      fireEvent.click(relativeLink)

      await waitFor(() => expect(window.location.pathname).toBe('/param/foo'))
    })

    test('should navigate to a parent link based on active location', async () => {
      const router = setupRouter()

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      window.history.replaceState(null, 'root', '/param/foo/a/b')

      const relativeLink = await screen.findByTestId('link-to-previous')

      expect(relativeLink.getAttribute('href')).toBe('/param/foo/a')

      // Click the link and ensure the new location
      fireEvent.click(relativeLink)

      await waitFor(() => expect(window.location.pathname).toBe('/param/foo/a'))
    })

    test('should navigate to a child link based on pathname', async () => {
      const router = setupRouter()

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      window.history.replaceState(null, 'root', '/param/foo/a/b')

      // Inspect the relative link to ./a
      const relativeLink = await screen.findByText('Link to c')
      expect(relativeLink.getAttribute('href')).toBe('/param/foo/a/b/c')

      // Click the link and ensure the new location
      fireEvent.click(relativeLink)

      await waitFor(() =>
        expect(window.location.pathname).toBe('/param/foo/a/b/c'),
      )
    })

    test('should navigate to a relative link based on pathname', async () => {
      const router = setupRouter()

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      window.history.replaceState(null, 'root', '/param/foo/a/b')

      // Inspect the relative link to ./a
      const relativeLink = await screen.findByText('Link to ../c')
      expect(relativeLink.getAttribute('href')).toBe('/param/foo/a/c')

      // Click the link and ensure the new location
      fireEvent.click(relativeLink)
      await waitFor(() =>
        expect(window.location.pathname).toBe('/param/foo/a/c'),
      )
    })

    test('should navigate to same route with different params', async () => {
      const router = setupRouter()

      window.history.replaceState(null, 'root', '/param/foo/a/b')

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      const parentLink = await screen.findByText('Link to . with param:bar')

      fireEvent.click(parentLink)

      await waitFor(() =>
        expect(window.location.pathname).toBe('/param/bar/a/b'),
      )
    })
  })

  describe('search middleware', () => {
    @Angular.Component({
      selector: 'search-middleware-error',
      template: '<div>{{ errorState().error.stack }}</div>',
      standalone: true,
    })
    class SearchMiddlewareErrorComponent {
      errorState = injectErrorState()
    }

    @Angular.Component({
      selector: 'search-middleware-index',
      imports: [Link],
      template: `
        <h1>Index</h1>
        <div data-testid="search">{{ search().root ?? '$undefined' }}</div>
        <a [link]="{ to: '/', search: { root: 'newValue' } }" data-testid="update-search">update search</a>
        <a [link]="{ to: '/posts', search: { page: 123 } }">Posts</a>
      `,
      standalone: true,
    })
    class SearchMiddlewareIndexComponent {
      search = injectSearch({ strict: false })
    }

    @Angular.Component({
      selector: 'search-middleware-posts',
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class SearchMiddlewarePostsComponent {}

    test('search middlewares work', async () => {
      const rootRoute = createRootRoute({
        errorComponent: () => SearchMiddlewareErrorComponent,
        validateSearch: (input) => {
          return {
            root: input.root as string | undefined,
            foo: input.foo as string | undefined,
          }
        },
        search: {
          middlewares: [
            ({ search, next }) => {
              return next({ ...search, foo: 'foo' })
            },
            ({ search, next }) => {
              expect(search.foo).toBe('foo')
              const { root, ...result } = next({ ...search, foo: 'hello' })
              return { ...result, root: root ?? search.root }
            },
          ],
        },
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => SearchMiddlewareIndexComponent,
      })

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'posts',
        validateSearch: (input: Record<string, unknown>) => {
          const page = Number(input.page)
          return {
            page,
          }
        },
        component: () => SearchMiddlewarePostsComponent,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        history: createMemoryHistory({ initialEntries: ['/?root=abc'] }),
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      async function checkSearchValue(value: string) {
        const searchValue = await screen.findByTestId('search')
        expect(searchValue.textContent).toBe(value)
      }
      async function checkPostsLink(root: string) {
        const postsLink = await screen.findByRole('link', { name: 'Posts' })
        expect(postsLink.getAttribute('href')).toBeTruthy()
        const href = postsLink.getAttribute('href')
        const search = getSearchParamsFromURI(href!)
        expect(search.size).toBe(2)
        expect(search.get('page')).toBe('123')
        expect(search.get('root')).toBe(root)
      }
      await checkSearchValue('abc')
      await checkPostsLink('abc')

      const updateSearchLink = await screen.findByTestId('update-search')
      fireEvent.click(updateSearchLink)
      await sleep(0)
      await checkSearchValue('newValue')
      await checkPostsLink('newValue')
      expect(router.state.location.search).toEqual({ root: 'newValue' })
    })
  })

  describe('relative links to current route', () => {
    @Angular.Component({
      imports: [Link],
      template: `
        <a [link]="{ to: '/post' }" data-testid="posts-link">Post</a>
        <a [link]="{ to: '.', search: { param1: 'value1' } }" data-testid="search-link">Search</a>
        <a [link]="{ to: '.', search: { param1: 'value2' } }" data-testid="search2-link">Search2</a>
      `,
      standalone: true,
    })
    class TrailingSlashIndexComponent {}

    @Angular.Component({
      template: '<h1>Post Route</h1>',
      standalone: true,
    })
    class TrailingSlashPostComponent {}

    test.each(Object.values(trailingSlashOptions))(
      'should navigate to current route when using "." in nested route structure from Index Route with trailingSlash: %s',
      async (trailingSlash) => {
        const tail = trailingSlash === 'always' ? '/' : ''

        const rootRoute = createRootRoute()

        const indexRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: '/',
          component: () => TrailingSlashIndexComponent,
        })

        const postRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: 'post',
          component: () => TrailingSlashPostComponent,
        })

        const router = createRouter({
          routeTree: rootRoute.addChildren([indexRoute, postRoute]),
          history,
          trailingSlash,
        })

        await render(RouterProvider, {
          bindings: [Angular.inputBinding('router', () => router)],
        })

        const searchLink = await screen.findByTestId('search-link')
        // When trailingSlash is 'always', root path becomes '//' which is normalized to '/'
        const expectedHref =
          trailingSlash === 'always'
            ? '/?param1=value1'
            : `/${tail}?param1=value1`
        expect(searchLink.getAttribute('href')).toBe(expectedHref)

        fireEvent.click(searchLink)

        await waitFor(() => {
          // When trailingSlash is 'always', root path becomes '//' which is normalized to '/'
          const expectedPath = trailingSlash === 'always' ? '/' : `/${tail}`
          expect(window.location.pathname).toBe(expectedPath)
          expect(window.location.search).toBe('?param1=value1')
        })

        const search2Link = await screen.findByTestId('search2-link')
        const expectedHref2 =
          trailingSlash === 'always'
            ? '/?param1=value2'
            : `/${tail}?param1=value2`
        expect(search2Link.getAttribute('href')).toBe(expectedHref2)

        fireEvent.click(search2Link)

        await waitFor(() => {
          // When trailingSlash is 'always', root path becomes '//' which is normalized to '/'
          const expectedPath = trailingSlash === 'always' ? '/' : `/${tail}`
          expect(window.location.pathname).toBe(expectedPath)
          expect(window.location.search).toBe('?param1=value2')
        })
      },
    )
  })
})

describe('search middleware with redirect parity', () => {
  test('middleware-derived search is retained after redirect', async () => {
    const rootRoute = createRootRoute({
      validateSearch: (input) => ({ value: String(input.value ?? 'none') }),
      search: {
        middlewares: [retainSearchParams(['value']) as any],
      },
    })

    @Angular.Component({
      imports: [Link],
      template: '<a [link]="{ to: \'/source\' }">Source</a>',
      standalone: true,
    })
    class IndexComponent {}

    @Angular.Component({
      template: '<h1 data-testid="target">Target</h1>',
      standalone: true,
    })
    class TargetComponent {}

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    const sourceRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      beforeLoad: () => {
        throw redirect({ to: '/target' })
      },
      component: () => IndexComponent,
    })

    const targetRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      component: () => TargetComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, sourceRoute, targetRoute]),
      history,
      defaultPendingMinMs: 0,
    })

    window.history.replaceState(null, '', '/?value=from-root')

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const sourceLink = await screen.findByRole('link', { name: 'Source' })
    fireEvent.click(sourceLink)

    await expect(screen.findByTestId('target')).resolves.toBeTruthy()
    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.location.search).toEqual({ value: 'none' })
  })
})

describe('Link parity smoke (framework-agnostic)', () => {
  test('navigates to /posts from root', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      imports: [Link],
      template: '<a [link]="{ to: \'/posts\' }">Posts</a>',
      standalone: true,
    })
    class IndexComponent {}

    @Angular.Component({
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class PostsComponent {}

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
      defaultPendingMinMs: 0,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const link = await screen.findByRole('link', { name: 'Posts' })
    expect(link.getAttribute('href')).toBe('/posts')

    fireEvent.click(link)

    await expect(screen.findByRole('heading', { name: 'Posts' })).resolves
      .toBeTruthy()
    expect(window.location.pathname).toBe('/posts')
  })

  test('resolves links correctly when router has basepath', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      imports: [Link],
      template: '<a [link]="{ to: \'/posts\' }">Posts</a>',
      standalone: true,
    })
    class IndexComponent {}

    @Angular.Component({
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class PostsComponent {}

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
      basepath: '/basepath',
      defaultPendingMinMs: 0,
    })

    window.history.replaceState(null, 'root', '/basepath/')

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const link = await screen.findByRole('link', { name: 'Posts' })
    expect(link.getAttribute('href')).toBe('/basepath/posts')

    fireEvent.click(link)

    await expect(screen.findByRole('heading', { name: 'Posts' })).resolves
      .toBeTruthy()
    expect(window.location.pathname).toBe('/basepath/posts')
  })
})
