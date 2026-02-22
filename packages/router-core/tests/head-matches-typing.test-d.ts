import { describe, expectTypeOf, test } from 'vitest'

import type {
  AnyRoute,
  AnyRouter,
  MakeRouteMatchFromRoute,
  UpdatableRouteOptions,
  RouteMatch,
} from '../src'
import type { InferAssetFnMatches } from '../src/route'
import { BaseRootRoute, BaseRoute, rootRouteId } from '../src'

type TestRegister<TRouteTree extends AnyRoute> = {
  router: { routeTree: TRouteTree }
}

type HeadCtxFor<TRegister, TRoute extends AnyRoute> = Parameters<
  NonNullable<
    UpdatableRouteOptions<
      TRoute['types']['parentRoute'],
      TRoute['types']['id'],
      TRoute['types']['fullPath'],
      TRoute['types']['params'],
      TRoute['types']['searchValidator'],
      NonNullable<TRoute['options']['loader']>,
      TRoute['types']['loaderDeps'],
      TRoute['types']['routerContext'],
      TRoute['types']['routeContextFn'],
      TRoute['types']['beforeLoadFn'],
      TRegister
    >['head']
  >
>[0]

const rootRoute = new BaseRootRoute({
  loader: () => ({
    root: 'root',
  }),
})

const fooRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  path: '/foo',
  loader: () => ({
    foo: 123,
  }),
  head: () => ({}),
})

const barRoute = new BaseRoute({
  getParentRoute: () => fooRoute,
  path: '/bar',
  loader: () => ({
    bar: true,
  }),
  head: () => ({}),
})

const bazRoute = new BaseRoute({
  getParentRoute: () => fooRoute,
  path: '/baz',
  loader: () => ({
    baz: true,
  }),
  head: () => ({}),
})

const helloRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  path: '/hello',
  loader: () => ({
    hello: 'hello',
  }),
  head: () => ({}),
})

const worldRoute = new BaseRoute({
  getParentRoute: () => helloRoute,
  path: '/world',
  loader: () => ({
    world: 1,
  }),
  head: () => ({}),
})

const xyzRoute = new BaseRoute({
  getParentRoute: () => helloRoute,
  path: '/xyz',
  loader: () => ({
    xyz: 1,
  }),
  head: () => ({}),
})

const routeTree = rootRoute.addChildren([
  fooRoute.addChildren({
    barRoute,
    bazRoute,
  }),
  helloRoute.addChildren([worldRoute, xyzRoute]),
])

type RegisterWithTestRouteTree = TestRegister<typeof routeTree>

type IsAny<T> = 0 extends 1 & T ? true : false

describe('Route head matches typing', () => {
  test('InferAssetFnMatches resolves concrete route types, not any', () => {
    type Matches = InferAssetFnMatches<RegisterWithTestRouteTree, '/foo'>

    // With tuple typing, matches[0] should be the root match specifically
    type FirstElement = Matches[0]
    type RouteIdOfFirst = FirstElement['routeId']

    // routeId should not be any
    expectTypeOf<IsAny<RouteIdOfFirst>>().toEqualTypeOf<false>()

    // routeId of first element should be exactly the root route ID
    expectTypeOf<RouteIdOfFirst>().toEqualTypeOf<typeof rootRouteId>()
  })

  test('foo head matches: positional tuple [root, foo, ...descendants[]]', () => {
    type FooHeadCtx = HeadCtxFor<RegisterWithTestRouteTree, typeof fooRoute>
    type FooMatches = FooHeadCtx['matches']

    // matches should not be any or unknown
    expectTypeOf<FooMatches>().not.toBeAny()
    expectTypeOf<FooMatches>().not.toBeUnknown()

    // Position 0: root match
    expectTypeOf<FooMatches[0]['routeId']>().toEqualTypeOf<typeof rootRouteId>()
    expectTypeOf<FooMatches[0]['fullPath']>().toEqualTypeOf<'/'>()
    // loaderData is optional on RouteMatch, so it's TLoaderData | undefined
    expectTypeOf<NonNullable<FooMatches[0]['loaderData']>>().toEqualTypeOf<{
      root: string
    }>()

    // Position 1: foo match (self)
    expectTypeOf<FooMatches[1]['routeId']>().toEqualTypeOf<'/foo'>()
    expectTypeOf<FooMatches[1]['fullPath']>().toEqualTypeOf<'/foo'>()
    expectTypeOf<NonNullable<FooMatches[1]['loaderData']>>().toEqualTypeOf<{
      foo: number
    }>()

    // Position 2+: descendants (bar | baz union)
    type DescendantRouteIds = NonNullable<FooMatches[2]>['routeId']
    expectTypeOf<'/foo/bar'>().toMatchTypeOf<DescendantRouteIds>()
    expectTypeOf<'/foo/baz'>().toMatchTypeOf<DescendantRouteIds>()

    // Descendants should NOT include unrelated routes
    type HelloExtendsDescendants = '/hello' extends DescendantRouteIds
      ? true
      : false
    expectTypeOf<HelloExtendsDescendants>().toEqualTypeOf<false>()
  })

  test('hello head matches: positional tuple [root, hello, ...descendants[]]', () => {
    type HelloHeadCtx = HeadCtxFor<RegisterWithTestRouteTree, typeof helloRoute>
    type HelloMatches = HelloHeadCtx['matches']

    // Not any or unknown
    expectTypeOf<HelloMatches>().not.toBeAny()
    expectTypeOf<HelloMatches>().not.toBeUnknown()

    // Position 0: root match
    expectTypeOf<HelloMatches[0]['routeId']>().toEqualTypeOf<
      typeof rootRouteId
    >()
    expectTypeOf<HelloMatches[0]['fullPath']>().toEqualTypeOf<'/'>()

    // Position 1: hello match (self)
    expectTypeOf<HelloMatches[1]['routeId']>().toEqualTypeOf<'/hello'>()
    expectTypeOf<HelloMatches[1]['fullPath']>().toEqualTypeOf<'/hello'>()
    expectTypeOf<NonNullable<HelloMatches[1]['loaderData']>>().toEqualTypeOf<{
      hello: string
    }>()

    // Position 2+: descendants (world | xyz union)
    type DescendantRouteIds = NonNullable<HelloMatches[2]>['routeId']
    expectTypeOf<'/hello/world'>().toMatchTypeOf<DescendantRouteIds>()
    expectTypeOf<'/hello/xyz'>().toMatchTypeOf<DescendantRouteIds>()

    // Descendants should NOT include unrelated routes
    type FooExtendsDescendants = '/foo' extends DescendantRouteIds
      ? true
      : false
    expectTypeOf<FooExtendsDescendants>().toEqualTypeOf<false>()
  })

  test('bar head matches: positional tuple [root, foo, bar] with no descendants', () => {
    type BarHeadCtx = HeadCtxFor<RegisterWithTestRouteTree, typeof barRoute>
    type BarMatches = BarHeadCtx['matches']

    expectTypeOf<BarMatches>().not.toBeAny()

    // Position 0: root
    expectTypeOf<BarMatches[0]['routeId']>().toEqualTypeOf<typeof rootRouteId>()

    // Position 1: foo (parent)
    expectTypeOf<BarMatches[1]['routeId']>().toEqualTypeOf<'/foo'>()

    // Position 2: bar (self)
    expectTypeOf<BarMatches[2]['routeId']>().toEqualTypeOf<'/foo/bar'>()
    expectTypeOf<NonNullable<BarMatches[2]['loaderData']>>().toEqualTypeOf<{
      bar: boolean
    }>()
  })

  test('root head matches: positional tuple [root, ...all descendants[]]', () => {
    type RootHeadCtx = HeadCtxFor<RegisterWithTestRouteTree, typeof rootRoute>
    type RootMatches = RootHeadCtx['matches']

    expectTypeOf<RootMatches>().not.toBeAny()

    // Position 0: root (self)
    expectTypeOf<RootMatches[0]['routeId']>().toEqualTypeOf<
      typeof rootRouteId
    >()
    expectTypeOf<NonNullable<RootMatches[0]['loaderData']>>().toEqualTypeOf<{
      root: string
    }>()

    // Position 1+: all other routes as descendants
    type DescendantRouteIds = NonNullable<RootMatches[1]>['routeId']
    expectTypeOf<'/foo'>().toMatchTypeOf<DescendantRouteIds>()
    expectTypeOf<'/foo/bar'>().toMatchTypeOf<DescendantRouteIds>()
    expectTypeOf<'/hello'>().toMatchTypeOf<DescendantRouteIds>()
    expectTypeOf<'/hello/world'>().toMatchTypeOf<DescendantRouteIds>()
  })
})
