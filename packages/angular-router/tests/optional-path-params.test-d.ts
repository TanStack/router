import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  injectNavigate,
  injectParams,
} from '../src'
import type * as Angular from '@angular/core'

const rootRoute = createRootRoute()
const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/{-$category}/{-$slug}',
})

const _router = createRouter({
  routeTree: rootRoute.addChildren([postsRoute]),
})

test('optional params route can be consumed via injectParams in non-strict mode', () => {
  const params = injectParams<typeof _router, '/posts/{-$category}/{-$slug}', false>({
    strict: false,
  })

  expectTypeOf(params).toMatchTypeOf<Angular.Signal<Record<string, unknown>>>()
})

test('injectNavigate is available for routers with optional param routes', () => {
  const navigate = injectNavigate<typeof _router>()
  expectTypeOf(navigate).toBeFunction()
})
