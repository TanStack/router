import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createStart } from '../createStart'
import { createStartModule } from '../createStartModule'
import type { ValidateStartModules } from '../createStartModule'

const audit = createMiddleware({ type: 'function' }).server(({ next }) => {
  return next()
})
const unrelated = createMiddleware({ type: 'function' }).server(({ next }) => {
  return next()
})
const auditModule = createStartModule('@review/audit')(() => ({
  functionMiddleware: [audit],
}))

test('structurally identical middleware does not install a required fragment', () => {
  const start = createStart(() => ({ functionMiddleware: [unrelated] }))
  expectTypeOf<
    ValidateStartModules<typeof start, readonly [typeof auditModule]>
  >().toEqualTypeOf<"Route module '@review/audit' is not installed: add 'extends: startModules' to createStart()">()
})

test('asynchronous options preserve the actual installed fragments', () => {
  const missing = createStart(async () => ({ functionMiddleware: [unrelated] }))
  const installed = createStart(async () => ({ extends: [auditModule] }))
  expectTypeOf<
    ValidateStartModules<typeof missing, readonly [typeof auditModule]>
  >().toEqualTypeOf<"Route module '@review/audit' is not installed: add 'extends: startModules' to createStart()">()
  expectTypeOf<
    ValidateStartModules<typeof installed, readonly [typeof auditModule]>
  >().toEqualTypeOf<true>()
})

test('an array element type cannot prove a fragment is installed', () => {
  const fragments: Array<typeof auditModule> = []
  const start = createStart(() => ({
    extends: fragments,
    functionMiddleware: [unrelated],
  }))
  expectTypeOf<
    ValidateStartModules<typeof start, readonly [typeof auditModule]>
  >().not.toEqualTypeOf<true>()
})

test('every conditional fragment list must install the required fragment', () => {
  const condition: boolean = Math.random() > 0.5
  const fragments = condition ? ([auditModule] as const) : ([] as const)
  const start = createStart(() => ({
    extends: fragments,
    functionMiddleware: [unrelated],
  }))
  expectTypeOf<
    ValidateStartModules<typeof start, readonly [typeof auditModule]>
  >().not.toEqualTypeOf<true>()
})
