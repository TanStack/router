import * as Solid from 'solid-js'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

// Object collectability is distinct from native allocation measurements. Run
// both implementations with identical GC and captured-stack settings.
// NODE_OPTIONS='--expose-gc --stack-trace-limit=0' \
// RUN_LINK_RETENTION=1 CI=1 NX_DAEMON=false pnpm nx run \
//   @tanstack/solid-router:test:unit --outputStyle=stream --skipRemoteCache \
//   --skipNxCache
// NODE_OPTIONS reaches both commands in Solid's chained client/server script.
// Do not pass a client-only test-file selector to that target.
const enabled = process.env.RUN_LINK_RETENTION === '1'
const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
const histories: Array<{ destroy: () => void }> = []

async function collectReleasedObjects() {
  expect(gc, 'Run the retention suite with --execArgv=--expose-gc').toBeTypeOf(
    'function',
  )
  // A dereferenced WeakRef target remains alive until its current job ends.
  // Do not inspect the targets inside these collection jobs.
  for (let turn = 0; turn < 4; turn++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    gc!()
  }
}

afterEach(() => {
  cleanup()
  for (const history of histories.splice(0)) {
    history.destroy()
  }
})

test.runIf(enabled)(
  'retargeted and unmounted Links release callback captures and can rejoin a live router',
  async () => {
    type Search = (previous: Record<string, unknown>) => { value: string }
    const [visible, setVisible] = Solid.createSignal(true)
    const [derive, setDerive] = Solid.createSignal<Search>()
    const calls = { previous: 0, current: 0, remounted: 0 }

    function installSearch(name: keyof typeof calls) {
      const payload = { values: Array<string>(4096).fill(name) }
      setDerive(() => (previous: Record<string, unknown>) => {
        calls[name]++
        return { value: `${payload.values[0]}-${previous.marker}` }
      })
      // Neither the fixture nor its counters retain the installed callback.
      return new WeakRef(payload)
    }

    const previousPayload = installSearch('previous')
    const root = createRootRoute({
      component: () => (
        <>
          <Solid.Show when={visible()}>
            <Link to="/target" search={derive()}>
              Retained destination
            </Link>
          </Solid.Show>
          <p>Router remains mounted</p>
          <Outlet />
        </>
      ),
    })
    const history = createMemoryHistory({
      initialEntries: ['/source?marker=before'],
    })
    histories.push(history)
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/source' }),
        createRoute({ getParentRoute: () => root, path: '/target' }),
      ]),
      history,
    })
    render(() => <RouterProvider router={router} />)
    let link: HTMLElement | undefined = await screen.findByRole('link', {
      name: 'Retained destination',
    })
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(link).toHaveAttribute('href', '/target?value=previous-before')
    expect(calls.previous).toBeGreaterThan(0)

    const currentPayload = installSearch('current')
    await waitFor(() =>
      expect(link).toHaveAttribute('href', '/target?value=current-before'),
    )
    expect(screen.getByRole('link', { name: 'Retained destination' })).toBe(
      link,
    )
    const callsAfterRetarget = { ...calls }
    await router.navigate({ to: '/source', search: { marker: 'updated' } })
    await waitFor(() =>
      expect(link).toHaveAttribute('href', '/target?value=current-updated'),
    )
    expect(calls.previous).toBe(callsAfterRetarget.previous)
    expect(calls.current).toBeGreaterThan(callsAfterRetarget.current)

    await collectReleasedObjects()
    expect(previousPayload.deref() === undefined).toBe(true)

    setVisible(false)
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Retained destination' }),
      ).not.toBeInTheDocument(),
    )
    // Release both public fixture holders before testing Link-owned retention.
    link = undefined
    setDerive(undefined)
    const callsAfterUnmount = { ...calls }
    await router.navigate({ to: '/source', search: { marker: 'unmounted' } })
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(calls).toEqual(callsAfterUnmount)
    expect(screen.getByText('Router remains mounted')).toBeInTheDocument()

    await collectReleasedObjects()
    expect(currentPayload.deref() === undefined).toBe(true)

    installSearch('remounted')
    setVisible(true)
    link = await screen.findByRole('link', { name: 'Retained destination' })
    expect(link).toHaveAttribute('href', '/target?value=remounted-unmounted')
    await router.navigate({ to: '/source', search: { marker: 'returned' } })
    await waitFor(() =>
      expect(link).toHaveAttribute('href', '/target?value=remounted-returned'),
    )
    expect(calls.previous).toBe(callsAfterUnmount.previous)
    expect(calls.current).toBe(callsAfterUnmount.current)
    expect(calls.remounted).toBeGreaterThan(0)
  },
)
