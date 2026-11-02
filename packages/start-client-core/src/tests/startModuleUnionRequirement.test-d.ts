import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createServerFn } from '../createServerFn'
import { createStart } from '../createStart'
import type { CreateMiddlewareFn } from '../createMiddleware'
import type {
  AssertStartModules,
  StartModuleRegister,
  ValidateStartModules,
} from '../createStartModule'

const userContext = Symbol('user context')
type Authentication = { user: { id: string } } | { apiKey: string }

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/union-request': { requestContext: Authentication }
    '@review/union-function': { functionContext: Authentication }
    '@review/symbol-request': { requestContext: { [userContext]: string } }
  }
}

const user = createMiddleware().server(({ next }) =>
  next({ context: { user: { id: 'user' } } }),
)
const apiKey = createMiddleware().server(({ next }) =>
  next({ context: { apiKey: 'key' } }),
)
const functionUser = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { user: { id: 'user' } } }),
)
const functionApiKey = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { apiKey: 'key' } }),
)

const createRequestReader = createMiddleware as unknown as CreateMiddlewareFn<
  StartModuleRegister<'@review/union-request'>
>
const requestReader = createRequestReader().server(({ context, next }) => {
  const credential = 'user' in context ? context.user.id : context.apiKey
  expectTypeOf(credential).toEqualTypeOf<string>()
  return next()
})
const createFunctionReader = createMiddleware as unknown as CreateMiddlewareFn<
  StartModuleRegister<'@review/union-function'>
>
const functionReader = createFunctionReader({ type: 'function' }).server(
  ({ context, next }) => {
    const credential = 'user' in context ? context.user.id : context.apiKey
    expectTypeOf(credential).toEqualTypeOf<string>()
    return next()
  },
)

test('a union request requirement needs a host provider for one alternative', () => {
  const missing = createStart(() => ({}))
  type Missing = ValidateStartModules<
    typeof missing,
    [],
    ['@review/union-request']
  >
  expectTypeOf<Missing>().not.toEqualTypeOf<true>()
  // @ts-expect-error neither authentication alternative is provided
  type _Missing = AssertStartModules<Missing>
  const withUser = createStart(() => ({ requestMiddleware: [user] }))
  const withApiKey = createStart(() => ({ requestMiddleware: [apiKey] }))
  expectTypeOf<
    ValidateStartModules<typeof withUser, [], ['@review/union-request']>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    ValidateStartModules<typeof withApiKey, [], ['@review/union-request']>
  >().toEqualTypeOf<true>()
})

test('a union function requirement needs a host provider for one alternative', () => {
  const missing = createStart(() => ({}))
  type Missing = ValidateStartModules<
    typeof missing,
    [],
    ['@review/union-function']
  >
  expectTypeOf<Missing>().not.toEqualTypeOf<true>()
  // @ts-expect-error neither authentication alternative is provided
  type _Missing = AssertStartModules<Missing>
  const withUser = createStart(() => ({ functionMiddleware: [functionUser] }))
  const withApiKey = createStart(() => ({
    functionMiddleware: [functionApiKey],
  }))
  expectTypeOf<
    ValidateStartModules<typeof withUser, [], ['@review/union-function']>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    ValidateStartModules<typeof withApiKey, [], ['@review/union-function']>
  >().toEqualTypeOf<true>()
})

test('local middleware consumers check union requirements before running', () => {
  createMiddleware()
    .middleware([requestReader])
    .server(
      // @ts-expect-error the imported request consumer has no authentication provider
      ({ next }) => next(),
    )
  createMiddleware()
    .middleware([user, requestReader])
    .server(({ next }) => next())
  createMiddleware()
    .middleware([apiKey, requestReader])
    .server(({ next }) => next())
  createServerFn()
    .middleware([functionReader])
    .handler(
      // @ts-expect-error the imported function consumer has no authentication provider
      () => 'result',
    )
  createServerFn()
    .middleware([functionUser, functionReader])
    .handler(() => 'result')
  createServerFn()
    .middleware([functionApiKey, functionReader])
    .handler(() => 'result')
})

const symbolProvider = createMiddleware().server(({ next }) =>
  next({ context: { [userContext]: 'user' } }),
)
const wrongSymbolProvider = createMiddleware().server(({ next }) =>
  next({ context: { [userContext]: 42 } }),
)
const createSymbolReader = createMiddleware as unknown as CreateMiddlewareFn<
  StartModuleRegister<'@review/symbol-request'>
>
const symbolReader = createSymbolReader().server(({ context, next }) => {
  expectTypeOf(context[userContext]).toEqualTypeOf<string>()
  return next()
})

test('symbol-keyed required fields cannot disappear from diagnostics and validation', () => {
  const missing = createStart(() => ({}))
  const wrong = createStart(() => ({
    requestMiddleware: [wrongSymbolProvider],
  }))
  type Missing = ValidateStartModules<
    typeof missing,
    [],
    ['@review/symbol-request']
  >
  type Wrong = ValidateStartModules<
    typeof wrong,
    [],
    ['@review/symbol-request']
  >
  expectTypeOf<Missing>().not.toEqualTypeOf<true>()
  expectTypeOf<Wrong>().not.toEqualTypeOf<true>()
  // @ts-expect-error the symbol-keyed field is absent
  type _Missing = AssertStartModules<Missing>
  // @ts-expect-error the symbol-keyed field has the wrong type
  type _Wrong = AssertStartModules<Wrong>
  const valid = createStart(() => ({ requestMiddleware: [symbolProvider] }))
  expectTypeOf<
    ValidateStartModules<typeof valid, [], ['@review/symbol-request']>
  >().toEqualTypeOf<true>()
  createMiddleware()
    .middleware([symbolReader])
    .server(
      // @ts-expect-error the symbol-keyed field is absent before this consumer
      ({ next }) => next(),
    )
  createMiddleware()
    .middleware([wrongSymbolProvider, symbolReader])
    .server(
      // @ts-expect-error the symbol-keyed field has the wrong type before this consumer
      ({ next }) => next(),
    )
  createMiddleware()
    .middleware([symbolProvider, symbolReader])
    .server(({ next }) => next())
})
