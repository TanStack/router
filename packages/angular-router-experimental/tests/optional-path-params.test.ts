import * as Angular from '@angular/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  injectNavigate,
  injectParams,
} from '../src'

describe('Angular Router - Optional Path Parameters', () => {
  afterEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, 'root', '/')
  })

  describe('Route matching with optional parameters', () => {
    @Angular.Component({
      template: `
        <div>
          <h1>Posts</h1>
          <div data-testid="params">{{ paramsJson() }}</div>
        </div>
      `,
      standalone: true,
    })
    class OptionalParamsPostsComponent {
      params = injectParams({ from: '/posts/{-$category}/{-$slug}' })
      paramsJson = Angular.computed(() => JSON.stringify(this.params()))
    }

    it('should match route with no optional parameters', async () => {
      const rootRoute = createRootRoute()

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => OptionalParamsPostsComponent,
      })
      window.history.replaceState({}, '', '/posts')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        defaultPendingMinMs: 0,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })
      await router.load()

      const paramsElement = await screen.findByTestId('params')
      expect(JSON.parse(String(paramsElement.textContent))).toEqual({})
    })

    it('should match route with one optional parameter', async () => {
      const rootRoute = createRootRoute()

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => OptionalParamsPostsComponent,
      })
      window.history.replaceState({}, '', '/posts/tech')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        defaultPendingMinMs: 0,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })
      await router.load()

      const paramsElement = await screen.findByTestId('params')
      expect(JSON.parse(String(paramsElement.textContent))).toEqual({
        category: 'tech',
      })
    })

    it('should match route with all optional parameters', async () => {
      const rootRoute = createRootRoute()

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => OptionalParamsPostsComponent,
      })
      window.history.replaceState({}, '', '/posts/tech/hello-world')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        defaultPendingMinMs: 0,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })
      await router.load()

      const paramsElement = await screen.findByTestId('params')
      expect(JSON.parse(String(paramsElement.textContent))).toEqual({
        category: 'tech',
        slug: 'hello-world',
      })
    })

    @Angular.Component({
      template: `
        <div>
          <h1>User Profile</h1>
          <div data-testid="params">{{ paramsJson() }}</div>
        </div>
      `,
      standalone: true,
    })
    class UserProfileComponent {
      params = injectParams({ from: '/users/$id/{-$tab}' })
      paramsJson = Angular.computed(() => JSON.stringify(this.params()))
    }

    it.each([
      { path: '/users/123', expectedParams: { id: '123' } },
      {
        path: '/users/123/settings',
        expectedParams: { id: '123', tab: 'settings' },
      },
    ])(
      'should handle mixed required and optional parameters: $path',
      async ({ path, expectedParams }) => {
        const rootRoute = createRootRoute()

        const usersRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: '/users/$id/{-$tab}',
          component: () => UserProfileComponent,
        })
        window.history.replaceState({}, '', path)

        const router = createRouter({
          routeTree: rootRoute.addChildren([usersRoute]),
          defaultPendingMinMs: 0,
        })

        await render(RouterProvider, {
          bindings: [Angular.inputBinding('router', () => router)],
        })
        await router.load()

        const paramsElement = await screen.findByTestId('params')
        expect(JSON.parse(String(paramsElement.textContent))).toEqual(expectedParams)
      },
    )
  })

  describe('Link component with optional parameters', () => {
    @Angular.Component({
      imports: [Link],
      template: `
        <a [link]="{ to: '/posts/{-$category}/{-$slug}' }" data-testid="posts-link">All Posts</a>
        <a [link]="{ to: '/posts/{-$category}/{-$slug}', params: { category: 'tech' } }" data-testid="tech-link">Tech Posts</a>
        <a [link]="{ to: '/posts/{-$category}/{-$slug}', params: { category: 'tech', slug: 'hello-world' } }" data-testid="specific-link">Specific Post</a>
        <a [link]="{ to: '/posts/{-$category}/{-$slug}', params: {} }" data-testid="empty-params-link">Empty Params</a>
      `,
    })
    class OptionalPathLinksIndexComponent {}

    @Angular.Component({
      template: '<div>Posts</div>',
      standalone: true,
    })
    class OptionalPathLinksPostsSimpleComponent {}

    it('should generate correct href for optional parameters', async () => {
      const rootRoute = createRootRoute()

      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => OptionalPathLinksIndexComponent,
      })

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => OptionalPathLinksPostsSimpleComponent,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        defaultPendingMinMs: 0,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      const postsLink = await screen.findByTestId('posts-link')
      const techLink = await screen.findByTestId('tech-link')
      const specificLink = await screen.findByTestId('specific-link')
      const emptyParamsLink = await screen.findByTestId('empty-params-link')

      expect(postsLink.getAttribute('href')).toBe('/posts')
      expect(techLink.getAttribute('href')).toBe('/posts/tech')
      expect(specificLink.getAttribute('href')).toBe('/posts/tech/hello-world')
      expect(emptyParamsLink.getAttribute('href')).toBe('/posts')
    })

    @Angular.Component({
      imports: [Link, Outlet],
      template: `
        <div>
          <h1>Root Layout</h1>
          <a [link]="{ to: '/' }" data-testid="home-link">Home</a>
          <outlet />
        </div>
      `,
    })
    class OptionalPathLinksRootLayoutComponent {}

    @Angular.Component({
      imports: [Link],
      template: `
        <h1 data-testid="home-heading">Home</h1>
        <a [link]="{ to: '/posts/{-$category}/{-$slug}' }" data-testid="posts-link">All Posts</a>
        <a [link]="{ to: '/posts/{-$category}/{-$slug}', params: { category: 'tech' } }" data-testid="tech-link">Tech Posts</a>
      `,
    })
    class OptionalPathLinksHomeComponent {}

    @Angular.Component({
      template: `
        <div>
          <h1>Posts</h1>
          <div data-testid="params">{{ paramsJson() }}</div>
        </div>
      `,
      standalone: true,
    })
    class OptionalPathLinksPostsWithParamsComponent {
      params = injectParams({ from: '/posts/{-$category}/{-$slug}' })
      paramsJson = Angular.computed(() => JSON.stringify(this.params()))
    }

    it('should navigate correctly with optional parameters', async () => {
      const rootRoute = createRootRoute({
        component: () => OptionalPathLinksRootLayoutComponent,
      })

      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => OptionalPathLinksHomeComponent,
      })

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => OptionalPathLinksPostsWithParamsComponent,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        defaultPendingMinMs: 0,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })
      await router.load()

      {
        await expect(screen.findByTestId('home-heading')).resolves.toBeTruthy()
        const postsLink = await screen.findByTestId('posts-link')
        fireEvent.click(postsLink)

        await expect(screen.findByText('Posts')).resolves.toBeTruthy()
        const paramsElement = await screen.findByTestId('params')
        expect(JSON.parse(String(paramsElement.textContent))).toEqual({})
        expect(router.state.location.pathname).toBe('/posts')
      }

      {
        const homeLink = await screen.findByTestId('home-link')
        fireEvent.click(homeLink)
        await expect(screen.findByTestId('home-heading')).resolves.toBeTruthy()
      }

      {
        const techLink = await screen.findByTestId('tech-link')
        fireEvent.click(techLink)

        await expect(screen.findByText('Posts')).resolves.toBeTruthy()
        const updatedParamsElement = await screen.findByTestId('params')
        expect(JSON.parse(String(updatedParamsElement.textContent))).toEqual({
          category: 'tech',
        })
        expect(router.state.location.pathname).toBe('/posts/tech')
      }
    })
  })

  describe('injectNavigate with optional parameters', () => {
    it('should navigate with optional parameters programmatically', async () => {
      const rootRoute = createRootRoute()

      @Angular.Component({
        template: `
          <div>
            <div data-testid="params">{{ paramsJson() }}</div>
            <button data-testid="navigate-all" (click)="navigateAll()">All Posts</button>
            <button data-testid="navigate-tech" (click)="navigateTech()">Tech Posts</button>
            <button data-testid="navigate-specific" (click)="navigateSpecific()">Specific Post</button>
          </div>
        `,
        standalone: true,
      })
      class PostsComponent {
        navigate = injectNavigate()
        params = injectParams({ from: '/posts/{-$category}/{-$slug}' })
        paramsJson = Angular.computed(() => JSON.stringify(this.params()))

        navigateAll() {
          this.navigate({
            to: '/posts/{-$category}/{-$slug}',
            params: false,
          })
        }

        navigateTech() {
          this.navigate({
            to: '/posts/{-$category}/{-$slug}',
            params: { category: 'tech', slug: undefined },
          })
        }

        navigateSpecific() {
          this.navigate({
            to: '/posts/{-$category}/{-$slug}',
            params: { category: 'tech', slug: 'hello-world' },
          })
        }
      }

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => PostsComponent,
      })

      window.history.replaceState({}, '', '/posts/tech/hello-world')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        defaultPendingMinMs: 0,
      })

      await render(RouterProvider, {
        bindings: [Angular.inputBinding('router', () => router)],
      })

      const navigateAll = await screen.findByTestId('navigate-all')
      await fireEvent.click(navigateAll)
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/posts')
      })

      const navigateTech = await screen.findByTestId('navigate-tech')
      await fireEvent.click(navigateTech)
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/posts/tech')
      })

      const navigateSpecific = await screen.findByTestId('navigate-specific')
      await fireEvent.click(navigateSpecific)
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/posts/tech/hello-world')
      })
    })
  })
})

describe('Additional Optional Path Parameter Cases', () => {
  afterEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, 'root', '/')
  })

  it('supports optional params with prefix and suffix', async () => {
    const rootRoute = createRootRoute()

    @Angular.Component({
      template: '<div data-testid="params">{{ paramsJson() }}</div>',
      standalone: true,
    })
    class PrefixedComponent {
      params = injectParams({ from: '/docs/prefix{-$id}.md' })
      paramsJson = Angular.computed(() => JSON.stringify(this.params()))
    }

    const docsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/docs/prefix{-$id}.md',
      component: () => PrefixedComponent,
    })

    window.history.replaceState({}, '', '/docs/prefix123.md')

    const router = createRouter({
      routeTree: rootRoute.addChildren([docsRoute]),
      defaultPendingMinMs: 0,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const paramsElement = await screen.findByTestId('params')
    expect(JSON.parse(String(paramsElement.textContent))).toEqual({ id: '123' })
  })

  it('passes optional params to beforeLoad and loader', async () => {
    const rootRoute = createRootRoute()

    const beforeLoadSpy = vi.fn()
    const loaderSpy = vi.fn()

    @Angular.Component({
      template: '<h1 data-testid="loaded">Loaded</h1>',
      standalone: true,
    })
    class LoadedComponent {}

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/{-$category}',
      beforeLoad: ({ params }) => {
        beforeLoadSpy(params)
      },
      loader: ({ params }) => {
        loaderSpy(params)
      },
      component: () => LoadedComponent,
    })

    window.history.replaceState({}, '', '/posts/tech')

    const router = createRouter({
      routeTree: rootRoute.addChildren([postsRoute]),
      defaultPendingMinMs: 0,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    await expect(screen.findByTestId('loaded')).resolves.toBeTruthy()
    expect(beforeLoadSpy).toHaveBeenCalledWith({ category: 'tech' })
    expect(loaderSpy).toHaveBeenCalledWith({ category: 'tech' })
  })
})
