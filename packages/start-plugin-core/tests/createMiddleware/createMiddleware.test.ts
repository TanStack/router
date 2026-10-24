import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callOnServer,
  compileError,
  expectCompileError,
  inPage,
  serveCase,
  useStartHost,
} from '../regression-helpers'
import { clientMiddleware, clientMiddlewareOf } from '../page-values'

/** A third-party library the middlewares below import (a real package). */
const someLib = {
  'node_modules/@some/lib/package.json': JSON.stringify({
    name: '@some/lib',
    type: 'module',
    main: './index.js',
  }),
  'node_modules/@some/lib/index.js': `export const foo = () => 'foo'\n`,
}

const host = useStartHost({ files: someLib })

describe('createMiddleware compiles correctly', () => {
  // Malformed-input diagnostic control (SPEC §8, G5): `.validator()`
  // without a validator is a type error (tsc against the real declarations:
  // TS2554 "Expected 1 arguments, but got 0"). It only has to fail.
  test('requires an argument for validator()', async () => {
    const source = `import { createMiddleware } from '@tanstack/react-start'
const myMiddleware = createMiddleware({ type: 'function' })
  .validator()
  .server(async ({ next }) => next())`
    const startCase = await (await host()).case({ 'module.tsx': source })
    const error = await compileError(startCase)
    expectCompileError(error, { source, at: undefined })
  })

  test('keeps a middleware without a server function on the client', async () => {
    const code = `import { createMiddleware } from '@tanstack/react-start'
export const logger = createMiddleware({ type: 'function' }).client(
  async ({ next }) => next(),
)`
    const served = await serveCase(await host(), { 'module.tsx': code })
    expect(
      await inPage(served, 'return typeof module.logger.options.client'),
    ).toBe('function')
  })
})

// The client keeps what a middleware runs in the browser (`.client()`, the
// chain itself) and drops its server part: `.server()`, `.validator()` (the
// validator only runs on the server) and the code and imports only they
// read.
// Replaces the former snapshot fixtures of this directory (N3).
describe('the client keeps the browser part of a middleware', () => {
  /** A case of `code` (and `files`), which every environment serves. */
  async function evaluateClient(
    code: string,
    files: Record<string, string> = {},
  ) {
    return serveCase(await host(), { 'module.tsx': code, ...files })
  }

  // Source: snapshot fixture create-function-middleware.ts
  test('a function middleware keeps .client() and drops .server() and its imports', async () => {
    const served =
      await evaluateClient(`import { createMiddleware } from '@tanstack/react-start'
import { foo } from '@some/lib'
export const fnMw = createMiddleware({ type: 'function' })
  .client(() => 'client')
  .server(({ next }) => {
    foo()
    return next()
  })`)
    expectNotLoaded(await served.loads(), ['@some/lib'])
    expect(
      await inPage(
        served,
        `return [module.fnMw.options.type, module.fnMw.options.client(), module.fnMw.options.server === undefined]`,
      ),
    ).toEqual(['function', 'client', true])
  })

  // Source: snapshot fixtures createMiddlewareDestructured.tsx,
  // createMiddlewareDestructuredRename.tsx, createMiddlewareStarImport.tsx
  test('.server() given a function expression, an arrow, an identifier or a wrapper call leaves no server code or import in the client', async () => {
    const served =
      await evaluateClient(`import { createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
export const withFunction = createMiddleware({ type: 'function' })
  .client(() => 'function')
  .server(async function () {
    return z.number()
  })
export const withArrow = createMiddleware({ type: 'function' })
  .client(() => 'arrow')
  .server(async () => z.number())
export const withVariable = createMiddleware({ type: 'function' })
  .client(() => 'variable')
  .server(abstractedFunction)
async function abstractedFunction() {
  return z.number()
}
function zodValidator(schema: unknown, fn: (input: unknown) => unknown) {
  return async (input: unknown) => fn([schema, input])
}
export const withWrapper = createMiddleware({ type: 'function' })
  .client(() => 'wrapper')
  .server(zodValidator(z.number(), (input) => ({ 'you gave': input })))`)
    // What the dead helpers are called is free (SPEC §5.9): the client
    // loading no server-only module is the check.
    expectNotLoaded(await served.loads(), ['zod'])
    expect(
      await inPage(
        served,
        `return ['withFunction', 'withArrow', 'withVariable', 'withWrapper'].map((name) => [
  module[name].options.client(),
  module[name].options.server === undefined,
])`,
      ),
    ).toEqual([
      ['function', true],
      ['arrow', true],
      ['variable', true],
      ['wrapper', true],
    ])
  })

  // Source: snapshot fixture createMiddlewareValidator.tsx, inline snapshot
  // "should compile validator method" (gap MW2)
  test('the validator and its module leave the client', async () => {
    const served =
      await evaluateClient(`import { createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
export const withValidator = createMiddleware({ type: 'function' })
  .validator(z.number())
  .client(() => 'client')
  .server(({ data, next }) => next({ context: { value: data + 1 } }))`)
    expectNotLoaded(await served.loads(), ['zod'])
    expect(
      await inPage(
        served,
        `const { options } = module.withValidator
return [options.validator === undefined, options.server === undefined, options.client()]`,
      ),
    ).toEqual([true, true, 'client'])
  })

  // Source: snapshot fixture middleware-factory.ts
  test('a middleware built inside a function drops .server() and what it reads', async () => {
    const served = await evaluateClient(
      `import { createMiddleware } from '@tanstack/react-start'
import { rateLimit, getUser } from './auth.server'
export function createPublicRateLimitMiddleware(keySuffix) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    await rateLimit({ key: keySuffix })
    return next()
  })
}
export const createAuthMiddleware = (requiredRole) => {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const user = await getUser()
    if (user.role !== requiredRole) {
      throw new Error('Forbidden')
    }
    return next()
  })
}
export const topLevelMiddleware = createMiddleware({ type: 'function' })
  .client(() => 'topLevel')
  .server(async ({ next }) => next())`,
      {
        'auth.server.ts': `export const rateLimit = async (options: unknown) => options
export const getUser = async () => ({ role: 'admin' })
`,
      },
    )
    expectNotLoaded(await served.loads(), ['./auth.server'])
    expect(
      await inPage(
        served,
        `return [
  ${clientMiddlewareOf(`module.createPublicRateLimitMiddleware('ip')`)},
  ${clientMiddlewareOf(`module.createAuthMiddleware('admin')`)},
  module.topLevelMiddleware.options.client(),
  module.topLevelMiddleware.options.server === undefined,
]`,
      ),
    ).toEqual([
      clientMiddleware('function'),
      clientMiddleware('function'),
      'topLevel',
      true,
    ])
  })

  // Source: snapshot fixture createStart.tsx (gap MW5)
  test('middleware of a createStart instance keeps .client() and drops .server()', async () => {
    const served = await evaluateClient(
      `import { createStart } from '@tanstack/react-start'
import { audit } from './audit.server'
export const startInstance = createStart(() => ({}))
export const serverFnMw = startInstance
  .createMiddleware({ type: 'function' })
  .client(({ next }) => next())
  .server(({ next }) => {
    audit('function')
    return next({ context: { admin: 'admin' } })
  })
export const requestMw = startInstance
  .createMiddleware({ type: 'request' })
  .server(({ next }) => {
    audit('request')
    return next({ context: { requestMw: 'yes' } })
  })`,
      { 'audit.server.ts': `export const audit = (kind: string) => kind\n` },
    )
    expectNotLoaded(await served.loads(), ['./audit.server'])
    expect(
      await inPage(
        served,
        `return [
  typeof module.serverFnMw.options.client,
  module.serverFnMw.options.server === undefined,
  ${clientMiddlewareOf('module.requestMw')},
]`,
      ),
    ).toEqual(['function', true, clientMiddleware('request')])
  })
})

// Start's own CSRF middleware factory is an isomorphic fn whose server
// implementation builds a middleware (`createMiddleware().server()` in
// Start's built package): an app's client gets the no-op of an isomorphic
// fn without a client implementation, its server a request middleware.
test("Start's createCsrfMiddleware is a no-op in the client and a request middleware on the server", async () => {
  const served = await serveCase(await host(), {
    'module.tsx': `import { createCsrfMiddleware } from '@tanstack/react-start'
export const csrf = createCsrfMiddleware()`,
  })
  expect(await inPage(served, 'return module.csrf === undefined')).toBe(true)
  const { csrf } = await served.ssr()
  expect([csrf.options.type, typeof csrf.options.server]).toEqual([
    'request',
    'function',
  ])
})

// A valid full chain (`.middleware().validator().client().server()`) of a
// middleware a server fn uses, run through Start's runtime: the client runs
// `.client()` (its send context reaches the server) and ships no server
// code; on the server, a call from server code and a client call by id run
// the validator, `.server()` and the handler, with the context `.server()`
// adds.
test('a full middleware chain runs its client part on the client and its server part on the server', async () => {
  const served = await serveCase(await host(), {
    'module.tsx': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
import { check } from './check.server'
const base = createMiddleware({ type: 'function' }).client(({ next }) =>
  next({ sendContext: { base: 'base' } }),
)
export const auth = createMiddleware({ type: 'function' })
  .middleware([base])
  .validator((data: string) => check(data))
  .client(({ next }) => next({ sendContext: { from: 'client' } }))
  .server(async ({ next, context }) =>
    next({ context: { user: db.user(context.from) } }),
  )
export const fn = createServerFn({ method: 'POST' })
  .middleware([auth])
  .handler(async ({ data, context }) => [data, context.user, context.base])`,
    'db.server.ts': `export const db = { user: (from: string) => \`user(\${from})\` }\n`,
    'check.server.ts': `export const check = (data: string) => \`checked(\${data})\`\n`,
  })
  expectNotLoaded(await served.loads(), ['./db.server', './check.server'])
  expect(served.code.client).not.toMatch(/db\.user|check\(/)
  const expected = ['checked(input)', 'user(client)', 'base']
  expect(await callFromClient(served, 'module.fn', 'input')).toEqual(expected)
  // Server code calling the server fn gets the same result.
  expect(await callOnServer(served, 'module.fn', 'input')).toEqual(expected)
})
