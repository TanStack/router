import { expectTypeOf, test } from 'vitest'
import { createStart } from '../createStart'
import type {
  AssertStartModules,
  ValidateStartModules,
} from '../createStartModule'

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/impossible-requirement': {
      requestContext: { role: 'admin' } & { role: 'guest' }
    }
  }
}

test('an intersection-derived impossible requirement cannot be treated as absent', () => {
  const start = createStart(() => ({}))
  type Result = ValidateStartModules<
    typeof start,
    [],
    ['@review/impossible-requirement']
  >
  expectTypeOf<Result>().not.toEqualTypeOf<true>()
  // @ts-expect-error no application context can satisfy the impossible requirement
  type InvalidApp = AssertStartModules<Result>
})
