import { expectTypeOf, test } from 'vitest'
import type { DehydratedMatch } from '../src/ssr/client'

test('wire keys are typed as what was sent, which a custom dehydrate decides', () => {
  expectTypeOf<DehydratedMatch['l']>().toBeUnknown()
  expectTypeOf<DehydratedMatch['b']>().toBeUnknown()
})
