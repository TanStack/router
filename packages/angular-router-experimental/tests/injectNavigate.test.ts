import * as Angular from '@angular/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  injectNavigate,
  injectParams,
} from '../src'
import type { RouterHistory } from '@tanstack/history'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
})

describe('injectNavigate', () => {
  test('when navigating to /posts', async () => {
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
      history,
      defaultPendingMinMs: 0,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(await screen.findByRole('heading', { name: 'Posts' })).toBeTruthy()

    expect(window.location.pathname).toBe('/posts')
  })

  test('when navigating from /posts to ./$postId', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      template: `
        <h1>Index</h1>
        <button (click)="navigate({ to: '/posts' })">Posts</button>
        <button (click)="navigate({ to: '/posts/$postId', params: { postId: 'id1' } })">To first post</button>
      `,
      standalone: true,
    })
    class IndexComponent {
      navigate = injectNavigate()
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    @Angular.Component({
      imports: [Outlet],
      template: '<h1>Posts</h1><outlet />',
    })
    class PostsComponent {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: () => PostsComponent,
    })

    @Angular.Component({
      template: `
        <h1>Posts Index</h1>
        <button (click)="navigate({ from: '/posts/', to: './$postId', params: { postId: 'id1' } })">To the first post</button>
      `,
      standalone: true,
    })
    class PostsIndexComponent {
      navigate = injectNavigate()
    }

    const postsIndexRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '/',
      component: () => PostsIndexComponent,
    })

    @Angular.Component({
      template: `
        <span>Params: {{ params().postId }}</span>
        <button (click)="navigate({ to: '/' })">Index</button>
      `,
      standalone: true,
    })
    class PostComponent {
      params = injectParams({ strict: false })
      navigate = injectNavigate()
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: () => PostComponent,
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

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(await screen.findByText('Posts Index')).toBeTruthy()

    const postButton = await screen.findByRole('button', {
      name: 'To the first post',
    })

    fireEvent.click(postButton)

    expect(await screen.findByText('Params: id1')).toBeTruthy()

    expect(window.location.pathname).toBe('/posts/id1')
  })

  test('should navigate to the parent route and keep params', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      template: `
        <h1>Leaf</h1>
        <button
          (click)="navigate({ to: '/param/$id/a', from: '/param/$id/a/b', params: true })"
        >
          Parent Keep Params
        </button>
      `,
      standalone: true,
    })
    class LeafComponent {
      navigate = injectNavigate()
    }

    @Angular.Component({
      imports: [Outlet],
      template: '<h1>Layout A</h1><outlet />',
    })
    class AComponent {}

    const paramRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/param/$id',
    })
    const aRoute = createRoute({
      getParentRoute: () => paramRoute,
      path: '/a',
      component: () => AComponent,
    })
    const bRoute = createRoute({
      getParentRoute: () => aRoute,
      path: '/b',
      component: () => LeafComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        paramRoute.addChildren([aRoute.addChildren([bRoute])]),
      ]),
      history,
      defaultPendingMinMs: 0,
    })

    window.history.replaceState(null, 'root', '/param/foo/a/b')

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const button = await screen.findByRole('button', {
      name: 'Parent Keep Params',
    })
    fireEvent.click(button)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/param/foo/a')
    })
  })

  test('should navigate to the parent route and change params', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      template: `
        <h1>Leaf</h1>
        <button (click)="navigateWithChangedParams()">
          Parent Change Params
        </button>
      `,
      standalone: true,
    })
    class LeafComponent {
      navigate = injectNavigate()

      navigateWithChangedParams() {
        this.navigate({
          to: '/param/$id/a',
          from: '/param/$id/a/b',
          params: (prev: any) => ({ ...prev, id: 'bar' }),
        })
      }
    }

    @Angular.Component({
      imports: [Outlet],
      template: '<h1>Layout A</h1><outlet />',
    })
    class AComponent {}

    const paramRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/param/$id',
    })
    const aRoute = createRoute({
      getParentRoute: () => paramRoute,
      path: '/a',
      component: () => AComponent,
    })
    const bRoute = createRoute({
      getParentRoute: () => aRoute,
      path: '/b',
      component: () => LeafComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        paramRoute.addChildren([aRoute.addChildren([bRoute])]),
      ]),
      history,
      defaultPendingMinMs: 0,
    })

    window.history.replaceState(null, 'root', '/param/foo/a/b')

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const button = await screen.findByRole('button', {
      name: 'Parent Change Params',
    })
    fireEvent.click(button)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/param/bar/a')
    })
  })

  test('should navigate to same route with different params', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      template: `
        <h1>Leaf</h1>
        <button
          (click)="navigate({ to: '/param/$id/a/b', from: '/param/$id/a/b', params: { id: 'bar' } })"
        >
          Same Route Different Params
        </button>
      `,
      standalone: true,
    })
    class LeafComponent {
      navigate = injectNavigate()
      params = injectParams({ strict: false })
    }

    const paramRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/param/$id',
    })
    const aRoute = createRoute({
      getParentRoute: () => paramRoute,
      path: '/a',
    })
    const bRoute = createRoute({
      getParentRoute: () => aRoute,
      path: '/b',
      component: () => LeafComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        paramRoute.addChildren([aRoute.addChildren([bRoute])]),
      ]),
      history,
      defaultPendingMinMs: 0,
    })

    window.history.replaceState(null, 'root', '/param/foo/a/b')

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const button = await screen.findByRole('button', {
      name: 'Same Route Different Params',
    })
    fireEvent.click(button)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/param/bar/a/b')
    })
  })
})
