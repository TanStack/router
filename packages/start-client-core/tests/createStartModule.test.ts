import { expect, test } from 'vitest'
import { createSerializationAdapter } from '@tanstack/router-core'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { createMiddleware } from '../src/createMiddleware'
import { executeMiddleware, flattenMiddlewares } from '../src/createServerFn'
import { createStart } from '../src/createStart'
import { createStartModule } from '../src/createStartModule'

const decimal = createSerializationAdapter({
  key: 'decimal',
  test: (value): value is { decimal: string } =>
    typeof value === 'object' && value !== null && 'decimal' in value,
  toSerializable: (value) => value.decimal,
  fromSerializable: (value) => ({ decimal: value }),
})
const money = createSerializationAdapter({
  key: 'money',
  extends: [decimal],
  test: (value): value is { money: string } =>
    typeof value === 'object' && value !== null && 'money' in value,
  toSerializable: (value) => value.money,
  fromSerializable: (value) => ({ money: value }),
})

const auth = createMiddleware().server(({ next }) =>
  next({ context: { userId: 'u1' } }),
)
const productsLogging = createMiddleware({ type: 'function' }).server(
  ({ next }) => next(),
)
const accountAudit = createMiddleware({ type: 'function' }).server(({ next }) =>
  next(),
)
const appLogging = createMiddleware({ type: 'function' }).server(({ next }) =>
  next(),
)

const products = createStartModule('@acme/products')(() => ({
  serializationAdapters: [decimal],
  functionMiddleware: [productsLogging],
}))
const account = createStartModule('@acme/account')(() => ({
  serializationAdapters: [money],
  functionMiddleware: [accountAudit, productsLogging],
}))

test('createStartModule binds the module id', () => {
  expect(products.id).toBe('@acme/products')
  expect(products.getOptions().functionMiddleware).toEqual([productsLogging])
})

test('createStart installs the contributions of route modules after its own', () => {
  const options = createStart(() => ({
    extends: [products, account],
    requestMiddleware: [auth],
    functionMiddleware: [appLogging],
  })).getOptions() as any

  expect(flattenMiddlewares(options.requestMiddleware)).toEqual([auth])
  expect(flattenMiddlewares(options.functionMiddleware)).toEqual([
    appLogging,
    productsLogging,
    accountAudit,
  ])
  expect(options.serializationAdapters).toEqual([decimal, money])
})

test('createStart installs a module that several modules include once', () => {
  let calls = 0
  const shared = createStartModule('@acme/shared')(() => {
    calls++
    return { functionMiddleware: [productsLogging] }
  })
  const options = createStart(() => ({
    extends: [shared, products, shared],
  })).getOptions() as any

  expect(calls).toBe(1)
  expect(flattenMiddlewares(options.functionMiddleware)).toEqual([
    productsLogging,
  ])
})

test('the application can place a module contribution itself', () => {
  const options = createStart(() => ({
    extends: [products],
    functionMiddleware: [productsLogging, appLogging],
  })).getOptions() as any

  expect(flattenMiddlewares(options.functionMiddleware)).toEqual([
    productsLogging,
    appLogging,
  ])
})

test('an installed contribution placed earlier executes once in the middleware pipeline', async () => {
  const calls: Array<string> = []
  const audit = createMiddleware({ type: 'function' }).server(({ next }) => {
    calls.push('audit')
    return next()
  })
  const following = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      calls.push('following')
      return next()
    },
  )
  const fragment = createStartModule('@acme/audit')(() => ({
    functionMiddleware: [audit],
  }))
  const options = await createStart(() => ({
    extends: [fragment],
    functionMiddleware: [audit, following],
  })).getOptions()

  await runWithStartContext(
    {
      getRouter() {
        throw new Error('This middleware does not use the router')
      },
      request: new Request('http://localhost/'),
      startOptions: options,
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
    },
    () =>
      executeMiddleware([], 'server', {
        method: 'POST',
        data: undefined,
        headers: {},
        context: {},
        sendContext: {},
        serverFnMeta: { id: 'audit' },
        signal: new AbortController().signal,
      }),
  )
  expect(calls).toEqual(['audit', 'following'])
})

test('createStart installs route modules from an asynchronous factory', async () => {
  const options = await createStart(async () => ({
    extends: [account],
  })).getOptions()

  expect(flattenMiddlewares(options.functionMiddleware as any)).toEqual([
    accountAudit,
    productsLogging,
  ])
  expect(options.serializationAdapters).toEqual([money, decimal])
})

test('repeated getOptions calls do not accumulate module entries', async () => {
  // A fragment that creates its entries on every call, like inline middleware.
  const inline = createStartModule('@acme/inline')(() => ({
    functionMiddleware: [
      createMiddleware({ type: 'function' }).server(({ next }) => next()),
    ],
  }))
  const options = { extends: [inline], requestMiddleware: [auth] }
  const reused = createStart(() => options)
  const cached = Promise.resolve({ ...options })
  const cachedInstance = createStart(() => cached)

  for (let call = 0; call < 3; call++) {
    const fromObject = reused.getOptions() as any
    const fromPromise = (await cachedInstance.getOptions()) as any
    for (const result of [fromObject, fromPromise]) {
      expect(result.requestMiddleware).toHaveLength(1)
      expect(result.functionMiddleware).toHaveLength(1)
    }
  }
  expect(options.requestMiddleware).toEqual([auth])
  expect(options).not.toHaveProperty('functionMiddleware')
})
