import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { createMemoryHistory } from '@tanstack/history'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouteContext,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('allows accessing parent and root route context inside a pendingComponent', async () => {
  const loaderStarted = createControlledPromise<void>()
  const loaderGate = createControlledPromise<void>()

  const rootRoute = createRootRoute({
    beforeLoad: () => ({ rootValue: 'from-root' }),
    component: Outlet,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: () => ({ parentValue: 'from-parent' }),
    component: Outlet,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <span>Home</span>,
  })

  function NestedPendingHelper() {
    const parentCtx = useRouteContext({ from: parentRoute.id })
    return <span data-testid="nested-helper">{parentCtx().parentValue}</span>
  }

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    beforeLoad: () => ({ childValue: 'from-child' }),
    loader: async () => {
      loaderStarted.resolve()
      await loaderGate
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => {
      const rootCtx = rootRoute.useRouteContext()
      const parentCtx = parentRoute.useRouteContext()
      return (
        <div data-testid="child-pending">
          <span data-testid="pending-root">{rootCtx().rootValue}</span>
          <span data-testid="pending-parent">{parentCtx().parentValue}</span>
          <NestedPendingHelper />
        </div>
      )
    },
    component: () => {
      const ctx = childRoute.useRouteContext()
      const looseCtx = useRouteContext({ strict: false })
      return (
        <div data-testid="child-ready">
          {ctx().rootValue}/{ctx().parentValue}/{ctx().childValue}/
          {looseCtx().childValue}
        </div>
      )
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  let navigation: Promise<void> | undefined
  try {
    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeVisible()

    navigation = router.navigate({ to: '/parent/child' })
    await loaderStarted

    expect(await screen.findByTestId('child-pending')).toBeVisible()
    expect(screen.getByTestId('pending-root')).toHaveTextContent('from-root')
    expect(screen.getByTestId('pending-parent')).toHaveTextContent(
      'from-parent',
    )
    expect(screen.getByTestId('nested-helper')).toHaveTextContent('from-parent')

    loaderGate.resolve()
    await navigation

    expect(await screen.findByTestId('child-ready')).toHaveTextContent(
      'from-root/from-parent/from-child/from-child',
    )
  } finally {
    loaderGate.resolve()
    await Promise.allSettled(navigation ? [navigation] : [])
  }
})

test.each([
  {
    name: 'self route.useRouteContext() during beforeLoad pending',
    gatePhase: 'beforeLoad' as const,
    readContext: (childRoute: any) => childRoute.useRouteContext(),
    expectedMessage:
      'Cannot access route context for "/parent/child" inside its own pendingComponent. Inside a pendingComponent, only parent route contexts can be accessed. To access inherited context, use `useRouteContext({ from: \'/parent\' })`.',
  },
  {
    name: 'self route.useRouteContext() during loader pending',
    gatePhase: 'loader' as const,
    readContext: (childRoute: any) => childRoute.useRouteContext(),
    expectedMessage:
      'Cannot access route context for "/parent/child" inside its own pendingComponent. Inside a pendingComponent, only parent route contexts can be accessed. To access inherited context, use `useRouteContext({ from: \'/parent\' })`.',
  },
  {
    name: 'useRouteContext({ strict: false }) during loader pending',
    gatePhase: 'loader' as const,
    readContext: () => useRouteContext({ strict: false }),
    expectedMessage:
      'Cannot access route context inside the pendingComponent of "/parent/child". Inside a pendingComponent, only parent route contexts can be accessed. To access inherited context, use `useRouteContext({ from: \'/parent\' })`.',
  },
])(
  'throws when accessing $name inside a pendingComponent',
  async ({ gatePhase, readContext, expectedMessage }) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const started = createControlledPromise<void>()
    const gate = createControlledPromise<void>()
    const caughtErrors: Array<unknown> = []

    const rootRoute = createRootRoute({
      beforeLoad: () => ({ rootValue: 'from-root' }),
      component: Outlet,
      errorComponent: ({ error }) => (
        <div data-testid="root-error">
          {error instanceof Error ? error.message : String(error)}
        </div>
      ),
      onCatch: (error) => {
        caughtErrors.push(error)
      },
    })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: () => ({ parentValue: 'from-parent' }),
      component: Outlet,
    })
    const parentIndexRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/',
      component: () => <span>Parent Home</span>,
    })

    function NestedPendingChild() {
      readContext(childRoute)
      return <span>Should not render</span>
    }

    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: async () => {
        if (gatePhase === 'beforeLoad') {
          started.resolve()
          await gate
        }
        return { childValue: 'from-child' }
      },
      loader: async () => {
        if (gatePhase === 'loader') {
          started.resolve()
          await gate
        }
      },
      pendingMs: 0,
      pendingMinMs: 0,
      pendingComponent: () => <NestedPendingChild />,
      errorComponent: ({ error }) => {
        const selfCtx = childRoute.useRouteContext()
        return (
          <div data-testid="child-error">
            {error instanceof Error ? error.message : String(error)}|
            {selfCtx().parentValue}
          </div>
        )
      },
      onCatch: (error) => {
        caughtErrors.push(error)
      },
      component: () => <span>Child ready</span>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([parentIndexRoute, childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent'] }),
    })

    let navigation: Promise<void> | undefined
    try {
      render(() => <RouterProvider router={router} />)
      expect(await screen.findByText('Parent Home')).toBeVisible()

      navigation = router.navigate({ to: '/parent/child' })
      await started

      expect(
        await screen.findByText((content) => content.includes(expectedMessage)),
      ).toBeVisible()
      expect(caughtErrors).toContainEqual(
        expect.objectContaining({ message: expectedMessage }),
      )
    } finally {
      gate.resolve()
      await Promise.allSettled(navigation ? [navigation] : [])
    }
  },
)

test('throws when accessing child route context inside a parent pendingComponent', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  const parentReloadStarted = createControlledPromise<void>()
  const parentReloadGate = createControlledPromise<void>()
  let parentLoads = 0

  const rootRoute = createRootRoute({
    beforeLoad: () => ({ rootValue: 'from-root' }),
    component: Outlet,
    errorComponent: ({ error }) => (
      <div data-testid="root-error">
        {error instanceof Error ? error.message : String(error)}
      </div>
    ),
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: () => ({ parentValue: 'from-parent' }),
    loader: async () => {
      if (++parentLoads > 1) {
        parentReloadStarted.resolve()
        await parentReloadGate
      }
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => {
      childRoute.useRouteContext()
      return <span>Should not render</span>
    },
    errorComponent: ({ error }) => (
      <div data-testid="parent-error">
        {error instanceof Error ? error.message : String(error)}
      </div>
    ),
    component: Outlet,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    beforeLoad: () => ({ childValue: 'from-child' }),
    component: Outlet,
  })
  const grandchildRoute = createRoute({
    getParentRoute: () => childRoute,
    path: '/grandchild',
    beforeLoad: () => ({ grandchildValue: 'from-grandchild' }),
    component: () => <div data-testid="grandchild-ready">Grandchild ready</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([childRoute.addChildren([grandchildRoute])]),
    ]),
    history: createMemoryHistory({
      initialEntries: ['/parent/child/grandchild'],
    }),
  })

  let invalidation: Promise<void> | undefined
  try {
    render(() => <RouterProvider router={router} />)
    expect(await screen.findByTestId('grandchild-ready')).toBeVisible()

    invalidation = router.invalidate({
      filter: (match) => match.routeId === parentRoute.id,
      forcePending: true,
    })
    await parentReloadStarted

    expect(
      await screen.findByText(
        'Cannot access route context for "/parent/child" inside the pendingComponent of "/parent". Inside a pendingComponent, only parent route contexts can be accessed. To access inherited context, use `useRouteContext({ from: rootRouteId })`.',
      ),
    ).toBeVisible()
  } finally {
    parentReloadGate.resolve()
    await Promise.allSettled(invalidation ? [invalidation] : [])
  }
})

test('throws when accessing grandchild route context inside a parent pendingComponent', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  const parentStarted = createControlledPromise<void>()
  const parentGate = createControlledPromise<void>()

  const rootRoute = createRootRoute({
    component: Outlet,
    errorComponent: ({ error }) => (
      <div data-testid="root-error">
        {error instanceof Error ? error.message : String(error)}
      </div>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <span>Home</span>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: async () => {
      parentStarted.resolve()
      await parentGate
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => {
      grandchildRoute.useRouteContext()
      return <span>Should not render</span>
    },
    errorComponent: ({ error }) => (
      <div data-testid="parent-error">
        {error instanceof Error ? error.message : String(error)}
      </div>
    ),
    component: Outlet,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    component: Outlet,
  })
  const grandchildRoute = createRoute({
    getParentRoute: () => childRoute,
    path: '/grandchild',
    component: () => <span>Grandchild</span>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute.addChildren([grandchildRoute])]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  let navigation: Promise<void> | undefined
  try {
    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeVisible()

    navigation = router.navigate({ to: '/parent/child/grandchild' })
    await parentStarted

    expect(
      await screen.findByText(
        'Cannot access route context for "/parent/child/grandchild" inside the pendingComponent of "/parent". Inside a pendingComponent, only parent route contexts can be accessed. To access inherited context, use `useRouteContext({ from: rootRouteId })`.',
      ),
    ).toBeVisible()
  } finally {
    parentGate.resolve()
    await Promise.allSettled(navigation ? [navigation] : [])
  }
})

test('throws when accessing root route context inside rootRoute pendingComponent', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  const rootStarted = createControlledPromise<void>()
  const rootGate = createControlledPromise<void>()

  const rootRoute = createRootRoute({
    beforeLoad: async () => {
      rootStarted.resolve()
      await rootGate
      return { rootValue: 'from-root' }
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => {
      rootRoute.useRouteContext()
      return <span>Should not render</span>
    },
    errorComponent: ({ error }) => (
      <div data-testid="root-error">
        {error instanceof Error ? error.message : String(error)}
      </div>
    ),
    component: Outlet,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <span>Home</span>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  try {
    render(() => <RouterProvider router={router} />)
    await rootStarted

    expect(
      await screen.findByText(
        'Cannot access route context for the root route inside its own pendingComponent. Inside a pendingComponent, only parent route contexts can be accessed, and the root route has no parent.',
      ),
    ).toBeVisible()
  } finally {
    rootGate.resolve()
    await router.load()
  }
})

test('enforces parent-only route context inside router defaultPendingComponent', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  const loaderStarted = createControlledPromise<void>()
  const loaderGate = createControlledPromise<void>()

  const rootRoute = createRootRoute({
    beforeLoad: () => ({ rootValue: 'from-root' }),
    component: Outlet,
    errorComponent: ({ error }) => (
      <div data-testid="root-error">
        {error instanceof Error ? error.message : String(error)}
      </div>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <span>Home</span>,
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    loader: async () => {
      loaderStarted.resolve()
      await loaderGate
    },
    pendingMs: 0,
    pendingMinMs: 0,
    errorComponent: ({ error }) => (
      <div data-testid="child-error">
        {error instanceof Error ? error.message : String(error)}
      </div>
    ),
    component: () => <span>Child</span>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, childRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingComponent: () => {
      childRoute.useRouteContext()
      return <span>Default pending</span>
    },
  })

  let navigation: Promise<void> | undefined
  try {
    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Home')).toBeVisible()

    navigation = router.navigate({ to: '/child' })
    await loaderStarted

    expect(
      await screen.findByText(
        'Cannot access route context for "/child" inside its own pendingComponent. Inside a pendingComponent, only parent route contexts can be accessed. To access inherited context, use `useRouteContext({ from: rootRouteId })`.',
      ),
    ).toBeVisible()
  } finally {
    loaderGate.resolve()
    await Promise.allSettled(navigation ? [navigation] : [])
  }
})
