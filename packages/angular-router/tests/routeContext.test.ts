import * as Angular from '@angular/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  injectRouterContext,
  redirect,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
})

describe('route context runtime behavior', () => {
  test('reads root router context from route components', async () => {
    interface AppContext {
      userId: string
    }

    const rootRoute = createRootRouteWithContext<AppContext>()()

    @Angular.Component({
      template: '<div data-testid="ctx">{{ ctx().userId }}</div>',
      standalone: true,
    })
    class IndexComponent {
      ctx = injectRouterContext({ from: '/' })
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      context: { userId: 'u-1' },
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    expect((await screen.findByTestId('ctx')).textContent).toContain('u-1')
  })

  test('merges beforeLoad route context into child route context', async () => {
    interface AppContext {
      userId: string
    }

    const rootRoute = createRootRouteWithContext<AppContext>()()

    @Angular.Component({
      imports: [Outlet],
      template: '<outlet />',
      standalone: true,
    })
    class PostsLayout {}

    @Angular.Component({
      template:
        '<div data-testid="ctx">{{ ctx().userId }}:{{ ctx().username }}</div>',
      standalone: true,
    })
    class PostComponent {
      ctx = injectRouterContext({ from: '/posts/$postId' })
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => PostsLayout,
    })

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '/$postId',
      beforeLoad: ({ params }) => ({ username: params.postId }),
      component: () => PostComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        postsRoute.addChildren([postRoute]),
      ]),
      context: { userId: 'u-1' },
    })

    window.history.replaceState(null, 'root', '/posts/tanner')

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    expect((await screen.findByTestId('ctx')).textContent).toContain(
      'u-1:tanner',
    )
  })

  test('preserves root context through redirect from beforeLoad', async () => {
    interface AppContext {
      userId: string
    }

    const rootRoute = createRootRouteWithContext<AppContext>()()

    @Angular.Component({
      imports: [Link],
      template: '<a [link]="{ to: \'/source\' }">Source</a>',
      standalone: true,
    })
    class IndexComponent {}

    @Angular.Component({
      template: '<div data-testid="ctx">{{ ctx().userId }}</div>',
      standalone: true,
    })
    class TargetComponent {
      ctx = injectRouterContext({ from: '/target' })
    }

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
      context: { userId: 'u-1' },
      defaultPendingMinMs: 0,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const link = await screen.findByRole('link', { name: 'Source' })
    fireEvent.click(link)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/target')
    })
    expect((await screen.findByTestId('ctx')).textContent).toContain('u-1')
  })
})
