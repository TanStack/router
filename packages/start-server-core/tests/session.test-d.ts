import { expectTypeOf, test } from 'vitest'
import type { SessionConfig } from '@tanstack/start-server-core'

type Seal = NonNullable<SessionConfig['seal']>

test('session seal algorithms retain their public unions', () => {
  expectTypeOf<NonNullable<Seal['encryption']>['algorithm']>().toEqualTypeOf<
    'aes-128-ctr' | 'aes-256-cbc'
  >()
  expectTypeOf<
    NonNullable<Seal['integrity']>['algorithm']
  >().toEqualTypeOf<'sha256'>()
})
