import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
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
    linkSubscriptionPayload?: { value: string }
  }
}

afterEach(cleanup)

function identityHref(href: string) {
  return href
}

// Run through Nx with --pool=forks --execArgv=--expose-gc. Weak references test
// collectability, rather than treating noisy heap-size deltas as assertions.
test.skipIf(!global.gc)(
  'persistent fixed Links release historical locations and unmounted destinations',
  async () => {
    const root = createRootRoute()
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/items/$id' }),
        createRoute({ getParentRoute: () => root, path: '/other' }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/other'] }),
      defaultGcTime: 0,
    })
    await router.load()
    const view = render(
      <RouterContextProvider router={router}>
        {Array.from({ length: 40 }, (_, id) => (
          <Link key={id} to="/items/$id" params={{ id: String(id) }}>
            {id}
          </Link>
        ))}
      </RouterContextProvider>,
    )
    const payloads: Array<WeakRef<object>> = []
    async function visit(id: number) {
      const payload = { value: String(id).repeat(4096) }
      payloads.push(new WeakRef(payload))
      await act(() =>
        router.navigate({
          to: '/items/$id',
          params: { id: String(id) },
          replace: true,
          state: { linkSubscriptionPayload: payload },
        }),
      )
    }
    for (let id = 0; id < 40; id++) {
      await visit(id)
    }
    await act(() => router.navigate({ to: '/other', replace: true, state: {} }))
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      global.gc!()
    }
    expect(
      payloads.filter((payload) => payload.deref() !== undefined),
    ).toHaveLength(0)
    view.unmount()
    await act(() => router.navigate({ to: '/items/0', replace: true }))
    const remounted = render(
      <RouterContextProvider router={router}>
        <Link to="/items/0">again</Link>
      </RouterContextProvider>,
    )
    expect(remounted.getByText('again')).toHaveAttribute('aria-current', 'page')
  },
)

test.skipIf(!global.gc)(
  'a router releases the last Link location after all Links unmount',
  async () => {
    const root = createRootRoute()
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/items/$id' }),
        createRoute({ getParentRoute: () => root, path: '/other' }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/other'] }),
      defaultGcTime: 0,
    })
    await router.load()
    async function visitAndUnmount() {
      const view = render(
        <RouterContextProvider router={router}>
          <Link to="/items/0">item</Link>
        </RouterContextProvider>,
      )
      const payload = { value: 'last mounted Link location' }
      router.history.createHref = identityHref
      await act(() =>
        router.navigate({
          to: '/items/0',
          replace: true,
          state: { linkSubscriptionPayload: payload },
        }),
      )
      view.unmount()
      return new WeakRef(payload)
    }
    const ref = await visitAndUnmount()
    await act(() => router.navigate({ to: '/other', replace: true, state: {} }))
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      global.gc!()
    }
    expect(ref.deref()).toBeUndefined()
    expect(router.state.location.pathname).toBe('/other')
  },
)
