// @vitest-environment node

import { describe, expect, test } from 'vitest'
import { toCrossJSONAsync } from 'seroval'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { createClientRpc } from '../src/client-rpc/createClientRpc'
import { ServerFunctionSerializationAdapter } from '../src/client/ServerFunctionSerializationAdapter'
import { X_TSS_SERIALIZED } from '../src/constants'
import { createMiddleware } from '../src/createMiddleware'
import { createServerFn, executeMiddleware } from '../src/createServerFn'

test.each([
  ['returns the result', 'returned result', false],
  ['rejects a failure', 'failure', true],
  ['rejects a falsy thrown value', false, true],
] as const)('deserialized callback %s', async (_name, value, fails) => {
  const callback = ServerFunctionSerializationAdapter.fromSerializable({
    functionId: 'test',
  }) as unknown as ReturnType<typeof createClientRpc>
  const middleware = createMiddleware({ type: 'function' }).server(
    async ({ next }) => {
      if (fails) {
        throw value
      }
      return { ...(await next()), result: value }
    },
  )

  await runWithStartContext(
    {
      request: new Request('http://localhost/_serverFn/test'),
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
      getRouter: () => {
        throw new Error('This server function does not use a router')
      },
    },
    async () => {
      const result = callback({
        method: 'POST',
        fetch: async () =>
          Response.json(
            await toCrossJSONAsync(
              await executeMiddleware([middleware], 'server', {
                method: 'POST',
                context: {},
                data: undefined,
              }),
            ),
            { headers: { [X_TSS_SERIALIZED]: 'true' } },
          ),
      })
      if (fails) {
        await expect(result).rejects.toBe(value)
      } else {
        await expect(result).resolves.toBe(value)
      }
    },
  )
})

describe.each(['client', 'server'] as const)('%s middleware', (env) => {
  test.each(
    [undefined, null, false, 0, '', 'truthy error'].flatMap((value) =>
      ['throws', 'rejects', 'returns error', 'propagates', 'recovers'].map(
        (mode) => ({
          name: `${mode} ${JSON.stringify(value) ?? 'undefined'}`,
          mode,
          value,
        }),
      ),
    ),
  )('$name', async ({ mode, value }) => {
    const middlewareFn = async ({ next, ...ctx }: any) => {
      if (mode === 'throws') {
        throw value
      }
      if (mode === 'rejects') {
        return Promise.reject(value)
      }
      if (mode === 'returns error') {
        return { ...(await next()), error: value }
      }
      if (mode === 'recovers') {
        try {
          return await next()
        } catch {
          return { ...ctx, result: 'recovered', error: undefined }
        }
      }
      return { ...(await next()), error: undefined }
    }
    const middleware = createMiddleware({ type: 'function' })
      .client(middlewareFn)
      .server(middlewareFn)
    const downstream = createMiddleware({ type: 'function' }).server(
      async ({ next }) => {
        if (mode === 'propagates' || mode === 'recovers') {
          throw value
        }
        return { ...(await next()), result: 'returned result' }
      },
    )
    const fn = createServerFn({ method: 'POST' })
      .middleware(env === 'client' ? [middleware] : [])
      .handler(createClientRpc('test'))

    await runWithStartContext(
      {
        request: new Request('http://localhost/_serverFn/test'),
        startOptions: {},
        contextAfterGlobalMiddlewares: {},
        executedRequestMiddlewares: new Set(),
        handlerType: 'serverFn',
        getRouter: () => {
          throw new Error('This server function does not use a router')
        },
      },
      async () => {
        const result = fn({
          fetch: async () => {
            if (
              env === 'client' &&
              (mode === 'propagates' || mode === 'recovers')
            ) {
              return Promise.reject(value)
            }
            return Response.json(
              await toCrossJSONAsync(
                await executeMiddleware(
                  env === 'server' ? [middleware, downstream] : [downstream],
                  'server',
                  { method: 'POST', context: {}, data: undefined },
                ),
              ),
              { headers: { [X_TSS_SERIALIZED]: 'true' } },
            )
          },
        })
        if (mode === 'recovers') {
          await expect(result).resolves.toBe('recovered')
        } else if (mode === 'returns error' && !value) {
          await expect(result).resolves.toBe('returned result')
        } else {
          await expect(result).rejects.toBe(value)
        }
      },
    )
  })
})

test('appends factory middleware in order without changing source builders', () => {
  const first = createMiddleware({ type: 'function' })
  const second = createMiddleware({ type: 'function' })
  const third = createMiddleware({ type: 'function' })
  const factory = createServerFn().middleware([second])
  const base = createServerFn({ method: 'POST' }).middleware([first])
  const middlewares = Object.freeze([factory, third, second])

  const combined = base.middleware(middlewares)

  expect(combined.options.middleware).toEqual([first, second, third, second])
  expect(combined.options.method).toBe('POST')
  expect(base.options.middleware).toEqual([first])
  expect(factory.options.middleware).toEqual([second])
  expect(middlewares).toEqual([factory, third, second])
  expect(combined.middleware([]).options.middleware).toEqual([
    first,
    second,
    third,
    second,
  ])
})

test('ignores empty slots in a middleware array', () => {
  const middleware = createMiddleware({ type: 'function' })
  const middlewares: Array<typeof middleware> = []
  middlewares[1] = middleware

  expect(createServerFn().middleware(middlewares).options.middleware).toEqual([
    middleware,
  ])
  expect(0 in middlewares).toBe(false)
})

test('does not register middleware appended while reading the input', () => {
  const first = createMiddleware({ type: 'function' })
  const second = createMiddleware({ type: 'function' })
  const middlewares = [first]
  Object.defineProperty(middlewares, 0, {
    get() {
      middlewares.push(second)
      return first
    },
  })

  expect(createServerFn().middleware(middlewares).options.middleware).toEqual([
    first,
  ])
  expect(middlewares).toHaveLength(2)
})
