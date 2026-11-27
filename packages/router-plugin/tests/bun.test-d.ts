import { expectTypeOf, test } from 'vitest'
import TanStackRouterBun, { tanstackRouter } from '@tanstack/router-plugin/bun'
import type { BuildConfig, BunPlugin } from 'bun'
import type { Config } from '@tanstack/router-plugin/bun'

test('accepts the published plugin in a native Bun build', () => {
  expectTypeOf<ReturnType<typeof tanstackRouter>>().toEqualTypeOf<BunPlugin>()
  expectTypeOf<typeof TanStackRouterBun>().toEqualTypeOf<
    typeof tanstackRouter
  >()
  expectTypeOf<Array<ReturnType<typeof tanstackRouter>>>().toMatchTypeOf<
    BuildConfig['plugins']
  >()
  expectTypeOf<Partial<Config>>().toMatchTypeOf<
    Parameters<typeof tanstackRouter>[0]
  >()
})
