/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `useParentMatches` / `useChildMatches` regression test. Both helpers
 * compute their slice using `getMatchId(handle)` which reads from
 * `<MatchContext>`. Pre-fix they captured the matchId at setup; the
 * fix is to read it inside the `select` projection so the slice
 * always tracks the active enclosing match.
 *
 * The test setup mounts a 3-level route tree, navigates between
 * sibling leaves, and asserts that each level's `useChildMatches`
 * reflects the new active leaf (via DOM textContent diffing).
 */
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useChildMatches,
  useParentMatches,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function setup(initialPath = '/parent/leaf-a') {
  function Root(_h: Handle) {
    return () => (
      <>
        <Outlet />
      </>
    )
  }
  function ParentLayout(handle: Handle) {
    const readChildren = useChildMatches(handle, {
      select: (matches) => matches.map((m: any) => m.routeId),
    })
    return () => {
      const ids = (readChildren() as Array<string>) ?? []
      return (
        <section>
          <p id="parent-children">{ids.join(',')}</p>
          <Outlet />
        </section>
      )
    }
  }
  function LeafA(handle: Handle) {
    const readParents = useParentMatches(handle, {
      select: (matches) => matches.map((m: any) => m.routeId),
    })
    return () => {
      const ids = (readParents() as Array<string>) ?? []
      return (
        <article id="leaf-a">
          <p id="leaf-a-parents">{ids.join(',')}</p>
        </article>
      )
    }
  }
  function LeafB(handle: Handle) {
    const readParents = useParentMatches(handle, {
      select: (matches) => matches.map((m: any) => m.routeId),
    })
    return () => {
      const ids = (readParents() as Array<string>) ?? []
      return (
        <article id="leaf-b">
          <p id="leaf-b-parents">{ids.join(',')}</p>
        </article>
      )
    }
  }

  const root = createRootRoute({ component: Root })
  const parent = createRoute({
    getParentRoute: () => root,
    path: 'parent',
    component: ParentLayout,
  })
  const leafA = createRoute({
    getParentRoute: () => parent,
    path: 'leaf-a',
    component: LeafA,
  })
  const leafB = createRoute({
    getParentRoute: () => parent,
    path: 'leaf-b',
    component: LeafB,
  })
  parent.addChildren([leafA, leafB])
  root.addChildren([parent])

  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('useChildMatches / useParentMatches with sibling navigation', () => {
  test('parent layout renders the active child match in its children list', async () => {
    const router = setup('/parent/leaf-a')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    // Children of /parent: just leaf-a.
    expect(result.$('#parent-children')?.textContent).toBe('/parent/leaf-a')
    expect(result.$('#leaf-a')).toBeTruthy()
    expect(result.$('#leaf-a-parents')?.textContent).toBe('__root__,/parent')
  })

  test('navigating to a sibling updates parent layout child list', async () => {
    const router = setup('/parent/leaf-a')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#parent-children')?.textContent).toBe('/parent/leaf-a')

    await router.navigate({ to: '/parent/leaf-b' })
    await router.load()
    await flush()

    // The parent layout's `useChildMatches` re-projects against the
    // current matches set — and crucially, computes the slice from the
    // CURRENT `getMatchId(handle)`, not a captured-at-setup value.
    expect(result.$('#parent-children')?.textContent).toBe('/parent/leaf-b')
    expect(result.$('#leaf-b')).toBeTruthy()
    expect(result.$('#leaf-b-parents')?.textContent).toBe('__root__,/parent')
  })
})
