import { describe, expectTypeOf, test } from 'vitest'
import type { AnyRedirect, RouterState } from '../src'

describe('RouterState compatibility', () => {
  test('retains the documented public state fields', () => {
    expectTypeOf<RouterState['loadedAt']>().toEqualTypeOf<number>()
    expectTypeOf<RouterState['isTransitioning']>().toEqualTypeOf<boolean>()
    expectTypeOf<RouterState['statusCode']>().toEqualTypeOf<number>()
    expectTypeOf<RouterState['redirect']>().toEqualTypeOf<
      AnyRedirect | undefined
    >()
  })
})
