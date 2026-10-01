import React from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { act, render, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

test('matched-route links update hash-sensitive active presentation during hash navigation', async () => {
  const makeRouteTree = () => {
    const rootRoute = createRootRoute({ component: Outlet })
    const targetRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      component: () => (
        <>
          <Link to="/target" hash="other" data-testid="matched-ordinary">
            {({ isActive }) => `ordinary:${isActive}`}
          </Link>
          <Link
            to="/target"
            hash="section"
            activeOptions={{ includeHash: true }}
            data-testid="matched-hash"
          >
            {({ isActive }) => `hash:${isActive}`}
          </Link>
          <Link
            to="/target"
            hash="other"
            activeOptions={{ includeHash: true }}
            data-testid="matched-other-hash"
          >
            {({ isActive }) => `other hash:${isActive}`}
          </Link>
        </>
      ),
    })
    return rootRoute.addChildren([targetRoute])
  }
  const clientRouter = createRouter({
    routeTree: makeRouteTree(),
    history: createMemoryHistory({ initialEntries: ['/target#section'] }),
  })
  const view = render(<RouterProvider router={clientRouter} />)
  try {
    const ordinary = await view.findByTestId('matched-ordinary')
    const hash = view.getByTestId('matched-hash')
    const otherHash = view.getByTestId('matched-other-hash')
    await waitFor(() => expect(clientRouter.state.status).toBe('idle'))
    expect(ordinary).toHaveAttribute('aria-current', 'page')
    expect(ordinary).toHaveTextContent('ordinary:true')
    expect(hash).toHaveAttribute('aria-current', 'page')
    expect(hash).toHaveTextContent('hash:true')
    expect(otherHash).not.toHaveAttribute('aria-current')
    expect(otherHash).toHaveTextContent('other hash:false')
    await act(() => clientRouter.navigate({ to: '/target', hash: 'other' }))
    expect(view.getByTestId('matched-ordinary')).toBe(ordinary)
    expect(view.getByTestId('matched-hash')).toBe(hash)
    expect(view.getByTestId('matched-other-hash')).toBe(otherHash)
    expect(ordinary).toHaveAttribute('aria-current', 'page')
    expect(ordinary).toHaveTextContent('ordinary:true')
    expect(hash).not.toHaveAttribute('aria-current')
    expect(hash).toHaveTextContent('hash:false')
    expect(otherHash).toHaveAttribute('aria-current', 'page')
    expect(otherHash).toHaveTextContent('other hash:true')
  } finally {
    view.unmount()
    clientRouter.history.destroy()
  }
})

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
