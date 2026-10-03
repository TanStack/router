import { expect, test, vi } from 'vitest'
import { createMiddleware } from '../src/createMiddleware'
import { createServerFn, executeMiddleware } from '../src/createServerFn'

vi.mock('../src/getStartOptions', () => ({ getStartOptions: () => undefined }))
vi.mock('../src/getStartContextServerOnly', () => ({
  getStartContextServerOnly: () => undefined,
}))

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

test('request middleware slot validators are not run as server function validators', async () => {
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: () => ({ issues: [{ message: 'must not run' }] }),
    },
  }
  const middleware = createMiddleware({ type: 'request' })
    .validator({ query: schema })
    .server(({ next }) => next())

  const result = await executeMiddleware([middleware], 'server', {
    method: 'POST',
    data: { input: 1 },
    context: {},
  } as any)

  expect(result.error).toBeUndefined()
  expect(result.data).toEqual({ input: 1 })
})
