import { expectTypeOf, test } from 'vitest'
import { Link, createRouter, createRoute, createRootRoute } from '../src'
import type { LinkComponentProps } from '../src'

const rootRoute = createRootRoute()
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
const routeTree = rootRoute.addChildren([indexRoute])
const router = createRouter({ routeTree })

type MyRouter = typeof router

test('debug link types', () => {
  // Test 1: Instantiate Link with explicit router
  const MyLink = Link<{ router: MyRouter }, '/', '/'>

  // Check the type of MyLink
  // It should be a function taking props

  type MyLinkProps = Parameters<typeof MyLink>[0]

  // Expect 'to' to be specific
  expectTypeOf<MyLinkProps['to']>().toEqualTypeOf<'/' | '.' | '..'>()

  // Check what parameter(0) returns on the instantiated function
  expectTypeOf(MyLink)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'/' | '.' | '..'>()
})
