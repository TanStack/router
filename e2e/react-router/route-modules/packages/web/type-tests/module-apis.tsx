import * as React from 'react'
import { describe, expectTypeOf, test } from 'vitest'
import { Link, useMatch } from '@tanstack/react-router'
import {
  Link as ProductsLink,
  getRouteApi as productsGetRouteApi,
  linkOptions as productsLinkOptions,
  redirect as productsRedirect,
  useLoaderData as productsUseLoaderData,
  useNavigate as productsUseNavigate,
  useRouter as productsUseRouter,
} from '@route-modules/products/scope'
import {
  Link as AccountLink,
  getRouteApi as accountGetRouteApi,
  products,
} from '@route-modules/account/scope'
import * as localTeam from '@route-modules/team/scope'
import { team as hostedTeam } from '../src/routeScope.gen'
import type { createAppRouter } from '../src/router'
import type { Price, Product, ProductsApi } from '@route-modules/products/api'
import type {
  Router as ProductsRouter,
  OwnRoutesById,
} from '@route-modules/products/route-types'
import type { ScopedRouterView } from '@tanstack/react-router'

declare const ProductRoute: OwnRoutesById['@route-modules/products:/$productId']
declare const ProductsRootRoute: OwnRoutesById['@route-modules/products:']

describe('module route types', () => {
  test('ids are qualified, full paths are module-local', () => {
    expectTypeOf(
      ProductRoute.id,
    ).toEqualTypeOf<'@route-modules/products:/$productId'>()
    expectTypeOf(ProductRoute.fullPath).toEqualTypeOf<'/$productId'>()
    expectTypeOf(
      ProductsRootRoute.id,
    ).toEqualTypeOf<'@route-modules/products:'>()
  })

  test('route-bound hooks resolve through the module scope', () => {
    const product = ProductRoute.useLoaderData()
    expectTypeOf(product).not.toBeAny()
    expectTypeOf(product).toEqualTypeOf<Product>()
    expectTypeOf(product.price).toEqualTypeOf<Price>()

    expectTypeOf(ProductRoute.useParams()).toEqualTypeOf<{
      productId: string
    }>()
    expectTypeOf(ProductRoute.useSearch()).toEqualTypeOf<{
      tab: 'specs' | 'reviews'
    }>()
    expectTypeOf(ProductRoute.useRouteContext()).toEqualTypeOf<{
      productsApi: ProductsApi
    }>()
  })

  test('the module root requires its router context', () => {
    expectTypeOf(ProductsRootRoute.types.routerContext).toEqualTypeOf<{
      productsApi: ProductsApi
    }>()
  })
})

describe('scoped path-based APIs', () => {
  test('Link takes module-local paths only', () => {
    ;<ProductsLink to="/$productId" params={{ productId: '1' }} />
    ;<ProductsLink
      to="/$productId"
      params={{ productId: '1' }}
      search={{ tab: 'reviews' }}
    />
    ;<ProductsLink to="/compare" search={{ ids: ['1'] }} />
    // @ts-expect-error unknown module-local path
    ;<ProductsLink to="/nope" />
    // @ts-expect-error final application paths are not module-local paths
    ;<ProductsLink to="/shop/products/$productId" params={{ productId: '1' }} />
    // @ts-expect-error missing params
    ;<ProductsLink to="/$productId" />
    // @ts-expect-error required search input is missing
    ;<ProductsLink to="/compare" />
    ;<ProductsLink
      to="/$productId"
      params={{ productId: '1' }}
      // @ts-expect-error search input is validated
      search={{ tab: 'other' }}
    />
  })

  test('useNavigate, redirect and linkOptions use the module router', () => {
    const navigate = productsUseNavigate()
    navigate({ to: '/$productId', params: { productId: '1' } })
    // @ts-expect-error unknown module-local path
    navigate({ to: '/nope' })

    productsRedirect({ to: '/compare', search: { ids: [] } })
    // @ts-expect-error required search input is missing
    productsRedirect({ to: '/compare' })

    productsLinkOptions({ to: '/$productId', params: { productId: '1' } })
    // @ts-expect-error unknown module-local path
    productsLinkOptions({ to: '/nope' })
  })

  test('the scoped router view navigates in module coordinates', () => {
    const router = productsUseRouter()
    expectTypeOf(router).toEqualTypeOf<ScopedRouterView<ProductsRouter>>()
    router.navigate({ to: '/compare', search: { ids: ['1'] } })
    // @ts-expect-error unknown module-local path
    router.navigate({ to: '/nope' })
  })

  test('Route.Link and Route.useNavigate are module-local', () => {
    ;<ProductRoute.Link to="/" />
    ;<ProductRoute.Link to=".." />
    // @ts-expect-error unknown module-local path
    ;<ProductRoute.Link to="/nope" />
    const navigate = ProductRoute.useNavigate()
    navigate({ to: '/compare', search: { ids: [] } })
    // @ts-expect-error unknown module-local path
    navigate({ to: '/nope' })
  })
})

describe('scoped id-based APIs', () => {
  test('getRouteApi and hooks take qualified ids', () => {
    const product = productsGetRouteApi(
      '@route-modules/products:/$productId',
    ).useLoaderData()
    expectTypeOf(product).toEqualTypeOf<Product>()
    expectTypeOf(
      productsUseLoaderData({ from: '@route-modules/products:/$productId' }),
    ).toEqualTypeOf<Product>()
    // @ts-expect-error unknown qualified id
    productsGetRouteApi('@route-modules/products:/nope')
    // @ts-expect-error module-local paths are not route ids
    productsGetRouteApi('/$productId')
  })
})

describe('a module that uses another module', () => {
  test('the namespace links into the used module', () => {
    ;<products.Link to="/$productId" params={{ productId: '1' }} />
    // @ts-expect-error account paths are not products paths
    ;<products.Link to="/orders/$orderId" params={{ orderId: '1' }} />
    ;<AccountLink to="/orders/$orderId" params={{ orderId: '1' }} />
    // @ts-expect-error products paths are not account paths
    ;<AccountLink to="/$productId" params={{ productId: '1' }} />
  })

  test('both modules own "/" without colliding', () => {
    ;<AccountLink to="/" />
    ;<products.Link to="/" />
  })

  test('used module routes are visible by qualified id', () => {
    expectTypeOf(
      accountGetRouteApi('@route-modules/products:/$productId').useLoaderData(),
    ).toEqualTypeOf<Product>()
    expectTypeOf(
      accountGetRouteApi(
        '@route-modules/account:/orders/$orderId',
      ).useLoaderData(),
    ).toEqualTypeOf<{ orderId: string; productId: string }>()
  })
})

describe('a module mounted under path params', () => {
  test('the actual generated host namespace takes host and module params', () => {
    ;<hostedTeam.Link
      to="/members/$memberId"
      params={{ orgId: 'acme', memberId: '1' }}
    />
    ;<hostedTeam.Link to="/" params={{ orgId: 'acme' }} />
    // @ts-expect-error the host parameter is missing
    ;<hostedTeam.Link to="/members/$memberId" params={{ memberId: '1' }} />
    // @ts-expect-error a route without local params still needs host params
    ;<hostedTeam.Link to="/" />
    hostedTeam.linkOptions({ to: '/', params: { orgId: 'acme' } })
  })

  test('the published module-local API does not require host params', () => {
    ;<localTeam.Link to="/" />
    ;<localTeam.Link to="/members/$memberId" params={{ memberId: '1' }} />
  })
})

describe('the application', () => {
  type AppRouter = ReturnType<typeof createAppRouter>

  test('addresses its own routes by path and module routes by id', () => {
    ;<Link<AppRouter, string, '/orgs/$orgId'>
      to="/orgs/$orgId"
      params={{ orgId: 'acme' }}
    />
    ;<Link<AppRouter, string, '/shop/products/$productId'>
      // @ts-expect-error module routes are not addressed by final path
      to="/shop/products/$productId"
    />
    expectTypeOf(
      useMatch<AppRouter, '@route-modules/products:/$productId'>({
        from: '@route-modules/products:/$productId',
      }).loaderData,
    ).toEqualTypeOf<Product | undefined>()
  })
})
