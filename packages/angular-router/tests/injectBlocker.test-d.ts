import { expectTypeOf, test } from 'vitest'
import * as Angular from '@angular/core'
import {
  createRootRoute,
  createRoute,
  createRouter,
  injectBlocker,
} from '../src'

test('blocker without resolver', () => {
  const rootRoute = createRootRoute()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
  })

  const invoicesIndexRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '/',
  })

  const routeTree = rootRoute.addChildren([
    invoicesRoute.addChildren([invoicesIndexRoute]),
    indexRoute,
  ])

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(injectBlocker<DefaultRouter, false>).returns.toBeVoid()
})

test('blocker with resolver', () => {
  const rootRoute = createRootRoute()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
  })

  const invoicesIndexRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '/',
  })

  const routeTree = rootRoute.addChildren([
    invoicesRoute.addChildren([invoicesIndexRoute]),
    indexRoute,
  ])

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(injectBlocker<DefaultRouter, true>).returns.toBeObject()
})

test('shouldBlockFn has corrent action', () => {
  const rootRoute = createRootRoute()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
  })

  const invoicesIndexRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '/',
  })

  const routeTree = rootRoute.addChildren([
    invoicesRoute.addChildren([invoicesIndexRoute]),
    indexRoute,
  ])

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(injectBlocker<DefaultRouter>)
    .parameter(0)
    .toHaveProperty('shouldBlockFn')
    .parameter(0)
    .toHaveProperty('action')
    .toEqualTypeOf<'PUSH' | 'REPLACE' | 'FORWARD' | 'BACK' | 'GO'>()

  expectTypeOf(injectBlocker<DefaultRouter>)
    .parameter(0)
    .toHaveProperty('shouldBlockFn')
    .parameter(0)
    .toHaveProperty('current')
    .toHaveProperty('routeId')
    .toEqualTypeOf<'__root__' | '/' | '/invoices' | '/invoices/'>()

  expectTypeOf(injectBlocker<DefaultRouter>)
    .parameter(0)
    .toHaveProperty('shouldBlockFn')
    .parameter(0)
    .toHaveProperty('next')
    .toHaveProperty('routeId')
    .toEqualTypeOf<'__root__' | '/' | '/invoices' | '/invoices/'>()
})


