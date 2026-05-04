/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `<ClientOnly>` and `useHydrated` — components that should only
 * render on the client. The SSR pass renders the fallback (or null);
 * after hydration, the children render.
 *
 * Since these tests run in jsdom (which mimics a browser environment),
 * the post-hydration path is exercised. The SSR-only behavior is
 * covered by `ssr.test.tsx`.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  ClientOnly,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useHydrated,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function setup() {
  function Root(_h: Handle) {
    return () => <Outlet />
  }
  function Page(handle: Handle) {
    const readHydrated = useHydrated(handle)
    return () => (
      <main>
        <ClientOnly fallback={<p id="fallback">loading...</p>}>
          <p id="client">client-only content</p>
        </ClientOnly>
        <p id="hydrated">{String(readHydrated())}</p>
      </main>
    )
  }
  const root = createRootRoute({ component: Root })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: Page,
  })
  root.addChildren([home])
  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('ClientOnly + useHydrated', () => {
  test('renders children after hydration completes', async () => {
    const router = setup()
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    // Allow hydration tick.
    await flush()
    await flush()

    expect(result.$('#client')?.textContent).toBe('client-only content')
    expect(result.$('#fallback')).toBeFalsy()
    expect(result.$('#hydrated')?.textContent).toBe('true')
  })
})
