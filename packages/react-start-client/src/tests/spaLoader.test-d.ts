import { expectTypeOf, test } from 'vitest'
import { createRootRoute, createRoute } from '@tanstack/react-router'

test('an unregistered SPA loader can return client-only values', () => {
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: 'client-only',
    loader: () => ({ greet: () => 'hello' }),
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    greet: () => string
  }>()
})
