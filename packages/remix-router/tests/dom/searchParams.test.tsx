/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `useSearch` end-to-end reactivity test. Asserts that:
 *
 * - The initial render reflects the validated search params.
 * - Navigating with a `search` updater changes the URL and the
 *   component re-renders with the new values.
 * - The `loaderDeps` shaping is honored — only deps changes refetch
 *   the loader; pure-search-only changes don't.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useLoaderData,
  useSearch,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

interface CatalogSearch {
  q: string
  page: number
  sort: 'asc' | 'desc'
}

function setup(initialPath = '/catalog') {
  function Catalog(handle: Handle) {
    const readSearch = useSearch(handle, { from: '/catalog' })
    const readData = useLoaderData(handle, { from: '/catalog' })
    return () => {
      const s = readSearch() as CatalogSearch
      const data = readData() as { items: Array<string>; calls: number } | undefined
      return (
        <main>
          <p id="q">q={s.q}</p>
          <p id="page">page={s.page}</p>
          <p id="sort">sort={s.sort}</p>
          <p id="items">{(data?.items ?? []).join(',')}</p>
          <p id="calls">calls={data?.calls ?? 0}</p>
        </main>
      )
    }
  }

  let loaderCalls = 0

  const root = createRootRoute()
  const catalog = createRoute({
    getParentRoute: () => root,
    path: 'catalog',
    validateSearch: (raw: Record<string, unknown>): CatalogSearch => ({
      q: typeof raw.q === 'string' ? raw.q : '',
      page: typeof raw.page === 'number' ? raw.page : 1,
      sort: raw.sort === 'desc' ? 'desc' : 'asc',
    }),
    loaderDeps: ({ search }: { search: CatalogSearch }) => ({
      q: search.q,
      page: search.page,
    }),
    loader: ({ deps }: { deps: { q: string; page: number } }) => {
      loaderCalls++
      const items = ['Alpha', 'Bravo', 'Charlie'].filter((i) =>
        i.toLowerCase().includes(deps.q.toLowerCase()),
      )
      return { items, calls: loaderCalls }
    },
    component: Catalog,
  })
  root.addChildren([catalog])

  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return router
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('search params reactivity', () => {
  test('initial render shows validated defaults', async () => {
    const router = setup('/catalog')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#q')?.textContent).toBe('q=')
    expect(result.$('#page')?.textContent).toBe('page=1')
    expect(result.$('#sort')?.textContent).toBe('sort=asc')
    expect(result.$('#items')?.textContent).toBe('Alpha,Bravo,Charlie')
  })

  test('navigation with search updater re-renders with new values', async () => {
    const router = setup('/catalog')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    await router.navigate({
      to: '/catalog',
      search: (prev: CatalogSearch) => ({ ...prev, page: 3 }),
    })
    await router.load()
    await flush()

    expect(result.$('#page')?.textContent).toBe('page=3')
    expect(result.$('#sort')?.textContent).toBe('sort=asc')
  })

  test('loaderDeps gates loader: sort change does NOT trigger reload', async () => {
    const router = setup('/catalog')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    const before = result.$('#calls')?.textContent
    expect(before).toBe('calls=1')

    // Sort isn't in loaderDeps — loader should NOT fire.
    await router.navigate({
      to: '/catalog',
      search: (prev: CatalogSearch) => ({ ...prev, sort: 'desc' }),
    })
    await flush()

    expect(result.$('#sort')?.textContent).toBe('sort=desc')
    expect(result.$('#calls')?.textContent).toBe('calls=1')
  })

  test('loaderDeps gates loader: q change DOES trigger reload', async () => {
    const router = setup('/catalog')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    const before = parseInt(
      result.$('#calls')?.textContent?.replace('calls=', '') ?? '0',
      10,
    )
    expect(before).toBeGreaterThanOrEqual(1)

    await router.navigate({
      to: '/catalog',
      search: (prev: CatalogSearch) => ({ ...prev, q: 'a' }),
    })
    await flush()

    const after = parseInt(
      result.$('#calls')?.textContent?.replace('calls=', '') ?? '0',
      10,
    )
    expect(result.$('#q')?.textContent).toBe('q=a')
    expect(after).toBeGreaterThan(before)
    expect(result.$('#items')?.textContent).toBe('Alpha,Bravo,Charlie')
  })
})
