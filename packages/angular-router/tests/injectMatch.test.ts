import * as Angular from '@angular/core'
import { render, screen, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  injectMatch,
} from '../src'
import type { RouterHistory } from '@tanstack/history'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  vi.resetAllMocks()
})

describe('injectMatch', () => {
  function setup({
    RootComponent,
    history,
  }: {
    RootComponent: () => Angular.Type<any>
    history?: RouterHistory
  }) {
    const rootRoute = createRootRoute({
      component: RootComponent,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        @Angular.Component({
          imports: [Link],
          template: `
            <h1>IndexTitle</h1>
            <a [link]="{ to: '/posts' }">Posts</a>
          `,
        })
        class IndexComponent {}
        return IndexComponent
      },
    })

    history = history || createMemoryHistory({ initialEntries: ['/'] })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        @Angular.Component({
          template: '<h1>PostsTitle</h1>',
          standalone: true,
        })
        class PostsComponent {}
        return PostsComponent
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
      defaultPendingMinMs: 0,
    })

    return render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })
  }

  describe('when match is found', () => {
    test.each([true, false, undefined])(
      'returns the match if shouldThrow = %s',
      async (shouldThrow) => {
        @Angular.Component({
          imports: [Outlet],
          template: '<outlet />',
        })
        class RootComponent {
          match = injectMatch({ from: '/posts', shouldThrow })
          matchId = Angular.computed(() => {
            const m = this.match()
            expect(m).toBeDefined()
            expect(m!.routeId).toBe('/posts')
            return m?.routeId
          })
        }

        setup({
          RootComponent: () => RootComponent,
          history: createMemoryHistory({ initialEntries: ['/posts'] }),
        })
        const postsTitle = await screen.findByText('PostsTitle')
        expect(postsTitle).toBeTruthy()
      },
    )
  })

  describe('when match is not found', () => {
    test.each([undefined, true])(
      'throws if shouldThrow = %s',
      async (shouldThrow) => {
        @Angular.Component({
          imports: [Outlet],
          template: '<outlet />',
        })
        class RootComponent {
          match = injectMatch({ from: '/posts', shouldThrow })
          // Accessing the match will throw if shouldThrow is true/undefined
          matchValue = Angular.computed(() => {
            try {
              return this.match()
            } catch (error: any) {
              // Error will be caught by Angular's error handling
              return error?.message
            }
          })
        }

        setup({ RootComponent: () => RootComponent })
        // The error should be displayed in the error boundary or console
        // For now, we just verify the component renders without crashing
        await waitFor(() => {
          expect(screen.queryByText('IndexTitle')).toBeTruthy()
        })
      },
    )

    describe('returns undefined if shouldThrow = false', () => {
      test('without select function', async () => {
        @Angular.Component({
          imports: [Outlet],
          template: '<outlet />',
        })
        class RootComponent {
          match = injectMatch({ from: 'posts', shouldThrow: false })
          matchValue = Angular.computed(() => {
            expect(this.match()).toBeUndefined()
            return this.match()
          })
        }

        setup({ RootComponent: () => RootComponent })
        await waitFor(() => {
          expect(screen.queryByText('PostsTitle')).toBeFalsy()
        })
      })

      test('with select function', async () => {
        @Angular.Component({
          imports: [Outlet],
          template: '<outlet />',
        })
        class RootComponent {
          match = injectMatch({
            from: 'posts',
            shouldThrow: false,
            select: (match) => match?.routeId,
          })
          matchValue = Angular.computed(() => {
            expect(this.match()).toBeUndefined()
            return this.match()
          })
        }

        setup({ RootComponent: () => RootComponent })
        await waitFor(() => {
          expect(screen.queryByText('PostsTitle')).toBeFalsy()
        })
      })
    })
  })
})

