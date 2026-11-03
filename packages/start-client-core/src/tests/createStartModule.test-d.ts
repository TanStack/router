import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createServerFn } from '../createServerFn'
import { createStart } from '../createStart'
import { createStartModule } from '../createStartModule'
import type { CreateMiddlewareFn } from '../createMiddleware'
import type { CreateServerFn } from '../createServerFn'
import type {
  StartModuleConfig,
  StartModuleRegister,
  ValidateStartModules,
} from '../createStartModule'

declare module '../createStartModule' {
  interface StartModuleRequirements {
    '@review/products': {
      requestContext: { userId: string }
      functionContext: { locale: string }
    }
    '@review/reader': { requestContext: { value: string } }
    '@review/numeric': { requestContext: { value: number } }
    '@review/function-only': { functionContext: { value: string } }
    '@review/requirement-only': { requestContext: { userId: string } }
    '@review/unused': { requestContext: { unrelated: never } }
  }
}

const createProductsMiddleware =
  createMiddleware as unknown as CreateMiddlewareFn<
    StartModuleRegister<'@review/products'>
  >
const catalog = createProductsMiddleware({ type: 'function' }).server(
  ({ context, next }) => {
    expectTypeOf(context.userId).toEqualTypeOf<string>()
    expectTypeOf(context.locale).toEqualTypeOf<string>()
    return next({ context: { catalog: 'main' } })
  },
)
const products = createStartModule('@review/products')(() => ({
  functionMiddleware: [catalog],
}))
interface ProductsRegister extends StartModuleRegister<'@review/products'> {
  ssr: true
  config: StartModuleConfig<typeof products>
}
const createProductsServerFn =
  createServerFn as unknown as CreateServerFn<ProductsRegister>
const auth = createMiddleware().server(({ next }) => {
  return next({ context: { userId: 'u1' } })
})
const locale = createMiddleware({ type: 'function' }).server(({ next }) => {
  return next({ context: { locale: 'en' } })
})
const value = createMiddleware().server(({ next }) => {
  return next({ context: { value: 'valid' } })
})

test('module context is independent of fragment inference and survives into server functions', () => {
  createProductsMiddleware().server(({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<{ userId: string }>()
    return next()
  })
  createProductsServerFn().handler(({ context }) => {
    expectTypeOf(context.userId).toEqualTypeOf<string>()
    expectTypeOf(context.locale).toEqualTypeOf<string>()
    expectTypeOf(context.catalog).toEqualTypeOf<string>()
  })
})

test('createStart preserves application and fragment types without runtime requirement entries', () => {
  const start = createStart(() => ({
    extends: [products],
    requestMiddleware: [auth],
    functionMiddleware: [locale],
  }))
  type Types = Awaited<ReturnType<typeof start.getOptions>>['~types']
  expectTypeOf<Types['startModules']>().toEqualTypeOf<
    readonly [typeof products]
  >()
  expectTypeOf<Types['ownRequestMiddleware']>().toEqualTypeOf<
    readonly [typeof auth]
  >()
  expectTypeOf<Types['functionMiddleware']>().toEqualTypeOf<
    [typeof locale, typeof catalog]
  >()
  expectTypeOf<
    ValidateStartModules<typeof start, readonly [typeof products]>
  >().toEqualTypeOf<true>()
})

test('an application without route modules retains its middleware inference', () => {
  const start = createStart(() => ({ requestMiddleware: [auth] }))
  type Types = Awaited<ReturnType<typeof start.getOptions>>['~types']
  expectTypeOf<Types['requestMiddleware']>().toEqualTypeOf<
    readonly [typeof auth]
  >()
})

test('request and function requirements are checked independently against host providers', () => {
  const missingRequest = createStart(() => ({
    extends: [products],
    functionMiddleware: [locale],
  }))
  const missingFunction = createStart(() => ({
    extends: [products],
    requestMiddleware: [auth],
  }))
  expectTypeOf<
    ValidateStartModules<typeof missingRequest, [typeof products]>
  >().not.toEqualTypeOf<true>()
  expectTypeOf<
    ValidateStartModules<typeof missingFunction, [typeof products]>
  >().not.toEqualTypeOf<true>()
  const onlyFunctionProvider = createStart(() => ({
    functionMiddleware: [
      createMiddleware({ type: 'function' }).server(({ next }) =>
        next({ context: { value: 'valid' } }),
      ),
    ],
  }))
  expectTypeOf<
    ValidateStartModules<
      typeof onlyFunctionProvider,
      [],
      ['@review/function-only']
    >
  >().toEqualTypeOf<true>()
  expectTypeOf<
    ValidateStartModules<typeof onlyFunctionProvider, [], ['@review/reader']>
  >().not.toEqualTypeOf<true>()
})

test('requirements-only modules need no runtime fragment and unrelated augmentations stay inactive', () => {
  const start = createStart(() => ({ requestMiddleware: [auth] }))
  expectTypeOf<
    ValidateStartModules<typeof start, [], ['@review/requirement-only']>
  >().toEqualTypeOf<true>()
  const missing = createStart(() => ({}))
  expectTypeOf<
    ValidateStartModules<typeof missing, [], ['@review/requirement-only']>
  >().not.toEqualTypeOf<true>()
  expectTypeOf<ValidateStartModules<typeof missing, []>>().toEqualTypeOf<true>()
})

test('all installed contracts remain obligations, including overlapping context keys', () => {
  const start = createStart(() => ({ requestMiddleware: [value] }))
  expectTypeOf<
    ValidateStartModules<
      typeof start,
      [],
      ['@review/reader', '@review/function-only']
    >
  >().toEqualTypeOf<true>()
  expectTypeOf<
    ValidateStartModules<
      typeof start,
      [],
      ['@review/reader', '@review/numeric']
    >
  >().not.toEqualTypeOf<true>()
})

const createReaderMiddleware =
  createMiddleware as unknown as CreateMiddlewareFn<
    StartModuleRegister<'@review/reader'>
  >
const reader = createReaderMiddleware({ type: 'function' }).server(
  ({ context, next }) => {
    expectTypeOf(context.value).toEqualTypeOf<string>()
    return next()
  },
)
const readerModule = createStartModule('@review/reader')(() => ({
  functionMiddleware: [reader],
}))
const overwrite = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { value: 1 } }),
)
const restore = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { value: 'restored', restored: true } }),
)
const overwriteModule = createStartModule('@review/overwrite')(() => ({
  functionMiddleware: [overwrite],
}))
const restoreModule = createStartModule('@review/restore')(() => ({
  functionMiddleware: [restore],
}))

test('request requirements remain valid at function middleware consumers', () => {
  const broken = createStart(() => ({
    requestMiddleware: [value],
    extends: [overwriteModule, readerModule],
  }))
  expectTypeOf<
    ValidateStartModules<
      typeof broken,
      [typeof readerModule],
      ['@review/reader']
    >
  >().not.toEqualTypeOf<true>()
})

test('restoring context before a reader is valid, but restoration after it cannot hide the error', () => {
  const before = createStart(() => ({
    requestMiddleware: [value],
    extends: [overwriteModule, restoreModule, readerModule],
  }))
  const after = createStart(() => ({
    requestMiddleware: [value],
    extends: [overwriteModule, readerModule, restoreModule],
  }))
  expectTypeOf<
    ValidateStartModules<
      typeof before,
      [typeof readerModule],
      ['@review/reader']
    >
  >().toEqualTypeOf<true>()
  expectTypeOf<
    ValidateStartModules<
      typeof after,
      [typeof readerModule],
      ['@review/reader']
    >
  >().not.toEqualTypeOf<true>()
})

test('terminal requirement-only consumers see the completed request and function context', () => {
  const requestOverwrite = createMiddleware().server(({ next }) =>
    next({ context: { value: 1 } }),
  )
  const module = createStartModule('@review/overwrite-request')(() => ({
    requestMiddleware: [requestOverwrite],
  }))
  const brokenRequest = createStart(() => ({
    requestMiddleware: [value],
    extends: [module],
  }))
  const brokenFunction = createStart(() => ({
    requestMiddleware: [value],
    extends: [overwriteModule],
  }))
  expectTypeOf<
    ValidateStartModules<typeof brokenRequest, [], ['@review/reader']>
  >().not.toEqualTypeOf<true>()
  expectTypeOf<
    ValidateStartModules<typeof brokenFunction, [], ['@review/reader']>
  >().not.toEqualTypeOf<true>()
})

test('a module contribution cannot provide an otherwise missing host requirement', () => {
  const provider = createStartModule('@review/provider')(() => ({
    requestMiddleware: [value],
  }))
  const start = createStart(() => ({ extends: [provider, readerModule] }))
  expectTypeOf<
    ValidateStartModules<typeof start, [typeof readerModule]>
  >().not.toEqualTypeOf<true>()
})

test('nested middleware dependencies execute before their consumer', () => {
  const nested = createMiddleware({ type: 'function' })
    .middleware([overwrite, reader])
    // @ts-expect-error nested reader observes the overwritten context
    .server(({ next }) => next())
  const nestedModule = createStartModule('@review/reader')(() => ({
    functionMiddleware: [nested],
  }))
  const start = createStart(() => ({
    requestMiddleware: [value],
    extends: [nestedModule],
  }))
  expectTypeOf<
    ValidateStartModules<typeof start, [typeof nestedModule]>
  >().not.toEqualTypeOf<true>()
})

test('a deduplicated contribution cannot be assumed to restore overwritten context', () => {
  const start = createStart(() => ({
    requestMiddleware: [value],
    functionMiddleware: [restore],
    extends: [overwriteModule, restoreModule, readerModule],
  }))
  expectTypeOf<
    ValidateStartModules<typeof start, [typeof readerModule]>
  >().not.toEqualTypeOf<true>()
  const valid = createStart(() => ({
    requestMiddleware: [value],
    functionMiddleware: [reader],
    extends: [readerModule],
  }))
  expectTypeOf<
    ValidateStartModules<typeof valid, [typeof readerModule]>
  >().toEqualTypeOf<true>()
})

test('widened providers cannot establish required context but safe tuple alternatives can', () => {
  const providers = [auth]
  const uncertain = createStart(() => ({ requestMiddleware: providers }))
  expectTypeOf<
    ValidateStartModules<typeof uncertain, [], ['@review/requirement-only']>
  >().not.toEqualTypeOf<true>()
  const conditional =
    Math.random() > 0.5 ? ([auth] as const) : ([auth, value] as const)
  const safe = createStart(() => ({ requestMiddleware: conditional }))
  expectTypeOf<
    ValidateStartModules<typeof safe, [], ['@review/requirement-only']>
  >().toEqualTypeOf<true>()
})

test('a module fragment only takes module options', () => {
  // @ts-expect-error defaultSsr belongs to the application
  createStartModule('@review/products')(() => ({ defaultSsr: false }))
})

test('many installed fragments preserve context and installation proof', () => {
  type Repeat<
    T,
    TCount extends number,
    TAcc extends Array<unknown> = [],
  > = TAcc['length'] extends TCount ? TAcc : Repeat<T, TCount, [...TAcc, T]>
  type Modules = Repeat<typeof readerModule, 100>
  const modules = Array.from({ length: 100 }, () => readerModule) as Modules
  const start = createStart(() => ({
    requestMiddleware: [value],
    extends: modules,
  }))
  expectTypeOf<
    ValidateStartModules<typeof start, Modules>
  >().toEqualTypeOf<true>()
})
