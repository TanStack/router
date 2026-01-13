import { expectTypeOf, test } from 'vitest'
import * as Angular from '@angular/core'
import {
  createRootRoute,
  createRoute,
  createRouter,
  injectLocation,
} from '../src'
import type { ParsedLocation } from '@tanstack/router-core'

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

const defaultRouter = createRouter({ routeTree })

type DefaultRouter = typeof defaultRouter

test('should have the types for a ParsedLocation in injectLocation', () => {
  const location = injectLocation<DefaultRouter>()

  expectTypeOf(location).toEqualTypeOf<Angular.Signal<ParsedLocation>>()
  expectTypeOf(location())
    .toHaveProperty('pathname')
    .toEqualTypeOf<ParsedLocation['pathname']>()
})

test('should have the type of string for selecting the pathname in injectLocation', () => {
  const pathname = injectLocation<DefaultRouter, string>({
    select: (state) => state.pathname,
  })

  expectTypeOf(pathname).toEqualTypeOf<Angular.Signal<string>>()
  expectTypeOf(pathname()).toMatchTypeOf<ParsedLocation['pathname']>()
})


