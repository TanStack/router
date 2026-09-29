import * as Vue from 'vue'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
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

// These assertions measure object collectability, not native allocations. Run
// baseline and candidate with identical GC and captured-stack settings.
// RUN_LINK_RETENTION=1 CI=1 NX_DAEMON=false pnpm nx run \
//   @tanstack/vue-router:test:unit --outputStyle=stream --skipRemoteCache \
//   --skipNxCache -- tests/link-retention.test.tsx --pool=forks \
//   --execArgv=--expose-gc --execArgv=--stack-trace-limit=0
const enabled = process.env.RUN_LINK_RETENTION === '1'
const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
const histories: Array<{ destroy: () => void }> = []

async function collectReleasedObjects() {
  expect(gc, 'Run the retention suite with --execArgv=--expose-gc').toBeTypeOf(
    'function',
  )
  // WeakRef targets must not be dereferenced in these jobs: doing so would
  // keep them alive until the end of that job, including its collection.
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
  'retargeted and unmounted Links release callback captures and reactive subscriptions',
  async () => {
    const previousInput = Vue.ref('before')
    const currentInput = Vue.ref('before')
    const visible = Vue.ref(true)
    const derive = Vue.shallowRef<(() => { value: string }) | undefined>()
    const calls = { previous: 0, current: 0 }

    function installSearch(input: Vue.Ref<string>, name: keyof typeof calls) {
      const payload = { values: Array<string>(4096).fill(name) }
      derive.value = () => {
        calls[name]++
        return { value: `${payload.values[0]}-${input.value}` }
      }
      // No fixture holder keeps the function or its payload after retargeting.
      return new WeakRef(payload)
    }

    const previousPayload = installSearch(previousInput, 'previous')
    const root = createRootRoute({
      component: () => (
        <>
          {visible.value ? (
            <Link to="/target" search={derive.value}>
              Retained destination
            </Link>
          ) : null}
          <p>Router remains mounted</p>
          <Outlet />
        </>
      ),
    })
    const history = createMemoryHistory({ initialEntries: ['/source'] })
    histories.push(history)
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/source' }),
        createRoute({ getParentRoute: () => root, path: '/target' }),
        createRoute({ getParentRoute: () => root, path: '/other' }),
      ]),
      history,
    })
    render(<RouterProvider router={router} />)
    let link: HTMLElement | undefined = await screen.findByRole('link', {
      name: 'Retained destination',
    })
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(link).toHaveAttribute('href', '/target?value=previous-before')
    expect(calls.previous).toBeGreaterThan(0)

    const currentPayload = installSearch(currentInput, 'current')
    await waitFor(() =>
      expect(link).toHaveAttribute('href', '/target?value=current-before'),
    )
    expect(screen.getByRole('link', { name: 'Retained destination' })).toBe(
      link,
    )
    const callsAfterRetarget = { ...calls }
    previousInput.value = 'obsolete'
    await Vue.nextTick()
    expect(calls).toEqual(callsAfterRetarget)

    await collectReleasedObjects()
    expect(previousPayload.deref() === undefined).toBe(true)

    currentInput.value = 'updated'
    await waitFor(() =>
      expect(link).toHaveAttribute('href', '/target?value=current-updated'),
    )
    expect(calls.current).toBeGreaterThan(callsAfterRetarget.current)

    visible.value = false
    await Vue.nextTick()
    expect(
      screen.queryByRole('link', { name: 'Retained destination' }),
    ).not.toBeInTheDocument()
    // A retained DOM node can retain Vue's component through its development
    // metadata. Release that fixture reference and the current prop holder.
    link = undefined
    derive.value = undefined
    await Vue.nextTick()
    const callsAfterUnmount = { ...calls }
    previousInput.value = 'after-unmount'
    currentInput.value = 'after-unmount'
    await Vue.nextTick()
    await router.navigate({ to: '/other', replace: true })
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(calls).toEqual(callsAfterUnmount)
    expect(screen.getByText('Router remains mounted')).toBeInTheDocument()

    await collectReleasedObjects()
    expect(currentPayload.deref() === undefined).toBe(true)
    expect(router.state.location.pathname).toBe('/other')
  },
)
