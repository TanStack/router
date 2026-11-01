import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createStart } from '../createStart'
import type { CreateMiddlewareFn } from '../createMiddleware'
import type {
  AssertStartModules,
  StartModuleRegister,
  ValidateStartModules,
} from '../createStartModule'

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/installed-with-context': { requestContext: { tenantId: string } }
    '@review/mixed-use-request': { requestContext: { userId: string } }
    '@review/mixed-use-function': { functionContext: { permission: string } }
  }
}

const user = createMiddleware().server(({ next }) =>
  next({ context: { userId: 'user' } }),
)
const tenant = createMiddleware().server(({ next }) =>
  next({ context: { tenantId: 'tenant' } }),
)
const permission = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { permission: 'read' } }),
)
const createRequestReader = createMiddleware as unknown as CreateMiddlewareFn<
  StartModuleRegister<'@review/mixed-use-request'>
>
const requestReader = createRequestReader().server(({ context, next }) => {
  expectTypeOf(context.userId).toEqualTypeOf<string>()
  return next()
})
const createFunctionReader = createMiddleware as unknown as CreateMiddlewareFn<
  StartModuleRegister<'@review/mixed-use-function'>
>
const functionReader = createFunctionReader({ type: 'function' }).server(
  ({ context, next }) => {
    expectTypeOf(context.permission).toEqualTypeOf<string>()
    return next()
  },
)

test('a global middleware consumer is validated when its package routes are not installed', () => {
  const missing = createStart(() => ({ requestMiddleware: [requestReader] }))
  type Missing = ValidateStartModules<
    typeof missing,
    [],
    ['@review/unrelated-installed']
  >
  expectTypeOf<Missing>().not.toEqualTypeOf<true>()
  // @ts-expect-error an executed mixed-use package reader needs its request context
  type _Missing = AssertStartModules<Missing>
  const valid = createStart(() => ({
    requestMiddleware: [user, requestReader],
  }))
  expectTypeOf<
    ValidateStartModules<typeof valid, [], ['@review/unrelated-installed']>
  >().toEqualTypeOf<true>()
  const unused = createStart(() => ({}))
  expectTypeOf<
    ValidateStartModules<typeof unused, [], ['@review/unrelated-installed']>
  >().toEqualTypeOf<true>()
})

test('a global function consumer is validated independently of installed route package identities', () => {
  const missing = createStart(() => ({ functionMiddleware: [functionReader] }))
  type Missing = ValidateStartModules<
    typeof missing,
    [],
    ['@review/unrelated-installed']
  >
  expectTypeOf<Missing>().not.toEqualTypeOf<true>()
  // @ts-expect-error an executed mixed-use package reader needs its function context
  type _Missing = AssertStartModules<Missing>
  const valid = createStart(() => ({
    functionMiddleware: [permission, functionReader],
  }))
  expectTypeOf<
    ValidateStartModules<typeof valid, [], ['@review/unrelated-installed']>
  >().toEqualTypeOf<true>()
})

test('the global walk checks readers before execution even when another installed package already needs validation', () => {
  const overwrite = createMiddleware().server(({ next }) =>
    next({ context: { userId: 42 } }),
  )
  const wrong = createStart(() => ({
    requestMiddleware: [tenant, user, overwrite, requestReader],
  }))
  type Wrong = ValidateStartModules<
    typeof wrong,
    [],
    ['@review/installed-with-context']
  >
  expectTypeOf<Wrong>().not.toEqualTypeOf<true>()
  // @ts-expect-error the request reader runs after its context is overwritten
  type _Wrong = AssertStartModules<Wrong>
  const valid = createStart(() => ({
    requestMiddleware: [tenant, user, requestReader],
  }))
  expectTypeOf<
    ValidateStartModules<typeof valid, [], ['@review/installed-with-context']>
  >().toEqualTypeOf<true>()
})
