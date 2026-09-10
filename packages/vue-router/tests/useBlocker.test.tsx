import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'

import * as Vue from 'vue'
import { z } from 'zod'
import {
  Block,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
  useNavigate,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe('useBlocker', () => {
  test('does not block navigation when not enabled', async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn: () => false })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')
  })

  test('does not block navigation when disabled', async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn: () => true, disabled: true })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')
  })

  test('blocks navigation when enabled', async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn: () => true })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')
  })

  test('gives correct arguments to shouldBlockFn', async () => {
    const rootRoute = createRootRoute()

    let receiver: unknown = 'not called'
    const shouldBlockFn = vi.fn(function (this: unknown) {
      receiver = this
      return true
    })

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts', replace: true })}>
            Posts
          </button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')
    expect(receiver).toBeUndefined()

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

  test('gives correct arguments to shouldBlockFn with path and search params', async () => {
    const rootRoute = createRootRoute()

    const shouldBlockFn = vi.fn().mockReturnValue(true)

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button
            onClick={() =>
              navigate({
                to: '/posts/$postId',
                params: { postId: '10' },
                search: { param1: 'foo', param2: 'bar' },
              })
            }
          >
            Posts
          </button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      validateSearch: z.object({
        param1: z.string().default('param1-default'),
        param2: z.string().default('param2-default'),
      }),
      path: '/posts/$postId',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')

    expect(shouldBlockFn).toHaveBeenCalledWith({
      action: 'PUSH',
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
        pathname: '/posts/10',
        params: { postId: '10' },
        search: { param1: 'foo', param2: 'bar' },
      },
    })
  })

  test('conditionally blocking navigation works', async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker<Router>({
        shouldBlockFn: ({ next }) => {
          if (next.fullPath === '/posts') {
            return true
          }
          return false
        },
      })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
          <button onClick={() => navigate({ to: '/invoices' })}>
            Invoices
          </button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/invoices',
      component: () => {
        return (
          <>
            <h1>Invoices</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute, invoicesRoute]),
    })

    type Router = typeof router

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')

    const invoicesButton = await screen.findByRole('button', {
      name: 'Invoices',
    })

    fireEvent.click(invoicesButton)

    expect(
      await screen.findByRole('heading', { name: 'Invoices' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/invoices')
  })

  test('defaults only undefined hook options', async () => {
    const rootRoute = createRootRoute()
    const history = createMemoryHistory()
    const block = vi.spyOn(history, 'block')
    const results: Array<unknown> = []

    const IndexComponent = Vue.defineComponent({
      setup() {
        results.push(
          useBlocker({
            shouldBlockFn: () => false,
            enableBeforeUnload: undefined,
            disabled: undefined,
            withResolver: undefined,
          }),
          useBlocker({
            shouldBlockFn: () => false,
            enableBeforeUnload: null,
            disabled: null,
            withResolver: null,
          } as any),
        )

        return () => <h1>Index</h1>
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history,
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'Index' })).toBeVisible()
    expect(results).toEqual([undefined, undefined])
    expect(
      block.mock.calls.map(([options]) => options.enableBeforeUnload),
    ).toEqual([true, null])
  })

  test.each(['useBlocker', '<Block />'] as const)(
    '%s resolver returns to idle after reset and proceed',
    async (surface) => {
      const history = createMemoryHistory({ initialEntries: ['/'] })
      const renderResolver = (resolver: {
        status: 'idle' | 'blocked'
        reset?: () => void
        proceed?: () => void
      }) => (
        <>
          <span data-testid="blocker-status">{resolver.status}</span>
          {resolver.status === 'blocked' && (
            <>
              <button onClick={() => resolver.reset?.()}>Reset blocker</button>
              <button onClick={() => resolver.proceed?.()}>
                Proceed blocker
              </button>
            </>
          )}
        </>
      )

      const RootComponent = Vue.defineComponent({
        setup() {
          const navigate = useNavigate()
          const renderNavigation = () => (
            <>
              <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
              <Outlet />
            </>
          )

          if (surface === 'useBlocker') {
            const blocker = useBlocker({
              shouldBlockFn: () => true,
              withResolver: true,
            })

            return () => (
              <>
                {renderResolver(blocker.value)}
                {renderNavigation()}
              </>
            )
          }

          return () => (
            <>
              <Block
                shouldBlockFn={() => true}
                withResolver={true}
                children={renderResolver}
              />
              {renderNavigation()}
            </>
          )
        },
      })

      const rootRoute = createRootRoute({ component: RootComponent })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <h1>Index</h1>,
      })
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts',
        component: () => <h1>Posts</h1>,
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        history,
      })

      render(<RouterProvider router={router} />)

      const postsButton = await screen.findByRole('button', { name: 'Posts' })
      expect(screen.getByTestId('blocker-status')).toHaveTextContent('idle')

      await fireEvent.click(postsButton)
      await waitFor(() => {
        expect(screen.getByTestId('blocker-status')).toHaveTextContent(
          'blocked',
        )
      })
      expect(history.location.pathname).toBe('/')

      await fireEvent.click(
        screen.getByRole('button', { name: 'Reset blocker' }),
      )
      await waitFor(() => {
        expect(screen.getByTestId('blocker-status')).toHaveTextContent('idle')
      })
      expect(history.location.pathname).toBe('/')
      expect(screen.getByRole('heading', { name: 'Index' })).toBeVisible()

      await fireEvent.click(postsButton)
      await waitFor(() => {
        expect(screen.getByTestId('blocker-status')).toHaveTextContent(
          'blocked',
        )
      })

      await fireEvent.click(
        screen.getByRole('button', { name: 'Proceed blocker' }),
      )
      expect(
        await screen.findByRole('heading', { name: 'Posts' }),
      ).toBeVisible()
      expect(screen.getByTestId('blocker-status')).toHaveTextContent('idle')
      expect(history.location.pathname).toBe('/posts')
    },
  )

  test('<Block /> resubscribes to reactive options and cleans up in order', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const nextHistory = createMemoryHistory({ initialEntries: ['/posts'] })
    const firstShouldBlock = vi.fn(() => false)
    const secondShouldBlock = vi.fn(() => true)
    const shouldBlockFn = Vue.ref(firstShouldBlock)
    const enableBeforeUnload = Vue.ref<boolean | (() => boolean)>(true)
    const withResolver = Vue.ref(false)
    const events: Array<string> = []
    let nextSubscriptionId = 0
    const actualBlock = history.block.bind(history)
    const block = vi.spyOn(history, 'block').mockImplementation((options) => {
      const subscriptionId = ++nextSubscriptionId
      events.push(`subscribe:${subscriptionId}`)
      const unsubscribe = actualBlock(options)

      return () => {
        events.push(`unsubscribe:${subscriptionId}`)
        unsubscribe()
      }
    })

    const IndexComponent = Vue.defineComponent({
      setup() {
        return () => (
          <>
            <Block
              shouldBlockFn={shouldBlockFn.value}
              enableBeforeUnload={enableBeforeUnload.value}
              withResolver={withResolver.value as true}
              children={(resolver) => (
                <>
                  <span data-testid="reactive-blocker-status">
                    {resolver.status}
                  </span>
                  {resolver.status === 'blocked' && (
                    <>
                      <button onClick={resolver.reset}>
                        Reset reactive blocker
                      </button>
                      <button onClick={resolver.proceed}>
                        Proceed reactive blocker
                      </button>
                    </>
                  )}
                </>
              )}
            />
            <h1>Index</h1>
          </>
        )
      },
    })

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })
    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => <h1>Posts</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    const view = render(<RouterProvider router={router} />)
    const blockerArgs = {
      action: 'PUSH' as const,
      currentLocation: history.location,
      nextLocation: nextHistory.location,
    }

    expect(await screen.findByRole('heading', { name: 'Index' })).toBeVisible()
    await waitFor(() => expect(block).toHaveBeenCalledTimes(1))

    await expect(block.mock.calls[0]![0].blockerFn(blockerArgs)).resolves.toBe(
      false,
    )
    expect(firstShouldBlock).toHaveBeenCalledTimes(1)

    shouldBlockFn.value = secondShouldBlock
    await waitFor(() => expect(block).toHaveBeenCalledTimes(2))
    await expect(block.mock.calls[1]![0].blockerFn(blockerArgs)).resolves.toBe(
      true,
    )
    expect(secondShouldBlock).toHaveBeenCalledTimes(1)

    enableBeforeUnload.value = false
    await waitFor(() => expect(block).toHaveBeenCalledTimes(3))

    withResolver.value = true
    await waitFor(() => expect(block).toHaveBeenCalledTimes(4))

    const resetResult = block.mock.calls[3]![0].blockerFn(blockerArgs)
    await waitFor(() => {
      expect(screen.getByTestId('reactive-blocker-status')).toHaveTextContent(
        'blocked',
      )
    })
    await fireEvent.click(
      screen.getByRole('button', { name: 'Reset reactive blocker' }),
    )
    await expect(resetResult).resolves.toBe(true)
    await waitFor(() => {
      expect(screen.getByTestId('reactive-blocker-status')).toHaveTextContent(
        'idle',
      )
    })

    const proceedResult = block.mock.calls[3]![0].blockerFn(blockerArgs)
    await waitFor(() => {
      expect(screen.getByTestId('reactive-blocker-status')).toHaveTextContent(
        'blocked',
      )
    })
    await fireEvent.click(
      screen.getByRole('button', { name: 'Proceed reactive blocker' }),
    )
    await expect(proceedResult).resolves.toBe(false)
    await waitFor(() => {
      expect(screen.getByTestId('reactive-blocker-status')).toHaveTextContent(
        'idle',
      )
    })
    expect(secondShouldBlock).toHaveBeenCalledTimes(3)

    expect(
      block.mock.calls.map(([options]) => options.enableBeforeUnload),
    ).toEqual([true, true, false, false])
    expect(events).toEqual([
      'subscribe:1',
      'unsubscribe:1',
      'subscribe:2',
      'unsubscribe:2',
      'subscribe:3',
      'unsubscribe:3',
      'subscribe:4',
    ])

    view.unmount()

    expect(events).toEqual([
      'subscribe:1',
      'unsubscribe:1',
      'subscribe:2',
      'unsubscribe:2',
      'subscribe:3',
      'unsubscribe:3',
      'subscribe:4',
      'unsubscribe:4',
    ])
  })

  test('<Block /> disabled property is reactive', async () => {
    const rootRoute = createRootRoute()

    // Use a shared reactive ref for the disabled state
    const disabled = Vue.ref(false)
    let receiver: unknown = 'not called'
    const shouldBlockFn = vi.fn(function (this: unknown) {
      receiver = this
      return true
    })

    const IndexComponent = Vue.defineComponent({
      setup() {
        const navigate = useNavigate()

        return () => (
          <>
            <Block shouldBlockFn={shouldBlockFn} disabled={disabled.value} />
            <h1>Index</h1>
            <button onClick={() => navigate({ to: '/' })}>Index</button>
            <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
          </>
        )
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent as any,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    let postsButton = await screen.findByRole('button', { name: 'Posts' })

    await fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')
    expect(receiver).toMatchObject({ shouldBlockFn })

    // Update the shared ref - Vue's reactivity will propagate the change
    disabled.value = true
    await Vue.nextTick()

    postsButton = await screen.findByRole('button', { name: 'Posts' })

    await fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')
  })

  test('should allow navigation from 404 page when blocker is active', async () => {
    const rootRoute = createRootRoute({
      notFoundComponent: function NotFoundComponent() {
        const navigate = useNavigate()

        useBlocker({ shouldBlockFn: () => true })

        return (
          <>
            <h1>Not Found</h1>
            <button onClick={() => navigate({ to: '/' })}>Go Home</button>
            <button onClick={() => navigate({ to: '/posts' })}>
              Go to Posts
            </button>
          </>
        )
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
          </>
        )
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    await router.navigate({ to: '/non-existent' as any })

    expect(
      await screen.findByRole('heading', { name: 'Not Found' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/non-existent')

    const homeButton = await screen.findByRole('button', { name: 'Go Home' })
    fireEvent.click(homeButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')
  })

  test('should handle blocker navigation from 404 to another 404', async () => {
    const rootRoute = createRootRoute({
      notFoundComponent: function NotFoundComponent() {
        const navigate = useNavigate()

        useBlocker({ shouldBlockFn: () => true })

        return (
          <>
            <h1>Not Found</h1>
            <button onClick={() => navigate({ to: '/another-404' as any })}>
              Go to Another 404
            </button>
          </>
        )
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    render(<RouterProvider router={router} />)

    await router.navigate({ to: '/non-existent' })

    expect(
      await screen.findByRole('heading', { name: 'Not Found' }),
    ).toBeInTheDocument()

    const anotherButton = await screen.findByRole('button', {
      name: 'Go to Another 404',
    })
    fireEvent.click(anotherButton)

    expect(
      await screen.findByRole('heading', { name: 'Not Found' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/non-existent')
  })

  test('navigate function should handle external URLs with ignoreBlocker', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
    })

    await expect(
      router.navigate({
        to: 'https://example.com',
        ignoreBlocker: true,
      }),
    ).resolves.toBeUndefined()

    await expect(
      router.navigate({
        to: 'https://example.com',
      }),
    ).resolves.toBeUndefined()
  })
})
