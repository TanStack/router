import { describe, expect, test } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { createMiddleware } from '../src/createMiddleware'
import { createServerFn, flattenMiddlewares } from '../src/createServerFn'

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

describe('client-side throws', () => {
  function runOnClient<T>(fn: () => Promise<T>) {
    return runWithStartContext(
      {
        getRouter() {
          throw new Error('Client middleware does not need a router')
        },
        request: new Request('http://localhost/'),
        startOptions: {},
        contextAfterGlobalMiddlewares: {},
        executedRequestMiddlewares: new Set(),
        handlerType: 'serverFn',
      },
      fn,
    )
  }

  test.each([undefined, null, 0, '', false])(
    'rejects when client middleware throws %s',
    async (value) => {
      let fetched = false
      const extractedFn = Object.assign(
        async () => {
          fetched = true
          return { result: 'fetched' }
        },
        {
          url: '/_serverFn/client-throw',
          serverFnMeta: { id: 'client-throw' },
        },
      )
      const fn = (
        createServerFn().middleware([
          createMiddleware({ type: 'function' }).client(() => {
            throw value
          }),
        ]).handler as unknown as (
          extractedFn: unknown,
        ) => () => Promise<unknown>
      )(extractedFn)

      const outcome = await runOnClient(() =>
        fn().then(
          (resolved) => ({ resolved }),
          (rejected: unknown) => ({ rejected }),
        ),
      )

      expect(outcome).toStrictEqual({ rejected: value })
      expect(fetched).toBe(false)
    },
  )
})

describe('flattenMiddlewares', () => {
  const inner = createMiddleware({ type: 'function' })
  const middle = createMiddleware({ type: 'function' }).middleware([inner])
  const outer = createMiddleware({ type: 'function' }).middleware([
    inner,
    middle,
  ])
  const sibling = createMiddleware({ type: 'function' })
  const names = new Map<unknown, string>([
    [inner, 'inner'],
    [middle, 'middle'],
    [outer, 'outer'],
    [sibling, 'sibling'],
  ])
  const nameAll = (middlewares: Array<unknown>) =>
    middlewares.map((middleware) => names.get(middleware))

  test('lists nested middleware before its parent and keeps first occurrences', () => {
    expect(nameAll(flattenMiddlewares([outer, sibling, middle]))).toEqual([
      'inner',
      'middle',
      'outer',
      'sibling',
    ])
  })

  test('skips middleware in the seen set but still lists its children', () => {
    expect(
      nameAll(
        flattenMiddlewares([outer, sibling], undefined, new Set([middle])),
      ),
    ).toEqual(['inner', 'outer', 'sibling'])
  })

  test('throws for nesting deeper than the limit', () => {
    const looped = createMiddleware({ type: 'function' })
    looped.middleware([looped])

    expect(() => flattenMiddlewares([looped], 3)).toThrow(
      'Middleware nesting depth exceeded maximum of 3. Check for circular references.',
    )
  })
})
