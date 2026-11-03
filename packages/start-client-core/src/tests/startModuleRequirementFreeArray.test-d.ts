import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createServerFn } from '../createServerFn'
import { createStart } from '../createStart'
import type { CreateServerFn } from '../createServerFn'
import type {
  AssertStartModules,
  StartModuleRegister,
  ValidateStartModules,
} from '../createStartModule'

const ordinary = createMiddleware().server(({ next }) =>
  next({ context: { ordinary: 'value' } }),
)
const providers = [ordinary]
const createRequirementFreeServerFn =
  createServerFn as unknown as CreateServerFn<
    StartModuleRegister<'@review/no-requirements'>
  >

test('requirement-free modules do not demand tuple proof for ordinary arrays', () => {
  const start = createStart(() => ({ requestMiddleware: providers }))
  expectTypeOf<
    ValidateStartModules<typeof start, [], ['@review/no-requirements']>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    AssertStartModules<
      ValidateStartModules<typeof start, [], ['@review/no-requirements']>
    >
  >().toEqualTypeOf<true>()
  createRequirementFreeServerFn()
    .middleware(providers)
    .handler(() => 'result')
})
