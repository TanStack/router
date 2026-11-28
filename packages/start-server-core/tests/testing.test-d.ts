import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '@tanstack/start-client-core'
import { mockMiddleware, runInRequest, runMiddleware } from '../src/testing'
import type {
  FunctionMiddlewareRun,
  MiddlewareMockResult,
  RequestMiddlewareRun,
} from '../src/testing'

// The functions below are only type-checked. This file also runs as a test
// file, and nothing in it may call the harness.

const auth = createMiddleware({ type: 'function' })
  .validator((input: { token: string }) => input)
  .server(({ next }) => next({ context: { user: { name: 'Ada' } } }))

const greeting = createMiddleware({ type: 'function' })
  .middleware([auth])
  .server(({ next, context }) =>
    next({ context: { greeting: `Hello ${context.user.name}` } }),
  )

const logging = createMiddleware({ type: 'function' }).server(({ next }) =>
  next(),
)

const tenant = createMiddleware().server(({ next }) =>
  next({ context: { tenant: 'acme' } }),
)

function checkRunInRequest() {
  expectTypeOf(runInRequest(() => 5)).toEqualTypeOf<Promise<number>>()
  expectTypeOf(runInRequest(async () => 'a')).toEqualTypeOf<Promise<string>>()
  expectTypeOf(
    runInRequest({ url: '/posts', headers: { cookie: 'a=b' } }, async () => ({
      ok: true,
    })),
  ).toEqualTypeOf<Promise<{ ok: boolean }>>()

  void runInRequest({ request: new Request('http://localhost/') }, () => {})
  void runInRequest({ globalMiddleware: 'skip' }, () => {})

  void runInRequest(
    // @ts-expect-error a Request already has a URL
    { request: new Request('http://localhost/'), url: '/posts' },
    () => {},
  )
  // @ts-expect-error the only value is 'skip'
  void runInRequest({ globalMiddleware: 'run' }, () => {})
  // @ts-expect-error the callback is missing
  void runInRequest({ url: '/posts' })
}

function checkMockOfFunctionMiddleware() {
  mockMiddleware(auth, ({ data, context, method, next }) => {
    expectTypeOf(data).toEqualTypeOf<{ token: string }>()
    expectTypeOf(context).toEqualTypeOf<undefined>()
    expectTypeOf(method).toEqualTypeOf<'GET' | 'POST'>()
    expectTypeOf(next).returns.toEqualTypeOf<Promise<MiddlewareMockResult>>()
    return next({ context: { user: { name: 'Grace' } } })
  })
  mockMiddleware(auth, async ({ next }) =>
    next({ context: { user: { name: 'Grace' } } }),
  )
  mockMiddleware(auth, () => {
    throw new Error('not signed in')
  })

  // @ts-expect-error the middleware passes a user on, so the mock has to
  mockMiddleware(auth, ({ next }) => next())
  mockMiddleware(auth, ({ next }) =>
    // @ts-expect-error the name of the user is a string
    next({ context: { user: { name: 5 } } }),
  )
  // @ts-expect-error a mock returns the result of next()
  mockMiddleware(auth, () => undefined)
  // @ts-expect-error a function middleware cannot answer with a response
  mockMiddleware(auth, () => new Response(null))
}

function checkMockSeesTheContextBeforeTheMiddleware() {
  mockMiddleware(greeting, ({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<{ user: { name: string } }>()
    return next({ context: { greeting: 'Hi' } })
  })
  mockMiddleware(logging, ({ next }) => next())
}

// The client function of a mocked middleware does not run, so what it sends
// to the server is not in the context of the mock.
const withToken = createMiddleware({ type: 'function' })
  .middleware([auth])
  .client(({ next }) => next({ sendContext: { token: 'from the client' } }))
  .server(({ next }) => next())

function checkMockContextWithoutOwnClientContext() {
  mockMiddleware(withToken, ({ context, next }) => {
    // (what the middleware before it passes on is still there)
    expectTypeOf(context.user).toEqualTypeOf<{ name: string }>()
    // @ts-expect-error the client function that sends the token does not run
    void context.token
    return next()
  })
}

function checkMockOfRequestMiddleware() {
  mockMiddleware(tenant, ({ request, pathname, handlerType, next }) => {
    expectTypeOf(request).toEqualTypeOf<Request>()
    expectTypeOf(pathname).toEqualTypeOf<string>()
    expectTypeOf(handlerType).toEqualTypeOf<'serverFn' | 'router'>()
    return next({ context: { tenant: 'other' } })
  })
  mockMiddleware(tenant, () => new Response(null, { status: 401 }))

  // @ts-expect-error the middleware passes a tenant on, so the mock has to
  mockMiddleware(tenant, ({ next }) => next())
}

function checkOnlyMiddlewareCanBeMocked() {
  const plain = () => {}

  // @ts-expect-error a plain function is no middleware
  mockMiddleware(plain, () => new Response(null))
}

async function checkRunOfFunctionMiddleware() {
  const run = await runMiddleware(
    auth,
    { data: { token: 'abc' } },
    ({ context }) => {
      expectTypeOf(context).toEqualTypeOf<{ user: { name: string } }>()
      return 5
    },
  )
  expectTypeOf(run).toExtend<FunctionMiddlewareRun<typeof auth, number>>()
  expectTypeOf(run.result).toEqualTypeOf<number>()
  expectTypeOf(run.context).toEqualTypeOf<{ user: { name: string } }>()

  const asyncNext = await runMiddleware(
    auth,
    { data: { token: 'abc' } },
    async () => 'later',
  )
  expectTypeOf(asyncNext.result).toEqualTypeOf<string>()

  const withoutNext = await runMiddleware(logging, {})
  expectTypeOf(withoutNext.result).toEqualTypeOf<undefined>()

  // @ts-expect-error the middleware validates data, so it gets data
  void runMiddleware(auth, {})
  // @ts-expect-error the token is a string
  void runMiddleware(auth, { data: { token: 5 } })
}

async function checkRunNeedsTheContextOfTheMiddlewareBefore() {
  const run = await runMiddleware(greeting, {
    data: { token: 'abc' },
    context: { user: { name: 'Ada' } },
  })
  expectTypeOf(run.context).toEqualTypeOf<{
    user: { name: string }
    greeting: string
  }>()

  // @ts-expect-error `auth` runs before it and passes a user on
  void runMiddleware(greeting, { data: { token: 'abc' } })
}

async function checkRunOfRequestMiddleware() {
  const run = await runMiddleware(
    tenant,
    { handlerType: 'serverFn' },
    ({ context, request, pathname }) => {
      expectTypeOf(context).toEqualTypeOf<{ tenant: string }>()
      expectTypeOf(request).toEqualTypeOf<Request>()
      expectTypeOf(pathname).toEqualTypeOf<string>()
      return new Response('page')
    },
  )
  expectTypeOf(run).toEqualTypeOf<RequestMiddlewareRun<typeof tenant>>()
  expectTypeOf(run.response).toEqualTypeOf<Response>()
  expectTypeOf(run.context).toEqualTypeOf<{ tenant: string }>()

  void runMiddleware(tenant, {}, () => {})
  // @ts-expect-error the rest of a request answers with a response
  void runMiddleware(tenant, {}, () => 'page')
  // @ts-expect-error a request middleware gets no data
  void runMiddleware(tenant, { data: 'x' })
}

test('runInRequest resolves to what the callback returns', () => {
  expectTypeOf(checkRunInRequest).toBeFunction()
})

test('a mock is typed from the middleware it replaces', () => {
  expectTypeOf(checkMockOfFunctionMiddleware).toBeFunction()
  expectTypeOf(checkMockSeesTheContextBeforeTheMiddleware).toBeFunction()
  expectTypeOf(checkMockOfRequestMiddleware).toBeFunction()
  expectTypeOf(checkMockContextWithoutOwnClientContext).toBeFunction()
  expectTypeOf(checkOnlyMiddlewareCanBeMocked).toBeFunction()
})

test('runMiddleware types the input and the outcome from the middleware', () => {
  expectTypeOf(checkRunOfFunctionMiddleware).toBeFunction()
  expectTypeOf(checkRunNeedsTheContextOfTheMiddlewareBefore).toBeFunction()
  expectTypeOf(checkRunOfRequestMiddleware).toBeFunction()
})
