import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, stringifySearchWith } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('loaderDepsHash uses configured search serializer', () => {
  it('uses stringifySearch for loaderDepsHash instead of JSON.stringify', async () => {
    // Custom serializer that supports bigint (which JSON.stringify cannot handle)
    const customStringify = (value: any): string => {
      if (typeof value === 'bigint') {
        return `"${value.toString()}n"`
      }
      if (typeof value === 'object' && value !== null) {
        const entries = Object.entries(value).map(
          ([k, v]) => `${k}:${customStringify(v as any)}`,
        )
        return `{${entries.join(',')}}`
      }
      return JSON.stringify(value)
    }

    const customStringifySearch = stringifySearchWith(customStringify)

    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      validateSearch: () => ({ count: 0n as bigint }),
      loaderDeps: ({ search }) => ({
        count: search.count,
      }),
      loader: () => 'loaded',
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
      stringifySearch: customStringifySearch,
    })

    // This should not throw "Do not know how to serialize a BigInt"
    // because the loaderDepsHash should use customStringifySearch
    // instead of JSON.stringify
    await router.navigate({ to: '/foo' })

    // Find the foo route match (not the root)
    const fooMatch = router.state.matches.find((m) => m.routeId === fooRoute.id)
    expect(fooMatch).toBeDefined()
  })

  it('produces different match IDs for different serialized deps values', async () => {
    const loaderCalls: Array<string> = []

    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      validateSearch: (input: any) => ({
        filter: (input?.filter ?? '') as string,
      }),
      loaderDeps: ({ search }) => ({
        filter: search.filter,
      }),
      loader: ({ deps }) => {
        loaderCalls.push(deps.filter)
        return 'loaded'
      },
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo', search: { filter: 'all' } })
    const firstFooMatch = router.state.matches.find(
      (m) => m.routeId === fooRoute.id,
    )
    const firstMatchId = firstFooMatch?.id

    await router.navigate({ to: '/foo', search: { filter: 'active' } })
    const secondFooMatch = router.state.matches.find(
      (m) => m.routeId === fooRoute.id,
    )
    const secondMatchId = secondFooMatch?.id

    // Different deps should produce different match IDs (different hashes)
    expect(firstMatchId).not.toBe(secondMatchId)
    expect(loaderCalls).toEqual(['all', 'active'])
  })
})
