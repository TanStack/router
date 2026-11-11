import { describe, expectTypeOf, test } from 'vitest'
import type { routeTree } from '../src/routeTree.gen'
import type { createAppRouter } from '../src/router'
import { routeModule as productsRouteModule } from '@route-modules/products/route-module'
import {
  useMatch as useProductMatch,
  useRouter as useProductRouter,
  useRouterState as useProductRouterState,
  useLocation as useProductLocation,
  useSearch as useProductSearch,
  isScopedMatch as isProductMatch,
} from '@route-modules/products/scope'
import type {
  Router as ProductsRouter,
  OwnRoutesById,
} from '@route-modules/products/route-types'
import type { Product } from '@route-modules/products/api'
import type {
  AnyRouteMatch,
  AnyRoute,
  ForeignRouteMatch,
  InstallationRoutesById,
  MountedRoutesById,
  MakeRouteMatch,
  MakeRouteMatchUnion,
} from '@tanstack/react-router'

declare const ProductRoute: OwnRoutesById['@route-modules/products:/$productId']
declare const foreignMatch: ForeignRouteMatch
declare const routerMatch: AnyRouteMatch
declare const mountedProduct: ReturnType<
  typeof createAppRouter
>['routesById']['@route-modules/products:/$productId']

const applicationRoute: AnyRoute = mountedProduct
void applicationRoute

describe('installed route identity contracts', () => {
  test('installation map values agree with their keys', () => {
    type Installed = InstallationRoutesById<
      { '@route-modules/products:/$productId': typeof ProductRoute },
      '@route-modules/products',
      'shopProducts'
    >
    type Product = Installed['@route-modules/products#shopProducts:/$productId']

    expectTypeOf<
      Product['id']
    >().toEqualTypeOf<'@route-modules/products#shopProducts:/$productId'>()
    expectTypeOf<
      Product['types']['id']
    >().toEqualTypeOf<'@route-modules/products#shopProducts:/$productId'>()
    expectTypeOf(
      ProductRoute.id,
    ).toEqualTypeOf<'@route-modules/products:/$productId'>()
    type Mounted =
      MountedRoutesById<Installed>['@route-modules/products#shopProducts:/$productId']
    expectTypeOf<Mounted['fullPath']>().toEqualTypeOf<string>()
    expectTypeOf<Mounted['types']['fullPath']>().toEqualTypeOf<string>()
    expectTypeOf<Mounted['to']>().toEqualTypeOf<string>()
    expectTypeOf(ProductRoute.fullPath).toEqualTypeOf<'/$productId'>()
  })

  test('known module matches have an exact required local identity', () => {
    type ProductMatch = MakeRouteMatch<
      typeof productsRouteModule,
      '@route-modules/products:/$productId'
    >
    expectTypeOf<
      ProductMatch['localRouteId']
    >().toEqualTypeOf<'@route-modules/products:/$productId'>()
    expectTypeOf<AnyRouteMatch['localRouteId']>().toEqualTypeOf<
      string | undefined
    >()
  })

  test('application records preserve ordinary path precision and mixed optional identity', () => {
    type Tree = typeof routeTree
    type Host = MakeRouteMatch<Tree, '/orgs/$orgId'>
    expectTypeOf<Host['fullPath']>().toEqualTypeOf<'/orgs/$orgId'>()
    type Mixed = MakeRouteMatch<
      Tree,
      '/orgs/$orgId' | '@route-modules/settings#orgSettings:/profile'
    >
    expectTypeOf<Mixed['localRouteId']>().toEqualTypeOf<string | undefined>()
    type Product = MakeRouteMatch<
      Tree,
      '@route-modules/settings#orgSettings:/profile'
    >
    expectTypeOf<
      Product['routeId']
    >().toEqualTypeOf<'@route-modules/settings#orgSettings:/profile'>()
    expectTypeOf<Product['fullPath']>().toEqualTypeOf<string>()
  })

  test('module hooks describe final installation identity honestly', () => {
    const match = useProductMatch({
      from: '@route-modules/products:/$productId',
    })
    expectTypeOf(match.fullPath).toEqualTypeOf<string>()
    expectTypeOf(match.routeId).toEqualTypeOf<
      | '@route-modules/products:/$productId'
      | `@route-modules/products#${string}:/$productId`
    >()
    expectTypeOf(
      match.localRouteId,
    ).toEqualTypeOf<'@route-modules/products:/$productId'>()
  })

  test('a full scoped match chain includes unknown host data', () => {
    type Match = MakeRouteMatchUnion<ProductsRouter>
    expectTypeOf<Match['context']>().toBeUnknown()
    expectTypeOf<Match['loaderData']>().toBeUnknown()
    expectTypeOf(useProductRouterState().matches[0]!.context).toBeUnknown()
    expectTypeOf(useProductLocation().search).toEqualTypeOf<
      Record<string, unknown>
    >()
    expectTypeOf(useProductRouter().state.location.search).toEqualTypeOf<
      Record<string, unknown>
    >()
    expectTypeOf(
      useProductSearch({ from: '@route-modules/products:/$productId' }).tab,
    ).toEqualTypeOf<'specs' | 'reviews'>()
    expectTypeOf(useProductRouter().state.matches[0]!.loaderData).toBeUnknown()
    useProductRouterState({
      select: (state) => {
        expectTypeOf(state.matches[0]!.context).toBeUnknown()
        return state.matches.length
      },
    })
  })

  test('scope membership narrows complete router matches', () => {
    isProductMatch(routerMatch)
    isProductMatch(foreignMatch)
    for (const match of useProductRouterState().matches) {
      if (
        isProductMatch(match) &&
        match.localRouteId === '@route-modules/products:/$productId'
      ) {
        expectTypeOf(match.loaderData).toEqualTypeOf<Product | undefined>()
      }
    }

    // @ts-expect-error Scope membership cannot supply absent match data.
    isProductMatch({
      routeId: '@route-modules/products:/$productId',
      localRouteId: '@route-modules/products:/$productId',
    })
  })

  test('loose match selectors retain unknown foreign route data', () => {
    useProductMatch({
      strict: false,
      select: (match) => {
        expectTypeOf(match.loaderData).toBeUnknown()
        expectTypeOf(match.context).toBeUnknown()
        return match.routeId
      },
    })
  })

  test('raw scoped router maps do not promise module-local aliases', () => {
    const router = useProductRouter()
    expectTypeOf(
      router.routesById['@route-modules/products:/$productId'],
    ).toEqualTypeOf<AnyRoute | undefined>()
    expectTypeOf(router.routesByPath['/$productId']).toEqualTypeOf<
      AnyRoute | undefined
    >()
  })
})

test('application route records expose mounted paths and raw linked routes honestly', () => {
  type Routes = ReturnType<typeof createAppRouter>['routesById']
  type Root = Routes['@route-modules/settings#orgSettings:']
  type Profile = Routes['@route-modules/settings#orgSettings:/profile']
  // These are values read from the real generated installation at runtime.
  // They must be assignable to the public route object's declared fields.
  expectTypeOf<'settings'>().toMatchTypeOf<Root['path']>()
  expectTypeOf<'settings'>().toMatchTypeOf<Root['types']['path']>()
  expectTypeOf<'/settings'>().toMatchTypeOf<
    NonNullable<Root['options']['path']>
  >()
  expectTypeOf<'@route-modules/settings#orgSettings:'>().toMatchTypeOf<
    Profile['parentRoute']['id']
  >()
  expectTypeOf<'@route-modules/settings#orgSettings:'>().toMatchTypeOf<
    Profile['types']['parentRoute']['id']
  >()
  type ParentFromOptions = ReturnType<
    NonNullable<Profile['options']['getParentRoute']>
  >
  expectTypeOf<'@route-modules/settings#orgSettings:'>().toMatchTypeOf<
    ParentFromOptions['id']
  >()

  type Layout = Routes['@route-modules/products:/_layout']
  type Children = NonNullable<Layout['children']>
  type Child =
    Children extends ReadonlyArray<infer Item> ? Item : Children[keyof Children]
  expectTypeOf<'/shop/products/deals'>().toMatchTypeOf<Child['fullPath']>()

  // Precision that the application can prove remains intact.
  expectTypeOf<
    Profile['id']
  >().toEqualTypeOf<'@route-modules/settings#orgSettings:/profile'>()
  expectTypeOf<
    Routes['/orgs/$orgId']['fullPath']
  >().toEqualTypeOf<'/orgs/$orgId'>()
})
