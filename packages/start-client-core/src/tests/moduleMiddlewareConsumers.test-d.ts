import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createServerFn } from '../createServerFn'
import { createStartModule } from '../createStartModule'
import type { CreateMiddlewareFn } from '../createMiddleware'
import type { CreateServerFn } from '../createServerFn'
import type {
  StartModuleConfig,
  StartModuleRegister,
} from '../createStartModule'

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/local-consumer': { requestContext: { value: string } }
  }
}

const moduleMiddleware = createMiddleware as unknown as CreateMiddlewareFn<
  StartModuleRegister<'@review/local-consumer'>
>
const moduleServerFn = createServerFn as unknown as CreateServerFn<
  StartModuleRegister<'@review/local-consumer'>
>
const overwrite = createMiddleware({ type: 'function' }).server(({ next }) => {
  return next({ context: { value: 1 } })
})
const restore = createMiddleware({ type: 'function' }).server(({ next }) => {
  return next({ context: { value: 'restored' } })
})
const reader = moduleMiddleware({ type: 'function' }).server(
  ({ context, next }) => {
    expectTypeOf(context.value).toEqualTypeOf<string>()
    return next()
  },
)

test('server-function local middleware must preserve context before a module consumer', () => {
  moduleServerFn()
    .middleware([overwrite, reader])
    .handler(
      // @ts-expect-error the reader receives the overwritten value
      ({ context }) => context.value,
    )
  moduleServerFn()
    .middleware([overwrite, reader, restore])
    .handler(
      // @ts-expect-error restoring after the reader cannot repair its input
      ({ context }) => context.value,
    )
})

test('middleware-local dependencies must establish the context of their consumer', () => {
  moduleMiddleware({ type: 'function' })
    .middleware([overwrite])
    .server(
      // @ts-expect-error this consumer requires the original string context
      ({ next }) => next(),
    )
  const requestOverwrite = createMiddleware().server(({ next }) =>
    next({ context: { value: 1 } }),
  )
  moduleMiddleware()
    .middleware([requestOverwrite])
    .server(
      // @ts-expect-error request consumers also need their required context
      ({ next }) => next(),
    )
})

test('local restoration cannot rely on middleware already executed globally', () => {
  const fragment = createStartModule('@review/local-consumer')(() => ({
    functionMiddleware: [restore],
  }))
  interface Register extends StartModuleRegister<'@review/local-consumer'> {
    config: StartModuleConfig<typeof fragment>
  }
  const createScopedServerFn =
    createServerFn as unknown as CreateServerFn<Register>
  createScopedServerFn()
    .middleware([overwrite, restore, reader])
    .handler(
      // @ts-expect-error the previously executed restoration can be deduplicated
      ({ context }) => context.value,
    )
})

test('intermediate builder steps can restore context before attaching a consumer', () => {
  moduleServerFn()
    .middleware([overwrite])
    .middleware([restore, reader])
    .handler(({ context }) => {
      expectTypeOf(context.value).toEqualTypeOf<string>()
      return context.value
    })
  moduleMiddleware({ type: 'function' })
    .middleware([overwrite, restore])
    .server(({ context, next }) => {
      expectTypeOf(context.value).toEqualTypeOf<string>()
      return next()
    })
})

test('server-function middleware builders contribute their lists without executing a handler', () => {
  const factory = moduleServerFn().middleware([overwrite])
  moduleServerFn()
    .middleware([factory, restore, reader])
    .handler(({ context }) => {
      expectTypeOf(context.value).toEqualTypeOf<string>()
      return context.value
    })
})
