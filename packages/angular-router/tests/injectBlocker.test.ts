import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  injectBlocker,
  injectNavigate,
} from '../src'

beforeEach(() => {
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  vi.clearAllMocks()
  vi.resetAllMocks()
})

describe('injectBlocker', () => {
  test('does not block navigation when not enabled', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      template: `
        <h1>Index</h1>
        <button (click)="navigate({ to: '/' })">Index</button>
        <button (click)="navigate({ to: '/posts' })">Posts</button>
      `,
      standalone: true,
    })
    class IndexComponent {
      navigate = injectNavigate()
      blocker = injectBlocker({ shouldBlockFn: () => false })
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    @Angular.Component({
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class PostsComponent {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(await screen.findByRole('heading', { name: 'Posts' })).toBeTruthy()

    expect(window.location.pathname).toBe('/posts')
  })

  test('does not block navigation when disabled', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      template: `
        <h1>Index</h1>
        <button (click)="navigate({ to: '/' })">Index</button>
        <button (click)="navigate({ to: '/posts' })">Posts</button>
      `,
      standalone: true,
    })
    class IndexComponent {
      navigate = injectNavigate()
      blocker = injectBlocker({ shouldBlockFn: () => true, disabled: true })
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    @Angular.Component({
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class PostsComponent {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(await screen.findByRole('heading', { name: 'Posts' })).toBeTruthy()

    expect(window.location.pathname).toBe('/posts')
  })

  test('blocks navigation when enabled', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      template: `
        <h1>Index</h1>
        <button (click)="navigate({ to: '/' })">Index</button>
        <button (click)="navigate({ to: '/posts' })">Posts</button>
      `,
      standalone: true,
    })
    class IndexComponent {
      navigate = injectNavigate()
      blocker = injectBlocker({ shouldBlockFn: () => true })
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    @Angular.Component({
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class PostsComponent {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(await screen.findByRole('heading', { name: 'Index' })).toBeTruthy()

    expect(window.location.pathname).toBe('/')
  })

  test('gives correct arguments to shouldBlockFn', async () => {
    const rootRoute = createRootRoute()

    const shouldBlockFn = vi.fn().mockReturnValue(true)

    @Angular.Component({
      template: `
        <h1>Index</h1>
        <button (click)="navigate({ to: '/' })">Index</button>
        <button (click)="navigate({ to: '/posts', replace: true })">Posts</button>
      `,
      standalone: true,
    })
    class IndexComponent {
      navigate = injectNavigate()
      blocker = injectBlocker({ shouldBlockFn })
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    @Angular.Component({
      template: '<h1>Posts</h1>',
      standalone: true,
    })
    class PostsComponent {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(await screen.findByRole('heading', { name: 'Index' })).toBeTruthy()

    expect(window.location.pathname).toBe('/')

    expect(shouldBlockFn).toHaveBeenCalledWith({
      action: 'REPLACE',
      current: {
        routeId: indexRoute.id,
        fullPath: indexRoute.fullPath,
        pathname: '/',
        params: {},
        search: {},
      },
      next: {
        routeId: postsRoute.id,
        fullPath: postsRoute.fullPath,
        pathname: '/posts',
        params: {},
        search: {},
      },
    })
  })
})
