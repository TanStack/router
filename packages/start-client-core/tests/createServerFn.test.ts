import { afterEach, describe, expect, test, vi } from 'vitest'
import { TSS_SERVER_FUNCTION } from '../src/constants'
import { createMiddleware } from '../src/createMiddleware'
import { createServerFn } from '../src/createServerFn'

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

describe('a server function the compiler missed', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // The compiled client passes the RPC, marked as a server function
  const compiledRpc = Object.assign(async () => undefined, {
    [TSS_SERVER_FUNCTION]: true,
  })
  const handler = async () => 'secret'

  function defineServerFn(rpc: unknown) {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(createServerFn().handler as (...args: Array<unknown>) => unknown)(rpc)
    return error
  }

  test('is reported in the browser in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(defineServerFn(handler)).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(
        'createServerFn().handler() was not compiled, so its server code shipped to the client',
      ),
    )
  })

  test('a compiled server function is not reported', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(defineServerFn(compiledRpc)).not.toHaveBeenCalled()
  })

  test.each(['production', 'test'])(
    'is not reported when NODE_ENV is %s',
    (env) => {
      vi.stubEnv('NODE_ENV', env)
      expect(defineServerFn(handler)).not.toHaveBeenCalled()
    },
  )

  test('is not reported on the server', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubGlobal('window', undefined)
    expect(defineServerFn(handler)).not.toHaveBeenCalled()
  })
})
