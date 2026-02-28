import * as Angular from '@angular/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  injectRouterState,
  notFound,
  redirect,
} from '../src'
import { sleep } from './utils'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
})

function setup(opts?: {
  beforeLoad?: () => any
  loader?: () => any
  staleTime?: number
}) {
  const selectSpy = vi.fn()

  @Angular.Component({
    imports: [Link, Outlet],
    template: `
      <a [link]="{ to: '/' }">Back</a>
      <a [link]="{ to: '/posts' }">Posts</a>
      <outlet />
    `,
    standalone: true,
  })
  class RootComponent {
    state = injectRouterState({
      select: (s) => {
        selectSpy(s.status)
        return s.status
      },
    })
  }

  const rootRoute = createRootRoute({
    component: () => RootComponent,
  })

  @Angular.Component({
    selector: 'store-updates-index',
    template: '<h1>Index</h1>',
    standalone: true,
  })
  class IndexComponent {}

  @Angular.Component({
    selector: 'store-updates-posts',
    template: '<h1>Posts Title</h1>',
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
    beforeLoad: opts?.beforeLoad,
    loader: opts?.loader,
    component: () => PostsComponent,
  })

  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    component: () => PostsComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute, otherRoute]),
    defaultPreload: 'intent',
    defaultStaleTime: opts?.staleTime,
    defaultGcTime: opts?.staleTime,
  })

  return { router, selectSpy }
}

async function navigateToPosts() {
  const link = await screen.findByRole('link', { name: 'Posts' })
  fireEvent.click(link)
  await expect(screen.findByRole('heading', { name: 'Posts Title' })).resolves
    .toBeTruthy()
}

describe('store update sanity during navigation', () => {
  test('updates stay within a bounded range for async beforeLoad + loader', async () => {
    const { router, selectSpy } = setup({
      beforeLoad: async () => {
        await sleep(30)
        return { ok: true }
      },
      loader: async () => {
        await sleep(30)
        return { ok: true }
      },
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const before = selectSpy.mock.calls.length
    await navigateToPosts()
    const after = selectSpy.mock.calls.length

    const updates = after - before
    expect(updates).toBeGreaterThanOrEqual(4)
    expect(updates).toBeLessThanOrEqual(40)
  })

  test('preload redirect has bounded update count', async () => {
    const { router, selectSpy } = setup({
      loader: () => {
        throw redirect({ to: '/other' })
      },
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const before = selectSpy.mock.calls.length
    await router.preloadRoute({ to: '/posts' })
    const after = selectSpy.mock.calls.length

    expect(after - before).toBeLessThan(20)
  })

  test('preloading an already preloaded route causes minimal churn', async () => {
    const { router, selectSpy } = setup({
      loader: async () => {
        await sleep(20)
        return { ok: true }
      },
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    await router.preloadRoute({ to: '/posts' })
    await waitFor(() => expect(selectSpy).toHaveBeenCalled())

    const before = selectSpy.mock.calls.length
    await router.preloadRoute({ to: '/posts' })
    const after = selectSpy.mock.calls.length

    expect(after - before).toBeLessThanOrEqual(4)
  })

  test('sync beforeLoad keeps updates bounded', async () => {
    const { router, selectSpy } = setup({
      beforeLoad: () => ({ ok: true }),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const before = selectSpy.mock.calls.length
    await navigateToPosts()
    const after = selectSpy.mock.calls.length

    expect(after - before).toBeGreaterThanOrEqual(2)
    expect(after - before).toBeLessThanOrEqual(50)
  })

  test('navigating without async work has low update churn', async () => {
    const { router, selectSpy } = setup({
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const before = selectSpy.mock.calls.length
    await navigateToPosts()
    const after = selectSpy.mock.calls.length

    expect(after - before).toBeGreaterThanOrEqual(2)
    expect(after - before).toBeLessThanOrEqual(50)
  })

  test('notFound in beforeLoad has bounded updates', async () => {
    const { router, selectSpy } = setup({
      beforeLoad: () => {
        throw notFound()
      },
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const before = selectSpy.mock.calls.length
    await router.navigate({ to: '/posts' }).catch(() => undefined)
    const after = selectSpy.mock.calls.length

    expect(after - before).toBeGreaterThanOrEqual(0)
    expect(after - before).toBeLessThanOrEqual(30)
  })

  test('hover preload then navigate with async loader stays bounded', async () => {
    const { router, selectSpy } = setup({
      loader: async () => {
        await sleep(30)
        return { ok: true }
      },
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const before = selectSpy.mock.calls.length
    await router.preloadRoute({ to: '/posts' })
    await navigateToPosts()
    const after = selectSpy.mock.calls.length

    expect(after - before).toBeGreaterThanOrEqual(3)
    expect(after - before).toBeLessThanOrEqual(60)
  })
})
