import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  loadClientEntry,
  loadServerDocument,
  recordHydrationErrors,
  resetDocument,
} from './ssr-hydration-harness'
import type { HydrationCase } from './issue-8640/routeTree'

const cleanups: Array<() => unknown> = []

afterEach(async () => {
  while (cleanups.length) {
    await cleanups.pop()!()
  }
  vi.restoreAllMocks()
  resetDocument()
})

/** Hydrates the document with the fixture's client entry. */
async function hydrateClient(entry: HydrationCase) {
  const hydrationErrors = recordHydrationErrors()
  const { clientEntry, close } = await loadClientEntry('issue-8640')
  cleanups.push(close)
  const hydrationStart = performance.now()
  const { router, dispose } = await clientEntry.hydrateDocument(entry)
  cleanups.push(async () => {
    dispose()
    await new Promise((resolve) => setTimeout(resolve, 20))
    router.history.destroy()
  })
  return { hydrationStart, hydrationErrors }
}

const hydrationCases: Array<HydrationCase> = [
  {
    name: 'data-only success',
    ssr: 'data-only',
    path: '/dashboard',
    payload: ['success', 'success'],
    result: 'dashboard data',
  },
  {
    name: 'ssr: false success',
    ssr: false,
    path: '/dashboard',
    payload: ['success', 'pending'],
    result: 'dashboard data',
  },
  {
    name: 'data-only loader error',
    ssr: 'data-only',
    path: '/dashboard',
    dashboardLoader: 'error',
    payload: ['success', 'error'],
    result: 'dashboard error',
  },
  {
    name: 'data-only loader notFound',
    ssr: 'data-only',
    path: '/dashboard',
    dashboardLoader: 'notFound',
    payload: ['success', 'notFound'],
    result: 'dashboard not found',
  },
  {
    name: 'data-only unmatched URL',
    ssr: 'data-only',
    path: '/dashboard/missing',
    payload: ['success', 'success+g'],
    result: 'dashboard not found',
  },
  {
    name: 'ssr: false invalid search',
    ssr: false,
    path: '/dashboard?invalid=1',
    payload: ['success', 'error'],
    result: 'dashboard error',
  },
  {
    name: 'ssr: false unmatched URL',
    ssr: false,
    path: '/dashboard/missing',
    payload: ['success', 'pending+g'],
    result: 'dashboard not found',
  },
  {
    name: 'data-only child loader error',
    ssr: 'data-only',
    path: '/dashboard/child',
    payload: ['success', 'success', 'error'],
    result: 'dashboard datachild error',
  },
]

describe('a no-SSR boundary keeps its server-rendered pending component through hydration (#8640)', () => {
  test.each(hydrationCases)('$name', async (entry) => {
    await loadServerDocument('issue-8640', entry.path, entry)

    expect(
      window.$_TSR!.router!.matches.map(
        (match) => `${match.s}${match.g ? '+g' : ''}`,
      ),
    ).toEqual(entry.payload)
    const serverSkeleton = document.querySelector('[data-testid="skeleton"]')
    expect(serverSkeleton).not.toBeNull()
    expect(document.body).not.toHaveTextContent(entry.result)

    // Every skeleton node that ever enters the document.
    const skeletons = new Set<Element>([serverSkeleton!])
    let skeletonRemovedAt: number | undefined
    const observer = new MutationObserver(() => {
      document
        .querySelectorAll('[data-testid="skeleton"]')
        .forEach((node) => skeletons.add(node))
      if (!serverSkeleton!.isConnected) {
        skeletonRemovedAt ??= performance.now()
      }
    })
    observer.observe(document, { childList: true, subtree: true })
    cleanups.push(() => observer.disconnect())

    const { hydrationStart, hydrationErrors } = await hydrateClient(entry)

    await vi.waitFor(
      () => expect(document.body).toHaveTextContent(entry.result),
      { timeout: 2000 },
    )

    expect(hydrationErrors).toEqual([])
    // Hydration adopts the server's pending UI and holds it for
    // `pendingMinMs`. Solid may not report a mismatch, so also check when the
    // server HTML was replaced.
    expect(skeletonRemovedAt! - hydrationStart).toBeGreaterThanOrEqual(150)
    // The hydrated server skeleton is the only one: it must not be hidden or
    // replaced by a second copy.
    expect([...skeletons]).toEqual([serverSkeleton])
    expect(document.querySelector('[data-testid="skeleton"]')).toBeNull()
  })
})

// Without a pending component nothing holds the boundary pending, so the client
// load can commit before the boundary hydrates. Hydration must still match the
// server HTML.
describe('a no-SSR boundary without a pending component hydrates without a mismatch', () => {
  test.each(hydrationCases)('$name', async (caseWithPending) => {
    const entry = { ...caseWithPending, pending: false }
    await loadServerDocument('issue-8640', entry.path, entry)

    expect(
      window.$_TSR!.router!.matches.map(
        (match) => `${match.s}${match.g ? '+g' : ''}`,
      ),
    ).toEqual(entry.payload)
    expect(document.body).not.toHaveTextContent(entry.result)

    const { hydrationErrors } = await hydrateClient(entry)

    await vi.waitFor(
      () => expect(document.body).toHaveTextContent(entry.result),
      { timeout: 2000 },
    )
    // Let late boundaries finish hydrating.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(hydrationErrors).toEqual([])
  })
})
