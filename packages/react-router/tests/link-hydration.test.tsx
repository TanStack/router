import React from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { act } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

declare module '@tanstack/history' {
  interface HistoryState {
    hydrationMarker?: string
    navigationMarker?: string
  }
}

test('only hash-sensitive links need a second hydration render', async () => {
  const rootRoute = createRootRoute()
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/target' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/target#section'] }),
  })
  await router.load()
  const serverRouter = createRouter({
    routeTree: router.routeTree,
    history: createMemoryHistory({ initialEntries: ['/target'] }),
    isServer: true,
  })
  await serverRouter.load()
  const ordinary = vi.fn(({ isActive }: { isActive: boolean }) =>
    String(isActive),
  )
  const hashSensitive = vi.fn(({ isActive }: { isActive: boolean }) =>
    String(isActive),
  )
  const tree = (includeHash = false, contextRouter = router) => (
    <RouterContextProvider router={contextRouter}>
      <Link
        to="/target"
        hash="other"
        activeOptions={{ includeHash }}
        activeProps={{ title: 'active' }}
        inactiveProps={{ title: 'inactive' }}
        data-testid="ordinary"
      >
        {ordinary}
      </Link>
      <Link
        to="/target"
        hash="section"
        activeOptions={{ includeHash: true }}
        activeProps={{ title: 'active' }}
        inactiveProps={{ title: 'inactive' }}
        data-testid="hash"
      >
        {hashSensitive}
      </Link>
    </RouterContextProvider>
  )
  const container = document.createElement('div')
  document.body.append(container)
  container.innerHTML = renderToString(tree(false, serverRouter))
  expect(container.querySelector('[data-testid="ordinary"]')?.textContent).toBe(
    'true',
  )
  expect(container.querySelector('[data-testid="hash"]')?.textContent).toBe(
    'false',
  )
  ordinary.mockClear()
  hashSensitive.mockClear()
  const onRecoverableError = vi.fn()
  const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => {})
  const serverAnchor = container.querySelector('[data-testid="ordinary"]')
  let root: ReturnType<typeof hydrateRoot> | undefined
  try {
    await act(() => {
      root = hydrateRoot(container, tree(), { onRecoverableError })
    })
    expect(ordinary).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="ordinary"]')).toBe(
      serverAnchor,
    )
    expect(hashSensitive.mock.calls.map(([state]) => state.isActive)).toEqual([
      false,
      true,
    ])
    expect(container.querySelector('[data-testid="hash"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(container.querySelector('[data-testid="hash"]')).toHaveAttribute(
      'title',
      'active',
    )
    await act(() => root!.render(tree(true)))
    expect(
      container.querySelector('[data-testid="ordinary"]'),
    ).not.toHaveAttribute('aria-current')
    expect(container.querySelector('[data-testid="ordinary"]')).toHaveAttribute(
      'title',
      'inactive',
    )
    await act(() => root!.render(tree(false)))
    expect(container.querySelector('[data-testid="ordinary"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(diagnostics).not.toHaveBeenCalled()
  } finally {
    await act(() => root?.unmount())
    router.history.destroy()
    serverRouter.history.destroy()
    diagnostics.mockRestore()
    container.remove()
  }
})

test('hash-sensitive links retain the server snapshot in a delayed hydration boundary', async () => {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/target' }),
  ])
  const serverRouter = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/target'] }),
    isServer: true,
  })
  const clientRouter = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/target#section'] }),
  })
  await Promise.all([serverRouter.load(), clientRouter.load()])
  let ready = true
  let resolve!: () => void
  const pending = new Promise<void>((done) => {
    resolve = done
  })
  const ordinary = vi.fn(() => 'ordinary')
  const hashSensitive = vi.fn(({ isActive }: { isActive: boolean }) =>
    String(isActive),
  )
  function DeferredLinks() {
    if (!ready) {
      throw pending
    }
    return (
      <>
        <Link to="/target">{ordinary}</Link>
        <Link to="/target" hash="section" activeOptions={{ includeHash: true }}>
          {hashSensitive}
        </Link>
      </>
    )
  }
  const tree = (router: typeof clientRouter) => (
    <RouterContextProvider router={router}>
      <React.Suspense fallback={<p>Loading</p>}>
        <DeferredLinks />
      </React.Suspense>
    </RouterContextProvider>
  )
  const container = document.createElement('div')
  document.body.append(container)
  container.innerHTML = renderToString(tree(serverRouter))
  const serverAnchor = container.querySelector('a')
  ordinary.mockClear()
  hashSensitive.mockClear()
  ready = false
  const onRecoverableError = vi.fn()
  const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => {})
  let root: ReturnType<typeof hydrateRoot> | undefined
  try {
    await act(() => {
      root = hydrateRoot(container, tree(clientRouter), { onRecoverableError })
    })
    expect(ordinary).not.toHaveBeenCalled()
    expect(hashSensitive).not.toHaveBeenCalled()
    await act(async () => {
      ready = true
      resolve()
      await pending
    })
    expect(ordinary).toHaveBeenCalledTimes(1)
    expect(hashSensitive.mock.calls.map(([state]) => state.isActive)).toEqual([
      false,
      true,
    ])
    expect(container.querySelector('a')).toBe(serverAnchor)
    expect(container.querySelectorAll('a')[1]).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(diagnostics).not.toHaveBeenCalled()
  } finally {
    await act(() => root?.unmount())
    serverRouter.history.destroy()
    clientRouter.history.destroy()
    diagnostics.mockRestore()
    container.remove()
  }
})

test.each([
  'disabled matching hash',
  'disabled mismatching hash',
  'direct external',
  'direct blocked',
  'rewritten external',
  'rewritten blocked',
] as const)(
  'hash-sensitive %s Link preserves SSR markup and its client classification during hydration',
  async (kind) => {
    const disabled = kind.startsWith('disabled')
    const matching = kind === 'disabled matching hash'
    const external = kind.endsWith('external')
    const blocked = kind.endsWith('blocked')
    const rewritten = kind.startsWith('rewritten')
    const externalHref = 'https://other.example/target#section'
    const to =
      kind === 'direct external'
        ? externalHref
        : kind === 'direct blocked'
          ? 'javascript:blocked()'
          : '/target'
    const hash = kind === 'disabled mismatching hash' ? 'other' : 'section'
    const routeTree = createRootRoute()
    routeTree.addChildren([
      createRoute({ getParentRoute: () => routeTree, path: '/source' }),
      createRoute({ getParentRoute: () => routeTree, path: '/target' }),
    ])
    const rewrite = rewritten
      ? {
          output: ({ url }: { url: URL }) =>
            url.pathname === '/target'
              ? new URL(blocked ? 'javascript:blocked()' : externalHref)
              : url,
        }
      : undefined
    // Loading the current source remains valid. Only the Link destination is
    // rewritten; disabled cases still load /target to exercise active matching.
    const currentPath = rewritten ? '/source' : '/target'
    const serverRouter = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [currentPath] }),
      isServer: true,
      rewrite,
    })
    const clientRouter = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [`${currentPath}#section`],
      }),
      rewrite,
    })
    const renderState = vi.fn(({ isActive }: { isActive: boolean }) =>
      String(isActive),
    )
    const tree = (router: typeof clientRouter) => (
      <RouterContextProvider router={router}>
        <Link
          to={to}
          hash={hash}
          disabled={disabled}
          activeOptions={{ includeHash: true }}
          activeProps={{ title: 'active' }}
          inactiveProps={{ title: 'inactive' }}
          data-testid="classification"
        >
          {renderState}
        </Link>
      </RouterContextProvider>
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recoverableError = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await Promise.all([serverRouter.load(), clientRouter.load()])
      container.innerHTML = renderToString(tree(serverRouter))
      const serverAnchor = container.querySelector('a')!
      expect(serverAnchor.textContent).toBe('false')
      expect(serverAnchor.getAttribute('href')).toBe(
        external ? externalHref : null,
      )
      expect(serverAnchor.getAttribute('aria-current')).toBeNull()
      expect(serverAnchor.getAttribute('aria-disabled')).toBe(
        disabled || blocked ? 'true' : null,
      )
      expect(serverAnchor.getAttribute('title')).toBe(
        external ? null : 'inactive',
      )
      renderState.mockClear()

      await act(() => {
        root = hydrateRoot(container, tree(clientRouter), {
          onRecoverableError: recoverableError,
        })
      })
      const anchor = container.querySelector('a')!
      expect(anchor).toBe(serverAnchor)
      expect(anchor.textContent).toBe(String(matching))
      expect(anchor.getAttribute('href')).toBe(external ? externalHref : null)
      expect(anchor.getAttribute('aria-current')).toBe(matching ? 'page' : null)
      expect(anchor.getAttribute('aria-disabled')).toBe(
        disabled || blocked ? 'true' : null,
      )
      expect(anchor.getAttribute('title')).toBe(
        external ? null : matching ? 'active' : 'inactive',
      )
      const states = renderState.mock.calls.map(([state]) => state.isActive)
      if (matching) {
        // Disabled internal Links still report active when their destination
        // matches; hydration must preserve the false-to-true transition.
        expect(states).toEqual([false, true])
      } else {
        // Current uses a separate hydration hook even when output is unchanged.
        // The candidate may avoid that extra render without changing behavior.
        expect(states.length).toBeGreaterThan(0)
        expect(states.every((active) => !active)).toBe(true)
      }
      expect(recoverableError).not.toHaveBeenCalled()
      expect(errors).not.toHaveBeenCalled()
    } finally {
      await act(() => root?.unmount())
      serverRouter.history.destroy()
      clientRouter.history.destroy()
      container.remove()
      warn.mockRestore()
      errors.mockRestore()
    }
  },
)

test('hash hydration reuses destination updater results for the same client source', async () => {
  const rootRoute = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page ?? 1) }),
  })
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/target' }),
  ])
  const serverRouter = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/target?page=1'] }),
    isServer: true,
  })
  const clientRouter = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/target?page=1#section'],
    }),
    isServer: false,
  })
  await Promise.all([serverRouter.load(), clientRouter.load()])

  const updateSearch = vi.fn((previous: { page: number }) => ({
    page: previous.page,
  }))
  // A fixed fragment keeps server/client href identical even though the
  // server presentation source does not contain the browser's fragment.
  const updateHash = vi.fn(() => 'section')
  const updateState = vi.fn(() => ({ hydrationMarker: 'link' }))
  const updaters = [updateSearch, updateHash, updateState]
  const counts = () => updaters.map((updater) => updater.mock.calls.length)
  const tree = (router: typeof clientRouter) => (
    <RouterContextProvider router={router}>
      <Link
        to="/target"
        search={updateSearch}
        hash={updateHash}
        state={updateState}
        activeOptions={{ includeHash: true }}
        activeProps={{ title: 'active' }}
        inactiveProps={{ title: 'inactive' }}
      >
        {({ isActive }) => String(isActive)}
      </Link>
    </RouterContextProvider>
  )
  const container = document.createElement('div')
  document.body.append(container)
  const onRecoverableError = vi.fn()
  const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => {})
  let root: ReturnType<typeof hydrateRoot> | undefined
  try {
    container.innerHTML = renderToString(tree(serverRouter))
    const serverAnchor = container.querySelector('a')!
    expect(serverAnchor).toHaveAttribute('href', '/target?page=1#section')
    expect(serverAnchor).toHaveAttribute('title', 'inactive')
    expect(serverAnchor.textContent).toBe('false')
    expect(serverAnchor).not.toHaveAttribute('aria-current')
    const serverCounts = counts()
    updaters.forEach((updater) => updater.mockClear())

    await act(() => {
      root = hydrateRoot(container, tree(clientRouter), { onRecoverableError })
    })
    expect(container.querySelector('a')).toBe(serverAnchor)
    expect(serverAnchor).toHaveAttribute('href', '/target?page=1#section')
    expect(serverAnchor).toHaveAttribute('title', 'active')
    expect(serverAnchor.textContent).toBe('true')
    expect(serverAnchor).toHaveAttribute('aria-current', 'page')
    const hydrationCounts = counts()

    // Flush any follow-up hydration consistency work without changing inputs.
    await act(async () => {
      await Promise.resolve()
    })
    expect(counts()).toEqual(hydrationCounts)

    await act(async () => {
      // Literal navigation inputs are separate from the Link's callbacks.
      await clientRouter.navigate({
        to: '/target',
        search: { page: 2 },
        hash: 'section',
        state: { navigationMarker: 'page2' },
      })
    })
    expect(clientRouter.state.location.search).toEqual({ page: 2 })
    expect(clientRouter.state.location.hash).toBe('section')
    expect(container.querySelector('a')).toBe(serverAnchor)
    expect(serverAnchor).toHaveAttribute('href', '/target?page=2#section')
    expect(serverAnchor).toHaveAttribute('title', 'active')
    expect(serverAnchor.textContent).toBe('true')
    expect(serverAnchor).toHaveAttribute('aria-current', 'page')
    expect(counts()).toEqual(hydrationCounts.map((count) => count + 1))
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(diagnostics).not.toHaveBeenCalled()

    // This is the optimization assertion. Current uses separate hydration
    // and selection hooks and is expected to select twice on the client;
    // H shares one source cache across its server/client snapshot getters.
    expect(serverCounts).toEqual([1, 1, 1])
    expect(hydrationCounts).toEqual([1, 1, 1])
  } finally {
    await act(() => root?.unmount())
    clientRouter.history.destroy()
    serverRouter.history.destroy()
    diagnostics.mockRestore()
    container.remove()
  }
})
