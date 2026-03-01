import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import invariant from 'tiny-invariant'
import {
  Link,
  RouterProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  injectRouter,
  redirect,
} from '../src'
import { sleep } from './utils'
import type { RouterHistory } from '@tanstack/history'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  vi.clearAllMocks()
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
})

const WAIT_TIME = 100

@Angular.Component({
  imports: [Link],
  template: `
    <div>
      <h1>Index page</h1>
      <a [link]="{ to: '/about' }">link to about</a>
    </div>
  `,
})
class IndexComponent {}

@Angular.Component({
  imports: [Link],
  template: `
    <div>
      <h1>Index page</h1>
      <a [link]="{ to: '/about' }" data-testid="link-to-about">link to about</a>
    </div>
  `,
})
class IndexWithTestIdComponent {}

@Angular.Component({
  template: '<div>Nested Foo page</div>',
  standalone: true,
})
class NestedFooComponent {}

@Angular.Component({
  template: '<div>Final</div>',
  standalone: true,
})
class FinalComponent {}


describe('redirect', () => {
  describe('SPA', () => {
    test('when `redirect` is thrown in `beforeLoad`', async () => {
      const nestedLoaderMock = vi.fn()
      const nestedFooLoaderMock = vi.fn()

      const rootRoute = createRootRoute({})
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => IndexComponent,
      })
      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        beforeLoad: async () => {
          await sleep(WAIT_TIME)
          throw redirect({ to: '/nested/foo' })
        },
      })
      const nestedRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/nested',
        loader: async () => {
          await sleep(WAIT_TIME)
          nestedLoaderMock('nested')
        },
      })
      const fooRoute = createRoute({
        getParentRoute: () => nestedRoute,
        path: '/foo',
        loader: async () => {
          await sleep(WAIT_TIME)
          nestedFooLoaderMock('foo')
        },
        component: () => NestedFooComponent,
      })
      const routeTree = rootRoute.addChildren([
        nestedRoute.addChildren([fooRoute]),
        aboutRoute,
        indexRoute,
      ])
      const router = createRouter({
        routeTree,
        history,
        defaultPendingMinMs: 0,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      const linkToAbout = await screen.findByText('link to about')

      expect(linkToAbout).toBeTruthy()

      fireEvent.click(linkToAbout)

      const fooElement = await screen.findByText('Nested Foo page')

      expect(fooElement).toBeTruthy()

      expect(router.state.location.href).toBe('/nested/foo')
      expect(window.location.pathname).toBe('/nested/foo')

      expect(nestedLoaderMock).toHaveBeenCalled()
      expect(nestedFooLoaderMock).toHaveBeenCalled()
    })

    test('when `redirect` is thrown in `loader`', async () => {
      const nestedLoaderMock = vi.fn()
      const nestedFooLoaderMock = vi.fn()

      const rootRoute = createRootRoute({})
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => IndexComponent,
      })
      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        loader: async () => {
          await sleep(WAIT_TIME)
          throw redirect({
            to: '/nested/foo',
            hash: 'some-hash',
            search: { someSearch: 'hello123' },
          })
        },
      })
      const nestedRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/nested',
        loader: async () => {
          await sleep(WAIT_TIME)
          nestedLoaderMock('nested')
        },
      })
      const fooRoute = createRoute({
        validateSearch: (search) => {
          return {
            someSearch: search.someSearch as string,
          }
        },
        getParentRoute: () => nestedRoute,
        path: '/foo',
        loader: async () => {
          await sleep(WAIT_TIME)
          nestedFooLoaderMock('foo')
        },
        component: () => NestedFooComponent,
      })
      const routeTree = rootRoute.addChildren([
        nestedRoute.addChildren([fooRoute]),
        aboutRoute,
        indexRoute,
      ])
      const router = createRouter({
        routeTree,
        history,
        defaultPendingMinMs: 0,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      const linkToAbout = await screen.findByText('link to about')

      expect(linkToAbout).toBeTruthy()

      fireEvent.click(linkToAbout)

      const fooElement = await screen.findByText('Nested Foo page')

      expect(fooElement).toBeTruthy()

      expect(router.state.location.href).toBe(
        '/nested/foo?someSearch=hello123#some-hash',
      )
      expect(window.location.pathname).toBe('/nested/foo')

      expect(nestedLoaderMock).toHaveBeenCalled()
      expect(nestedFooLoaderMock).toHaveBeenCalled()
    })

    test('when `redirect` is thrown in `loader` after `router.invalidate()`', async () => {
      let shouldRedirect = false

      const rootRoute = createRootRoute({})
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => IndexWithTestIdComponent,
      })

      @Angular.Component({
        template: '<button data-testid="button-invalidate" (click)="invalidate()">invalidate</button>',
        standalone: true,
      })
      class AboutComponentWithInvalidate {
        router = injectRouter()

        invalidate() {
          shouldRedirect = true
          this.router.invalidate()
        }
      }

      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        loader: async () => {
          await sleep(WAIT_TIME)
          if (shouldRedirect) {
            throw redirect({
              to: '/final',
            })
          }
        },
        component: () => AboutComponentWithInvalidate,
      })
      const finalRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/final',
        component: () => FinalComponent,
      })

      const routeTree = rootRoute.addChildren([
        aboutRoute,
        indexRoute,
        finalRoute,
      ])
      const router = createRouter({
        routeTree,
        history,
        defaultPendingMinMs: 0,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      const linkToAbout = await screen.findByTestId('link-to-about')
      expect(linkToAbout).toBeTruthy()

      fireEvent.click(linkToAbout)

      const invalidateButton = await screen.findByTestId('button-invalidate')
      expect(invalidateButton).toBeTruthy()

      fireEvent.click(invalidateButton)

      expect(await screen.findByText('Final')).toBeTruthy()
      expect(window.location.pathname).toBe('/final')
    })
  })

  describe('SSR', () => {
    test('when `redirect` is thrown in `beforeLoad`', async () => {
      const rootRoute = createRootRoute()

      const indexRoute = createRoute({
        path: '/',
        getParentRoute: () => rootRoute,
        beforeLoad: () => {
          throw redirect({
            to: '/about',
          })
        },
      })

      @Angular.Component({
        template: 'About',
        standalone: true,
      })
      class AboutComponent {}

      const aboutRoute = createRoute({
        path: '/about',
        getParentRoute: () => rootRoute,
        component: () => AboutComponent,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
        // Mock server mode
        isServer: true,
        history: createMemoryHistory({
          initialEntries: ['/'],
        }),
      })

      await router.load()

      expect(router.state.redirect).toBeDefined()
      expect(router.state.redirect).toBeInstanceOf(Response)
      invariant(router.state.redirect)

      expect(router.state.redirect.options).toEqual({
        _fromLocation: expect.objectContaining({
          hash: '',
          href: '/',
          pathname: '/',
          search: {},
          searchStr: '',
        }),
        to: '/about',
        href: '/about',
        statusCode: 307,
      })
    })

    test('when `redirect` is thrown in `loader`', async () => {
      const rootRoute = createRootRoute()

      const indexRoute = createRoute({
        path: '/',
        getParentRoute: () => rootRoute,
        loader: () => {
          throw redirect({
            to: '/about',
          })
        },
      })

      @Angular.Component({
        template: 'About',
        standalone: true,
      })
      class AboutComponent {}

      const aboutRoute = createRoute({
        path: '/about',
        getParentRoute: () => rootRoute,
        component: () => AboutComponent,
      })

      const router = createRouter({
        history: createMemoryHistory({
          initialEntries: ['/'],
        }),
        routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
        // Mock server mode
        isServer: true,
      })

      await router.load()

      const currentRedirect = router.state.redirect

      expect(currentRedirect).toBeDefined()
      expect(currentRedirect).toBeInstanceOf(Response)
      invariant(currentRedirect)
      expect(currentRedirect.status).toEqual(307)
      expect(currentRedirect.headers.get('Location')).toEqual('/about')
      expect(currentRedirect.options).toEqual({
        _fromLocation: {
          hash: '',
          href: '/',
          publicHref: '/',
          pathname: '/',
          search: {},
          searchStr: '',
          state: {
            __TSR_index: 0,
            __TSR_key: currentRedirect.options._fromLocation!.state.__TSR_key,
            key: currentRedirect.options._fromLocation!.state.key,
          },
          url: new URL('http://localhost/'),
        },
        href: '/about',
        to: '/about',
        statusCode: 307,
      })
    })
  })
})

