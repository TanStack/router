import { expectTypeOf, test } from 'vitest'
import { createServerFn } from '../createServerFn'
import { mockServerFn } from '../testing/index'
import type { ServerFnMockContext } from '../testing/index'

const getUser = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(({ data }) => ({ id: data.id, age: data.id.length }))

const getTime = createServerFn().handler(() => Date.now())

const search = createServerFn()
  .validator((input?: { query: string }) => input)
  .handler(({ data }) => data?.query.split(' ') ?? [])

test('a mock gets the data the server function is called with', () => {
  mockServerFn(getUser, (ctx) => {
    expectTypeOf(ctx).toEqualTypeOf<ServerFnMockContext<{ id: string }>>()
    expectTypeOf(ctx.data).toEqualTypeOf<{ id: string }>()
    expectTypeOf(ctx.method).toEqualTypeOf<'GET' | 'POST'>()
    expectTypeOf(ctx.headers).toEqualTypeOf<Headers>()
    expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal | undefined>()
    return { id: ctx.data.id, age: 1 }
  })
})

test('a mock of a server function without input gets no data', () => {
  mockServerFn(getTime, ({ data }) => {
    expectTypeOf(data).toEqualTypeOf<undefined>()
    return 0
  })
})

test('a mock of a server function with optional input may get no data', () => {
  mockServerFn(search, ({ data }) => {
    expectTypeOf(data).toEqualTypeOf<{ query: string } | undefined>()
    return []
  })
})

test('a mock returns what the handler returns, now or later', () => {
  mockServerFn(getUser, () => ({ id: 'a', age: 1 }))
  mockServerFn(getUser, async () => ({ id: 'a', age: 1 }))

  // @ts-expect-error the handler returns an object
  mockServerFn(getUser, () => 'a')
  // @ts-expect-error the age of the handler's object is a number
  mockServerFn(getUser, async () => ({ id: 'a', age: 'old' }))
  // @ts-expect-error the handler returns a number
  mockServerFn(getTime, () => 'now')
})

test('only a server function can be mocked', () => {
  const plain = async (options: { data: string }) => options.data

  // @ts-expect-error a plain function is no server function
  mockServerFn(plain, () => '')
})
