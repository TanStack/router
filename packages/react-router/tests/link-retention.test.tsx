import React from 'react'
import { createLinkStore, readLinkSnapshot } from '@tanstack/router-core'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { HistoryState } from '../src'

// Object liveness assertions need an exposed, full GC. These are not native
// allocator measurements and stay out of ordinary unit-test runs. Disable
// captured stacks: development React fibers and AbortError stacks intentionally
// retain navigation call frames, independently of mounted Link ownership.
// RUN_LINK_RETENTION=1 CI=1 NX_DAEMON=false pnpm nx run \
//   @tanstack/react-router:test:unit --outputStyle=stream --skipRemoteCache \
//   --skipNxCache -- tests/link-retention.test.tsx --pool=forks \
//   --execArgv=--expose-gc --execArgv=--stack-trace-limit=0
const enabled = process.env.RUN_LINK_RETENTION === '1'
const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc

async function collectReleasedObjects() {
  expect(gc, 'Run the retention suite with --execArgv=--expose-gc').toBeTypeOf(
    'function',
  )
  // Do not dereference the targets during these jobs. WeakRef itself keeps a
  // dereferenced target alive until the end of its current job.
  for (let turn = 0; turn < 4; turn++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    gc!()
  }
}

afterEach(cleanup)

describe.runIf(enabled)('mounted Link retention', () => {
  test('retargeted links release previous callback captures while navigation is pending', async () => {
    const gate = createControlledPromise<void>()
    const root = createRootRoute()
    const home = createRoute({ getParentRoute: () => root, path: '/home' })
    const away = createRoute({
      getParentRoute: () => root,
      path: '/away',
      loader: () => gate,
    })
    const target = createRoute({ getParentRoute: () => root, path: '/target' })
    const router = createRouter({
      routeTree: root.addChildren([home, away, target]),
      history: createMemoryHistory({ initialEntries: ['/home'] }),
      defaultPendingMs: 60_000,
    })
    await router.load()
    let unsubscribePersistent = () => {}
    function mountCapturedView() {
      const payload = { marker: 'captured', values: Array(4096).fill(1) }
      const persistent = createLinkStore(
        router,
        {
          to: '/target',
          search: () => ({ marker: payload.marker }),
        },
        root.id,
      )
      unsubscribePersistent = persistent[8 /* subscribe */](() => {})
      return new WeakRef(payload)
    }
    const reference = mountCapturedView()
    const departing = createLinkStore(
      router,
      {
        to: '/target',
        search: (previous: Record<string, unknown>) => previous,
      },
      home.id,
    )
    const unsubscribeDeparting = departing[8 /* subscribe */](() => {})
    const navigation = router.navigate({
      to: '/away',
      search: { pending: 'navigation' } as any,
    })
    try {
      await waitFor(() => expect(router.state.status).toBe('pending'))
      // Input replacement replaces the subscription instead of mutating a
      // committed view. Do not retain the disposed descriptor in the fixture.
      unsubscribePersistent()
      const replacement = createLinkStore(
        router,
        {
          to: '/target',
          search: () => ({ marker: 'current' }),
        },
        root.id,
      )
      unsubscribePersistent = replacement[8 /* subscribe */](() => {})
      expect(readLinkSnapshot(replacement)[0]).toBe('/target?marker=current')
      await collectReleasedObjects()
      expect(router.state.status).toBe('pending')
      expect(reference.deref()).toBeUndefined()
    } finally {
      unsubscribePersistent()
      unsubscribeDeparting()
      gate.resolve()
      await navigation
    }
  })

  test('static links do not retain the history states at their individual mount times', async () => {
    let appendLink!: React.Dispatch<React.SetStateAction<Array<number>>>
    function LinkGrid() {
      const [links, setLinks] = React.useState<Array<number>>([])
      appendLink = setLinks
      return links.map((id) => (
        <Link key={id} to="/target">
          Link {id}
        </Link>
      ))
    }
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <LinkGrid />
          <Outlet />
        </>
      ),
    })
    const pageRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      component: () => <p>Current page</p>,
    })
    const targetRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const settledRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/settled',
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([pageRoute, targetRoute, settledRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(router.state.status).toBe('idle'))

    async function mountAtNewHistoryState(id: number) {
      await act(() =>
        router.navigate({
          to: '/page',
          replace: true,
          state: { payload: { id, values: Array(4096).fill(id) } } as any,
        }),
      )
      const payload = (
        router.state.location.state as unknown as { payload: object }
      ).payload
      const reference = new WeakRef(payload)
      await act(async () => appendLink((previous) => [...previous, id]))
      return reference
    }

    const references: Array<WeakRef<object>> = []
    for (let id = 0; id < 12; id++) {
      references.push(await mountAtNewHistoryState(id))
    }
    await act(() =>
      router.navigate({ to: '/settled', replace: true, state: {} }),
    )
    expect(screen.getAllByRole('link')).toHaveLength(12)

    // Reading the public compatibility view refreshes its lazily retained
    // previous snapshot before measuring the mounted Links' own retention.
    expect(router.state.location.state).not.toHaveProperty('payload')
    expect(router.state.resolvedLocation?.pathname).toBe('/settled')
    expect(router.state.resolvedLocation?.state).not.toHaveProperty('payload')
    await collectReleasedObjects()

    expect(
      references.filter((reference) => reference.deref() !== undefined),
    ).toHaveLength(0)
    expect(screen.getAllByRole('link')).toHaveLength(12)
  })

  test('a superseded departure releases its transaction after its links stay mounted', async () => {
    const gate = createControlledPromise<void>()
    const preserveSearch = (previous: Record<string, unknown>) => previous
    function HomeLink() {
      return (
        <>
          <Link to="/other" search={preserveSearch}>
            Home link
          </Link>
          <Outlet />
        </>
      )
    }
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Link to="/other">Persistent link</Link>
          <Outlet />
        </>
      ),
    })
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/home',
      component: HomeLink,
    })
    const settledRoute = createRoute({
      getParentRoute: () => homeRoute,
      path: '/settled',
    })
    const awayRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/away',
      loader: () => gate,
      gcTime: 0,
    })
    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        homeRoute.addChildren([settledRoute]),
        awayRoute,
        otherRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/home'] }),
      defaultPendingMs: 60_000,
    })
    render(<RouterProvider router={router} />)
    await screen.findByRole('link', { name: 'Home link' })
    await waitFor(() => expect(router.state.status).toBe('idle'))

    async function supersedeDeparture() {
      let departure!: Promise<void>
      await act(async () => {
        departure = router.navigate({
          to: '/away',
          replace: true,
          search: { page: 'away' } as any,
          state: { payload: { values: Array(4096).fill('departing') } } as any,
        })
        await Promise.resolve()
      })
      await waitFor(() => expect(router.state.location.pathname).toBe('/away'))
      const reference = new WeakRef(
        (router.state.location.state as unknown as { payload: object }).payload,
      )
      await act(async () => {
        await router.navigate({
          to: '/home',
          replace: true,
          search: {},
          state: {},
        })
        gate.resolve()
        await departure
      })
      return reference
    }

    const reference = await supersedeDeparture()
    await act(() =>
      router.navigate({
        to: '/home/settled',
        replace: true,
        state: {},
        search: {},
      }),
    )
    expect(screen.getByRole('link', { name: 'Home link' })).toBeInTheDocument()
    expect(router.state.location.state).not.toHaveProperty('payload')
    expect(router.state.resolvedLocation?.pathname).toBe('/home/settled')
    expect(router.state.resolvedLocation?.state).not.toHaveProperty('payload')
    await collectReleasedObjects()
    expect(reference.deref() === undefined).toBe(true)
  })

  test('display destinations release derived state while clicks still build navigation state', async () => {
    const references: Array<WeakRef<object>> = []
    const createState = () => {
      const payload = { channel: 'link', values: Array(4096).fill('payload') }
      references.push(new WeakRef(payload))
      return { payload } as HistoryState
    }
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Link to="/target" state={createState}>
            Target link
          </Link>
          <Outlet />
        </>
      ),
    })
    const pageRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      component: () => <p>Current page</p>,
    })
    const targetRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      component: () => <p>Target page</p>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })
    render(<RouterProvider router={router} />)
    await screen.findByRole('link', { name: 'Target link' })
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(references.length).toBeGreaterThan(0)

    await collectReleasedObjects()

    expect(
      references.filter((reference) => reference.deref() !== undefined),
    ).toHaveLength(0)
    fireEvent.click(screen.getByRole('link', { name: 'Target link' }))
    await screen.findByText('Target page')
    expect(router.state.location.state).toMatchObject({
      payload: { channel: 'link' },
    })
  })
})
