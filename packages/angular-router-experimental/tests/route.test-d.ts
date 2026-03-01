import { expectTypeOf, test } from 'vitest'
import {
  createRootRouteWithContext,
  createRoute,
} from '../src'

test('createRootRouteWithContext infers context into child beforeLoad/loader', () => {
  const rootRoute = createRootRouteWithContext<{ session: string }>()({
    beforeLoad: ({ context }) => {
      expectTypeOf(context.session).toEqualTypeOf<string>()
      return { rootValue: true as const }
    },
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    beforeLoad: ({ context }) => {
      expectTypeOf(context.session).toEqualTypeOf<string>()
      expectTypeOf(context.rootValue).toEqualTypeOf<true>()
      return { childValue: 123 as const }
    },
    loader: ({ context }) => {
      expectTypeOf(context.childValue).toEqualTypeOf<123>()
      return { ok: true as const }
    },
  })
})
