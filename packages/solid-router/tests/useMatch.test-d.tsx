import { describe, expectTypeOf, test } from 'vitest'
import { createRootRoute, createRoute, createRouter, useMatch } from '../src'
import type { MakeRouteMatch, MakeRouteMatchUnion } from '../src/Matches'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'invoices',
})

const routeTree = rootRoute.addChildren([invoicesRoute, indexRoute])

// eslint-disable-next-line unused-imports/no-unused-vars
const defaultRouter = createRouter({ routeTree })

type DefaultRouter = typeof defaultRouter

type TRouteMatch = MakeRouteMatch<DefaultRouter['routeTree']>

describe('useMatch', () => {
  describe('shouldThrow', () => {
    const from = '/invoices'
    test('return type is `RouteMatch` when shouldThrow = true', () => {
      const shouldThrow = true
      const match = useMatch<
        DefaultRouter,
        typeof from,
        true, // TStrict
        typeof shouldThrow,
        TRouteMatch
      >({ from, shouldThrow })

      expectTypeOf(match).toEqualTypeOf<TRouteMatch>()
    })

    test('return type is `RouteMatch | undefined` when shouldThrow = false', () => {
      const shouldThrow = false
      const match = useMatch<
        DefaultRouter,
        typeof from,
        true, // TStrict
        typeof shouldThrow,
        TRouteMatch
      >({ from, shouldThrow })

      expectTypeOf(match).toEqualTypeOf<TRouteMatch | undefined>()
    })
  })

  test('return type is union of matches when strict = false', () => {
    const strict = false as const
    const match = useMatch<DefaultRouter, typeof undefined, typeof strict>({
      strict,
    })

    expectTypeOf(match).toEqualTypeOf<MakeRouteMatchUnion<DefaultRouter>>()
  })

  test('shouldThrow must be false when strict is false', () => {
    const strict = false as const
    const shouldThrow = true as const
    useMatch<
      DefaultRouter,
      typeof undefined,
      typeof strict,
      typeof shouldThrow
    >({
      strict,
      // @ts-expect-error shouldThrow must be false when strict is false
      shouldThrow,
    })
  })
})
