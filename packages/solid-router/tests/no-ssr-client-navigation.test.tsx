import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  loadClientEntry,
  loadServerDocument,
  recordHydrationErrors,
  resetDocument,
} from './ssr-hydration-harness'
import type { NavigationCase } from './no-ssr-client-navigation/routeTree'

const cleanups: Array<() => unknown> = []

afterEach(async () => {
  while (cleanups.length) {
    await cleanups.pop()!()
  }
  vi.restoreAllMocks()
  resetDocument()
})

const item = () => document.querySelector('[data-testid="item"]')

describe('a hydrated no-SSR route keeps its component across param navigations', () => {
  test.each([
    { ssr: 'data-only', pending: true },
    { ssr: 'data-only', pending: false },
    { ssr: false, pending: true },
    { ssr: false, pending: false },
  ] as Array<NavigationCase>)(
    'ssr: $ssr, pendingComponent: $pending',
    async (entry) => {
      await loadServerDocument(
        'no-ssr-client-navigation',
        '/items/1',
        entry,
        '/items/1',
      )
      expect(item()).toBeNull()

      const hydrationErrors = recordHydrationErrors()
      const { clientEntry, close } = await loadClientEntry(
        'no-ssr-client-navigation',
      )
      cleanups.push(close)
      // The client route tree has no `ssr` option, as in Start's client build.
      const { router, dispose, stats } =
        await clientEntry.hydrateDocument(entry)
      cleanups.push(async () => {
        dispose()
        await new Promise((resolve) => setTimeout(resolve, 20))
        router.history.destroy()
      })

      await vi.waitFor(() => expect(item()).toHaveTextContent('item 1 count=0'))
      ;(item() as HTMLElement).click()
      await vi.waitFor(() => expect(item()).toHaveTextContent('item 1 count=1'))

      await router.navigate({ to: '/items/$id', params: { id: '2' } })

      // A param navigation creates a new match on the client. The route
      // component keeps its state, as it does for an SSR route.
      await vi.waitFor(() => expect(item()).toHaveTextContent('item 2 count=1'))
      expect(stats.mounts).toBe(1)
      expect(hydrationErrors).toEqual([])
    },
  )
})
