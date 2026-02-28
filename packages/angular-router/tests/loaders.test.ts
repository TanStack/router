import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  injectRouter,
  injectLoaderData,
  injectParams,
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
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
})

const WAIT_TIME = 100

@Angular.Component({
  template: '<div>Index page</div>',
  standalone: true,
})
class IndexPageComponent { }

@Angular.Component({
  imports: [Link],
  template: `
    <div>
      <h1>Index page</h1>
      <a [link]="{ to: '/nested/foo' }">link to foo</a>
    </div>
  `,
})
class IndexWithLinkComponent { }

@Angular.Component({
  template: '<div>Nested Foo page</div>',
  standalone: true,
})
class NestedFooComponent { }

@Angular.Component({
  imports: [Outlet],
  template: '<outlet />',
})
class NestedLayoutComponent { }

describe('loaders are being called', () => {
  test('called on /', async () => {
    const indexLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        indexLoaderMock('foo')
      },
      component: () => IndexPageComponent,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history,
      defaultPendingMinMs: 0,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeTruthy()

    expect(router.state.location.href).toBe('/')
    expect(window.location.pathname).toBe('/')

    expect(indexLoaderMock).toHaveBeenCalled()
  })

  test('both are called on /nested/foo', async () => {
    const nestedLoaderMock = vi.fn()
    const nestedFooLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexWithLinkComponent,
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

    const linkToAbout = await screen.findByText('link to foo')
    fireEvent.click(linkToAbout)

    const fooElement = await screen.findByText('Nested Foo page')
    expect(fooElement).toBeTruthy()

    expect(router.state.location.href).toBe('/nested/foo')
    expect(window.location.pathname).toBe('/nested/foo')

    expect(nestedLoaderMock).toHaveBeenCalled()
    expect(nestedFooLoaderMock).toHaveBeenCalled()
  })
})

describe('loaders parentMatchPromise', () => {
  test('parentMatchPromise is defined in a child route', async () => {
    const nestedLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexWithLinkComponent,
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      loader: async () => {
        await sleep(WAIT_TIME)
        return 'nested'
      },
      component: () => NestedLayoutComponent,
    })
    const fooRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/foo',
      loader: async ({ parentMatchPromise }) => {
        nestedLoaderMock(parentMatchPromise)
        const parentMatch = await parentMatchPromise
        expect(parentMatch.loaderData).toBe('nested')
      },
      component: () => NestedFooComponent,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([fooRoute]),
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

    const linkToFoo = await screen.findByRole('link', { name: 'link to foo' })

    expect(linkToFoo).toBeTruthy()

    fireEvent.click(linkToFoo)

    const fooElement = await screen.findByText('Nested Foo page')
    expect(fooElement).toBeTruthy()

    expect(nestedLoaderMock).toHaveBeenCalled()
    expect(nestedLoaderMock.mock.calls[0]?.[0]).toBeInstanceOf(Promise)
  })
})

test('reproducer for #2031', async () => {
  const rootRoute = createRootRoute()

  const searchSchema = z.object({
    data: z.string().array().default([]),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => IndexPageComponent,
    validateSearch: searchSchema,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({ routeTree, history, defaultPendingMinMs: 0 })

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })

  const indexElement = await screen.findByText('Index page')
  expect(indexElement).toBeTruthy()
})

test('reproducer for #2053', async () => {
  const rootRoute = createRootRoute()

  const fooRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/foo/$fooId',
    component: () => {
      @Angular.Component({
        template: '<div>fooId: {{ params().fooId }}</div>',
        standalone: true,
      })
      class FooComponent {
        params = fooRoute.injectParams()
      }
      return FooComponent
    },
  })

  window.history.replaceState(null, 'root', '/foo/3ΚΑΠΠΑ')

  const routeTree = rootRoute.addChildren([fooRoute])

  const router = createRouter({
    routeTree,
    history,
    defaultPendingMinMs: 0,
  })

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })

  const fooElement = await screen.findByText('fooId: 3ΚΑΠΠΑ')
  expect(fooElement).toBeTruthy()
})

test('reproducer for #2198 - throw error from beforeLoad upon initial load', async () => {
  const rootRoute = createRootRoute({})

  @Angular.Component({
    template: '<div>indexErrorComponent</div>',
    standalone: true,
  })
  class IndexErrorComponent { }

  @Angular.Component({
    template: '<div>defaultErrorComponent</div>',
    standalone: true,
  })
  class DefaultErrorComponent { }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => IndexPageComponent,
    beforeLoad: () => {
      throw new Error('Test!')
    },
    errorComponent: () => IndexErrorComponent,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({
    routeTree,
    history,
    defaultErrorComponent: () => DefaultErrorComponent,
    defaultPendingMinMs: 0,
  })

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })

  const errorElement = await screen.findByText('indexErrorComponent')
  expect(errorElement).toBeTruthy()
})

test('throw error from loader upon initial load', async () => {
  const rootRoute = createRootRoute({})

  @Angular.Component({
    template: '<div>indexErrorComponent</div>',
    standalone: true,
  })
  class IndexErrorComponent { }

  @Angular.Component({
    template: '<div>defaultErrorComponent</div>',
    standalone: true,
  })
  class DefaultErrorComponent { }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => IndexPageComponent,
    loader: () => {
      throw new Error('Test!')
    },
    errorComponent: () => IndexErrorComponent,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({
    routeTree,
    history,
    defaultErrorComponent: () => DefaultErrorComponent,
    defaultPendingMinMs: 0,
  })

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })

  const errorElement = await screen.findByText('indexErrorComponent')
  expect(errorElement).toBeTruthy()
})

test('throw error from beforeLoad when navigating to route', async () => {
  const rootRoute = createRootRoute({})

  @Angular.Component({
    imports: [Link],
    template: `
      <div>
        <h1>Index page</h1>
        <a [link]="{ to: '/foo' }">link to foo</a>
      </div>
    `,
  })
  class IndexWithLinkComponent2 { }

  @Angular.Component({
    template: '<div>Foo page</div>',
    standalone: true,
  })
  class FooPageComponent { }

  @Angular.Component({
    template: '<div>indexErrorComponent</div>',
    standalone: true,
  })
  class IndexErrorComponent2 { }

  @Angular.Component({
    template: '<div>fooErrorComponent</div>',
    standalone: true,
  })
  class FooErrorComponent { }

  @Angular.Component({
    template: '<div>defaultErrorComponent</div>',
    standalone: true,
  })
  class DefaultErrorComponent2 { }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => IndexWithLinkComponent2,
    errorComponent: () => IndexErrorComponent2,
  })

  const fooRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    component: () => FooPageComponent,
    beforeLoad: () => {
      throw new Error('Test!')
    },
    errorComponent: () => FooErrorComponent,
  })

  const routeTree = rootRoute.addChildren([indexRoute, fooRoute])
  const router = createRouter({
    routeTree,
    history,
    defaultErrorComponent: () => DefaultErrorComponent2,
    defaultPendingMinMs: 0,
  })

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })

  const linkToFoo = await screen.findByRole('link', { name: 'link to foo' })

  expect(linkToFoo).toBeTruthy()

  fireEvent.click(linkToFoo)

  const indexElement = await screen.findByText('fooErrorComponent')
  expect(indexElement).toBeTruthy()
})

// TODO: missing tests
