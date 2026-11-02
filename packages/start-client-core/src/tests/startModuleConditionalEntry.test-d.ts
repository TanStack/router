import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createStart } from '../createStart'
import { createStartModule } from '../createStartModule'
import type {
  AssertStartModules,
  ValidateStartModules,
} from '../createStartModule'

const audit = createMiddleware({ type: 'function' }).server(({ next }) =>
  next(),
)
const auditModule = createStartModule('@review/conditional-audit')(() => ({
  functionMiddleware: [audit],
}))
const unrelatedModule = createStartModule('@review/conditional-unrelated')(
  () => ({ functionMiddleware: [audit] }),
)

test('a union inside a fixed fragment tuple does not prove required installation', () => {
  const chosen = Math.random() > 0.5 ? auditModule : unrelatedModule
  const start = createStart(() => ({ extends: [chosen] }))
  type Result = ValidateStartModules<
    typeof start,
    readonly [typeof auditModule]
  >
  expectTypeOf<Result>().not.toEqualTypeOf<true>()
  // @ts-expect-error the generated assertion must reject an optionally installed fragment
  type InvalidApp = AssertStartModules<Result>
})

test('a fixed required fragment can accompany an unrelated union entry', () => {
  const chosen = Math.random() > 0.5 ? auditModule : unrelatedModule
  const start = createStart(() => ({ extends: [auditModule, chosen] }))
  expectTypeOf<
    AssertStartModules<
      ValidateStartModules<typeof start, readonly [typeof auditModule]>
    >
  >().toEqualTypeOf<true>()
})
