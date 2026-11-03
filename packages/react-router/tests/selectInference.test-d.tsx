import { test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  useChildMatches,
  useLocation,
  useMatch,
  useMatches,
  useParentMatches,
  useRouterState,
} from '../src'
import type {
  UseLoaderDataResult,
  UseLoaderDepsResult,
  UseParamsResult,
  UseRouteContextResult,
  UseSearchResult,
} from '@tanstack/router-core'

// Without `select`, a hook's result is the resolved type wherever the call
// sits: `TSelected` must not be inferred from the expected type.

declare function takesNumber(value: number): void

const rootRoute = createRootRoute()
const invoiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'invoices/$invoiceId',
  validateSearch: () => ({ page: 0 }),
  context: () => ({ permission: 'view' }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: () => ({ invoice: 'invoice' }),
})
const router = createRouter({
  routeTree: rootRoute.addChildren([invoiceRoute]),
})
type Router = typeof router
type From = '/invoices/$invoiceId'

// Stand-ins for the route hooks, whose only inference site without `select`
// is their return type.
declare function loaderData<TSelected = unknown>(): UseLoaderDataResult<
  Router,
  From,
  true,
  TSelected
>
declare function search<TSelected = unknown>(): UseSearchResult<
  Router,
  From,
  true,
  TSelected
>
declare function params<TSelected = unknown>(): UseParamsResult<
  Router,
  From,
  true,
  TSelected
>
declare function routeContext<TSelected = unknown>(): UseRouteContextResult<
  Router,
  From,
  true,
  TSelected
>
declare function loaderDeps<TSelected = unknown>(): UseLoaderDepsResult<
  Router,
  From,
  TSelected
>

test('route result types are not inferred from the expected type', () => {
  // @ts-expect-error loader data is not a number
  takesNumber(loaderData())
  // @ts-expect-error search is not a number
  takesNumber(search())
  // @ts-expect-error params are not a number
  takesNumber(params())
  // @ts-expect-error route context is not a number
  takesNumber(routeContext())
  // @ts-expect-error loader deps are not a number
  takesNumber(loaderDeps())
})

test('hooks without select are not inferred from the expected type', () => {
  // @ts-expect-error router state is not a number
  takesNumber(useRouterState())
  // @ts-expect-error location is not a number
  takesNumber(useLocation())
  // @ts-expect-error matches are not a number
  takesNumber(useMatches())
  // @ts-expect-error matches are not a number
  takesNumber(useParentMatches())
  // @ts-expect-error matches are not a number
  takesNumber(useChildMatches())
  // @ts-expect-error a match is not a number
  takesNumber(useMatch({ strict: false }))
})
