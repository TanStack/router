import * as React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  Scripts,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  useChildMatches,
  useMatch,
  useParams,
  useParentMatches,
  useRouteContext,
  useSearch,
} from '../src'
import { hydrate } from '../src/ssr/client'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.$_TSR
})

test.each([true, false, 'data-only'] as const)(
  'componentless root shell hydrates its child and scroll script with parent ssr %s',
  async (ssr) => {
    const parentLoader = vi.fn(() => 'parent data')
    const childLoader = vi.fn(() => 'child data')
    const makeRouteTree = () => {
      const root = createRootRoute({
        shellComponent: function Shell({ children }) {
          const match = useMatch({ strict: false })
          const [count, setCount] = React.useState(0)
          return (
            <section data-testid="hydrated-shell">
              <span data-testid="hydrated-shell-route">{match.routeId}</span>
              <button onClick={() => setCount(count + 1)}>
                Shell count {count}
              </button>
              {children}
              <Scripts />
            </section>
          )
        },
      })
      const parent = createRoute({
        getParentRoute: () => root,
        path: 'parent',
        ssr,
        loader: parentLoader,
        pendingComponent: () => (
          <span data-testid="server-pending">Pending parent</span>
        ),
      })
      const child = createRoute({
        getParentRoute: () => parent,
        path: 'child',
        loader: childLoader,
        component: function Child() {
          const match = useMatch({ strict: false })
          return (
            <span data-testid="hydrated-child">
              {`${match.routeId}:${parent.useLoaderData()}:${child.useLoaderData()}`}
            </span>
          )
        },
      })
      return root.addChildren([parent.addChildren([child])])
    }
    const response = await createRequestHandler({
      request: new Request('http://localhost/parent/child'),
      createRouter: () =>
        createRouter({
          routeTree: makeRouteTree(),
          isServer: true,
          scrollRestoration: true,
        }),
    })(({ router, responseHeaders }) =>
      renderRouterToString({
        router,
        responseHeaders,
        children: (
          <html>
            <head />
            <body>
              <RouterServer router={router} />
            </body>
          </html>
        ),
      }),
    )
    expect(response.status).toBe(200)
    const serverDocument = new DOMParser().parseFromString(
      await response.text(),
      'text/html',
    )
    expect(
      serverDocument.querySelector('[data-testid="hydrated-shell-route"]')
        ?.textContent,
    ).toBe('__root__')
    const scripts = Array.from(serverDocument.querySelectorAll('script'))
    expect(
      scripts.filter((script) =>
        script.textContent?.includes('tsr-scroll-restoration'),
      ),
    ).toHaveLength(1)
    if (ssr === true) {
      expect(
        serverDocument.querySelector('[data-testid="hydrated-child"]')
          ?.textContent,
      ).toBe('/parent/child:parent data:child data')
    } else {
      expect(
        serverDocument.querySelector('[data-testid="hydrated-child"]'),
      ).toBeNull()
      expect(
        serverDocument.querySelector('[data-testid="server-pending"]')
          ?.textContent,
      ).toBe('Pending parent')
    }

    const currentScript = vi.spyOn(document, 'currentScript', 'get')
    try {
      for (const script of scripts) {
        currentScript.mockReturnValue(script)
        new Function(script.textContent ?? '')()
        script.remove()
      }
    } finally {
      currentScript.mockRestore()
    }
    const container = document.createElement('div')
    container.innerHTML = serverDocument.body.innerHTML
    document.body.appendChild(container)
    const originalShell = container.querySelector(
      '[data-testid="hydrated-shell"]',
    )
    const clientRouter = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      scrollRestoration: true,
    })
    const onRecoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await hydrate(clientRouter)
      await act(() => {
        root = hydrateRoot(
          container,
          <RouterProvider router={clientRouter} />,
          { onRecoverableError },
        )
        return Promise.resolve()
      })
      await waitFor(() =>
        expect(
          container.querySelector('[data-testid="hydrated-child"]'),
        ).toHaveTextContent('/parent/child:parent data:child data'),
      )
      expect(container.querySelector('[data-testid="hydrated-shell"]')).toBe(
        originalShell,
      )
      expect(
        container.querySelector('[data-testid="hydrated-shell-route"]'),
      ).toHaveTextContent('__root__')
      expect(
        container.querySelector('[data-testid="server-pending"]'),
      ).toBeNull()
      expect(container.querySelectorAll('script')).toHaveLength(0)
      expect(onRecoverableError).not.toHaveBeenCalled()
      act(() => container.querySelector('button')!.click())
      expect(container.querySelector('button')).toHaveTextContent(
        'Shell count 1',
      )
    } finally {
      if (root) {
        await act(() => root!.unmount())
      }
      container.remove()
    }
  },
)

test('default outlets preserve logical ancestors and the rendered route context', async () => {
  const root = createRootRoute({
    shellComponent: function Shell({ children }) {
      const nearest = useMatch({ strict: false })
      const childIds = useChildMatches({
        select: (matches) => matches.map((match) => match.routeId).join(','),
      })
      return (
        <section>
          <span data-testid="shell-route">{nearest.routeId}</span>
          <span data-testid="child-routes">{childIds}</span>
          {children}
        </section>
      )
    },
  })
  const layout = createRoute({
    getParentRoute: () => root,
    id: '_layout',
    beforeLoad: () => ({ inherited: 'layout context' }),
  })
  const section = createRoute({
    getParentRoute: () => layout,
    path: 'section',
    validateSearch: (search: Record<string, unknown>) => ({
      revision: Number(search.revision ?? 0),
    }),
  })
  const leaf = createRoute({
    getParentRoute: () => section,
    path: '$id',
    component: function Leaf() {
      const nearest = useMatch({ strict: false })
      const params = useParams({ strict: false })
      const search = useSearch({ strict: false })
      const context = useRouteContext({ strict: false })
      const inherited = layout.useRouteContext()
      const parentIds = useParentMatches({
        select: (matches) => matches.map((match) => match.routeId).join(','),
      })
      const [count, setCount] = React.useState(0)
      return (
        <>
          <span data-testid="leaf-route">{nearest.routeId}</span>
          <span data-testid="leaf-data">
            {`${params.id}:${search.revision}:${context.inherited}:${inherited.inherited}`}
          </span>
          <span data-testid="parent-routes">{parentIds}</span>
          <button onClick={() => setCount(count + 1)}>Count {count}</button>
        </>
      )
    },
  })
  const empty = createRoute({
    getParentRoute: () => section,
    path: 'empty',
  })
  const router = createRouter({
    routeTree: root.addChildren([
      layout.addChildren([section.addChildren([leaf, empty])]),
    ]),
    history: createMemoryHistory({
      initialEntries: ['/section/first?revision=1'],
    }),
  })

  await router.load()
  render(<RouterProvider router={router} />)
  expect(screen.getByTestId('shell-route')).toHaveTextContent(root.id)
  expect(screen.getByTestId('leaf-route')).toHaveTextContent(leaf.id)
  expect(screen.getByTestId('leaf-data')).toHaveTextContent(
    'first:1:layout context:layout context',
  )
  expect(screen.getByTestId('parent-routes')).toHaveTextContent(
    [root.id, layout.id, section.id].join(','),
  )
  expect(screen.getByTestId('child-routes')).toHaveTextContent(
    [layout.id, section.id, leaf.id].join(','),
  )
  act(() => screen.getByRole('button').click())

  await act(() =>
    router.navigate({
      to: '/section/$id',
      params: { id: 'second' },
      search: { revision: 2 },
    }),
  )
  expect(screen.getByTestId('leaf-data')).toHaveTextContent(
    'second:2:layout context:layout context',
  )
  expect(screen.getByRole('button')).toHaveTextContent('Count 1')

  await act(() =>
    router.navigate({ to: '/section/empty', search: { revision: 3 } }),
  )
  expect(screen.queryByTestId('leaf-route')).not.toBeInTheDocument()
  expect(screen.getByTestId('child-routes')).toHaveTextContent(
    [layout.id, section.id, empty.id].join(','),
  )
})

test('a router default component renders instead of the implicit outlet', async () => {
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({ getParentRoute: () => root, path: 'parent' })
  const child = createRoute({
    getParentRoute: () => parent,
    path: 'child',
    component: () => <span>Child content</span>,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([child])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    defaultComponent: function DefaultComponent() {
      const match = useMatch({ strict: false })
      return <span>Default component {match.routeId}</span>
    },
  })

  await router.load()
  render(<RouterProvider router={router} />)
  expect(screen.getByText(`Default component ${parent.id}`)).toBeInTheDocument()
  expect(screen.queryByText('Child content')).not.toBeInTheDocument()
})

test('componentless routes retain remountDeps evaluation without remounting their descendants', async () => {
  const remountDeps = vi.fn(({ params }) => params)
  const root = createRootRoute()
  const parent = createRoute({
    getParentRoute: () => root,
    path: '$parentId',
    remountDeps,
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: 'child',
    component: function Child() {
      const [count, setCount] = React.useState(0)
      return (
        <button onClick={() => setCount(count + 1)}>Child count {count}</button>
      )
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([child])]),
    history: createMemoryHistory({ initialEntries: ['/first/child'] }),
  })

  await router.load()
  render(<RouterProvider router={router} />)
  expect(remountDeps).toHaveBeenCalledWith(
    expect.objectContaining({
      routeId: parent.id,
      params: { parentId: 'first' },
    }),
  )
  act(() => screen.getByRole('button').click())
  await act(() =>
    router.navigate({ to: '/$parentId/child', params: { parentId: 'second' } }),
  )
  expect(remountDeps).toHaveBeenCalledWith(
    expect.objectContaining({
      routeId: parent.id,
      params: { parentId: 'second' },
    }),
  )
  expect(screen.getByRole('button')).toHaveTextContent('Child count 1')
})

test('a componentless route uses the router pending component in its own context', async () => {
  const pending = createControlledPromise<void>()
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <span>Home</span>,
  })
  const waiting = createRoute({
    getParentRoute: () => root,
    path: 'waiting',
    loader: () => pending,
  })
  const child = createRoute({
    getParentRoute: () => waiting,
    path: 'child',
    component: () => <span>Loaded child</span>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, waiting.addChildren([child])]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: function PendingComponent() {
      const match = useMatch({ strict: false })
      return <span>Pending {match.routeId}</span>
    },
  })

  await router.load()
  render(<RouterProvider router={router} />)
  let navigation!: Promise<void>
  try {
    act(() => {
      navigation = router.navigate({ to: '/waiting/child' })
    })
    expect(await screen.findByText(`Pending ${waiting.id}`)).toBeInTheDocument()
    expect(screen.queryByText('Loaded child')).not.toBeInTheDocument()
  } finally {
    await act(async () => {
      pending.resolve()
      await navigation
    })
  }
  expect(screen.getByText('Loaded child')).toBeInTheDocument()
})

test('a componentless route uses the router error boundary and recovers on navigation', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const root = createRootRoute()
  const failed = createRoute({
    getParentRoute: () => root,
    path: 'failed',
    loader: () => {
      throw new Error('Componentless loader failed')
    },
  })
  const child = createRoute({
    getParentRoute: () => failed,
    path: 'child',
    component: () => <span>Unreachable child</span>,
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <span>Recovered home</span>,
  })
  const router = createRouter({
    routeTree: root.addChildren([failed.addChildren([child]), home]),
    history: createMemoryHistory({ initialEntries: ['/failed/child'] }),
    defaultErrorComponent: function DefaultError({ error }) {
      const match = useMatch({ strict: false })
      return (
        <span>{`${match.routeId}: ${error instanceof Error ? error.message : String(error)}`}</span>
      )
    },
  })

  await router.load()
  render(<RouterProvider router={router} />)
  expect(
    await screen.findByText(`${failed.id}: Componentless loader failed`),
  ).toBeInTheDocument()
  expect(screen.queryByText('Unreachable child')).not.toBeInTheDocument()

  await act(() => router.navigate({ to: '/' }))
  expect(screen.getByText('Recovered home')).toBeInTheDocument()
  expect(
    screen.queryByText(`${failed.id}: Componentless loader failed`),
  ).not.toBeInTheDocument()
})

test.each(['route', 'router'] as const)(
  'switching the %s component between implicit and built-in Outlet preserves child state',
  async (owner) => {
    const root = createRootRoute({ component: () => <Outlet /> })
    const parent = createRoute({ getParentRoute: () => root, path: 'parent' })
    const child = createRoute({
      getParentRoute: () => parent,
      path: 'child',
      component: function Child() {
        const [count, setCount] = React.useState(0)
        return (
          <button onClick={() => setCount(count + 1)}>
            Child count {count}
          </button>
        )
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([parent.addChildren([child])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()
    render(<RouterProvider router={router} />)
    act(() => screen.getByRole('button').click())
    const button = screen.getByRole('button')

    for (const component of [Outlet, undefined]) {
      await act(async () => {
        if (owner === 'route') {
          parent.update({ component })
        } else {
          router.update({ defaultComponent: component })
        }
        await router.invalidate()
      })
      expect(screen.getByRole('button')).toBe(button)
      expect(screen.getByRole('button')).toHaveTextContent('Child count 1')
    }
  },
)

test.each(['route', 'router'] as const)(
  'the %s built-in Outlet remounts descendants when its remountDeps change',
  async (owner) => {
    const root = createRootRoute({ component: () => <Outlet /> })
    const parent = createRoute({
      getParentRoute: () => root,
      path: '$parentId',
      component: owner === 'route' ? Outlet : undefined,
      remountDeps: ({ params }) => params,
    })
    const child = createRoute({
      getParentRoute: () => parent,
      path: 'child',
      component: function Child() {
        const [count, setCount] = React.useState(0)
        return (
          <button onClick={() => setCount(count + 1)}>
            Child count {count}
          </button>
        )
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([parent.addChildren([child])]),
      history: createMemoryHistory({ initialEntries: ['/first/child'] }),
      defaultComponent: owner === 'router' ? Outlet : undefined,
    })

    await router.load()
    render(<RouterProvider router={router} />)
    act(() => screen.getByRole('button').click())
    expect(screen.getByRole('button')).toHaveTextContent('Child count 1')
    await act(() =>
      router.navigate({
        to: '/$parentId/child',
        params: { parentId: 'second' },
      }),
    )
    expect(screen.getByRole('button')).toHaveTextContent('Child count 0')
  },
)

test('componentless root and parent retain their not-found ownership', async () => {
  const root = createRootRoute({
    notFoundComponent: function RootNotFound() {
      const match = useMatch({ strict: false })
      return <span>Root missing {match.routeId}</span>
    },
  })
  const parent = createRoute({
    getParentRoute: () => root,
    path: 'parent',
    notFoundComponent: function ParentNotFound() {
      const match = useMatch({ strict: false })
      return <span>Parent missing {match.routeId}</span>
    },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: 'child',
    component: () => {
      throw notFound()
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([child])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  await router.load()
  render(<RouterProvider router={router} />)
  expect(
    await screen.findByText(`Parent missing ${parent.id}`),
  ).toBeInTheDocument()

  await act(() => router.navigate({ to: '/missing' as any }))
  expect(screen.getByText(`Root missing ${root.id}`)).toBeInTheDocument()
  expect(
    screen.queryByText(`Parent missing ${parent.id}`),
  ).not.toBeInTheDocument()
})
