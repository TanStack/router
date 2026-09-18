import { expectTypeOf, test } from 'vitest'
import { lazyRouteComponent } from '../src'
import type { AsyncRouteComponent } from '../src'

test('default export infers props and is not never', () => {
  const Comp = lazyRouteComponent(async () => ({
    default: (_props: { id: string }) => null,
  }))

  expectTypeOf(Comp).toEqualTypeOf<AsyncRouteComponent<{ id: string }>>()
  expectTypeOf(Comp).not.toEqualTypeOf<never>()
})

test('named export infers props', () => {
  const Comp = lazyRouteComponent(
    async () => ({
      Page: (_props: { title: string }) => null,
    }),
    'Page',
  )

  expectTypeOf(Comp).toEqualTypeOf<AsyncRouteComponent<{ title: string }>>()
})
