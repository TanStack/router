import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createServerFn } from '../createServerFn'
import type { CreateMiddlewareFn } from '../createMiddleware'
import type { CreateServerFn } from '../createServerFn'
import type { StartModuleRegister } from '../createStartModule'

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/cross-module-reader': { requestContext: { value: string } }
  }
}

const createReaderMiddleware =
  createMiddleware as unknown as CreateMiddlewareFn<
    StartModuleRegister<'@review/cross-module-reader'>
  >
const createRequirementFreeServerFn =
  createServerFn as unknown as CreateServerFn<
    StartModuleRegister<'@review/requirement-free'>
  >
const provider = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { value: 'valid' } }),
)
const overwrite = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { value: 1 } }),
)
const reader = createReaderMiddleware({ type: 'function' }).server(
  ({ context, next }) => {
    expectTypeOf(context.value).toEqualTypeOf<string>()
    context.value.toUpperCase()
    return next()
  },
)

test('an unscoped host function checks scoped middleware consumers', () => {
  createServerFn()
    .middleware([provider, overwrite, reader])
    .handler(
      // @ts-expect-error the imported reader consumes a number after the overwrite
      () => 'result',
    )
})

test('a module without its own requirements checks imported middleware consumers', () => {
  createRequirementFreeServerFn()
    .middleware([provider, overwrite, reader])
    .handler(
      // @ts-expect-error the imported reader consumes a number after the overwrite
      () => 'result',
    )
})

test('an unscoped middleware checks scoped nested consumers', () => {
  createMiddleware({ type: 'function' })
    .middleware([provider, overwrite, reader])
    .server(
      // @ts-expect-error the imported reader consumes a number after the overwrite
      ({ next }) => next(),
    )
})

test('a valid imported middleware remains usable', () => {
  createServerFn()
    .middleware([provider, reader])
    .handler(() => 'result')
  createRequirementFreeServerFn()
    .middleware([provider, reader])
    .handler(() => 'result')
})
