import { describe, expect, test } from 'vitest'
import { StartCompiler } from '../../src/start-compiler/compiler'
import {
  callFromClient,
  compileAll,
  compileCode,
  createServerGraph,
  createStartCompiler,
  evaluateModule,
  expectCompileError,
  moduleLoads,
  startClientCore,
} from '../regression-helpers'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  declaredNames,
  getModuleErrors,
} from '@tanstack/compiler-test-utils/validate-module'

// Default test options for StartCompiler
function getDefaultTestOptions(env: 'client' | 'server') {
  const envName = env === 'client' ? 'client' : 'ssr'
  return {
    envName,
    root: '/test',
    framework: 'react' as const,
    providerEnvName: 'ssr',
  }
}

/** A Start factory left uncompiled: calling it fails the test. */
const uncompiled = () => {
  throw new Error('uncompiled Start factory')
}

/**
 * Start's own middleware factory module: the real `createMiddleware`, whose
 * builder fails the test when `.server()` is called, so a module evaluates
 * only without it.
 */
const middlewareFactoryStub = {
  createMiddleware: (...args: Array<unknown>) => ({
    ...startClientCore.createMiddleware(...args),
    server: uncompiled,
  }),
}

describe('createMiddleware compiles correctly', () => {
  // Malformed-input diagnostic control (SPEC §8, G5): `.validator()`
  // without a validator is a type error (tsc against the real declarations:
  // TS2554 "Expected 1 arguments, but got 0"). It only has to fail clearly,
  // naming the API.
  test('requires an argument for validator()', async () => {
    const source = `import { createMiddleware } from '@tanstack/react-start'
const myMiddleware = createMiddleware({ type: 'function' })
  .validator()
  .server(async ({ next }) => next())`
    const error = await compileCode('client', source).catch(
      (caught: unknown) => caught,
    )
    expectCompileError(error, { source, at: undefined, names: ['validator'] })
  })

  test('keeps a middleware without a server function on the client', async () => {
    const code = `import { createMiddleware } from '@tanstack/react-start'
export const logger = createMiddleware({ type: 'function' }).client(
  async ({ next }) => next(),
)`
    const { logger } = await evaluateModule(
      (await compileCode('client', code)) ?? code,
    )
    expect(logger.options.client).toBeTypeOf('function')
  })

  test('should resolve createMiddleware from start-client-core implementation file', async () => {
    const virtualModules: Record<string, string> = {
      '@tanstack/start-client-core': `
        export { createMiddleware } from './createMiddleware'
        export { createIsomorphicFn } from '@tanstack/start-fn-stubs'
      `,
      '/virtual/compiler-known/middleware-factory.ts': `
        export const createMiddleware = () => ({
          server: () => createMiddleware(),
        })
      `,
    }

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      loadModule: async (id) => {
        const code = virtualModules[id]
        if (code) {
          compiler.ingestModule({ code, id })
        }
      },
      lookupKinds: new Set(['Middleware', 'IsomorphicFn']),
      lookupConfigurations: [],
      getKnownServerFns: () => ({}),
      resolveId: async (source) => {
        if (source === '@tanstack/start-client-core') {
          return '@tanstack/start-client-core'
        }

        if (source === './createMiddleware') {
          return '/virtual/compiler-known/middleware-factory.ts'
        }

        return null
      },
    })

    const result = await compiler.compile({
      id: '/repo/packages/start-client-core/src/createCsrfMiddleware.ts',
      code: `
        import { createIsomorphicFn } from '@tanstack/start-fn-stubs'
        import { createMiddleware } from './createMiddleware'

        const innerCreateCsrfMiddleware = () => {
          return createMiddleware().server(() => 'server-only-middleware')
        }

        export const createCsrfMiddleware = createIsomorphicFn()
          .server(innerCreateCsrfMiddleware)
      `,
    })

    expect(result).not.toBeNull()
    expect(result!.code).not.toContain('server-only-middleware')
    // On the client, the isomorphic fn without a client implementation is a
    // no-op.
    const { createCsrfMiddleware } = await evaluateModule(result!.code, {
      '@tanstack/start-fn-stubs': {
        createIsomorphicFn: () =>
          Object.assign(() => undefined, {
            server: uncompiled,
            client: uncompiled,
          }),
      },
      './createMiddleware': middlewareFactoryStub,
    })
    expect(createCsrfMiddleware()).toBeUndefined()
  })

  test('should resolve namespace createMiddleware from start-client-core implementation file', async () => {
    // A module of Start's own client package (its middleware factory module
    // is the one `@tanstack/start-client-core` re-exports).
    const { compile } = createStartCompiler({
      env: 'client',
      files: {
        '@tanstack/start-client-core': `export { createMiddleware } from './createMiddleware'`,
        '/test/src/createMiddleware.ts': `export const createMiddleware = () => ({
  server: () => createMiddleware(),
})`,
      },
    })

    const result = await compile(
      `import * as middlewareModule from './createMiddleware'

export const middleware = middlewareModule.createMiddleware().server(() => {
  return 'server-only-middleware'
})`,
      '/test/src/internal.ts',
    )

    expect(result).not.toBeNull()
    expect(result).not.toContain('server-only-middleware')
    // `.server()` fails the test (`middlewareFactoryStub`): the module
    // evaluates only without it.
    const { middleware } = await evaluateModule(result!, {
      './createMiddleware': middlewareFactoryStub,
    })
    expect(middleware).toBeDefined()
  })
})

// The client keeps what a middleware runs in the browser (`.client()`, the
// chain itself) and drops its server part: `.server()`, `.validator()` (the
// validator only runs on the server) and the code and imports only they
// read.
// Replaces the former snapshot fixtures of this directory (N3).
describe('the client keeps the browser part of a middleware', () => {
  const stubs = {
    '@some/lib': { foo: () => 'foo' },
    zod: { z: { number: () => 'number-schema' } },
  }

  /** Compiles `code` for the client, checks it and evaluates it. */
  async function evaluateClient(code: string) {
    const client = (await compileCode('client', code)) ?? code
    expect(await getModuleErrors(client)).toEqual([])
    return { client, module: await evaluateModule(client, stubs) }
  }

  // Source: snapshot fixture create-function-middleware.ts
  test('a function middleware keeps .client() and drops .server() and its imports', async () => {
    const { client, module } =
      await evaluateClient(`import { createMiddleware } from '@tanstack/react-start'
import { foo } from '@some/lib'
export const fnMw = createMiddleware({ type: 'function' })
  .client(() => 'client')
  .server(({ next }) => {
    foo()
    return next()
  })`)
    expectNotLoaded(await moduleLoads(client, { stubs }), ['@some/lib'])
    expect(module.fnMw.options.type).toBe('function')
    expect(module.fnMw.options.client()).toBe('client')
    expect(module.fnMw.options.server).toBeUndefined()
  })

  // Source: snapshot fixtures createMiddlewareDestructured.tsx,
  // createMiddlewareDestructuredRename.tsx, createMiddlewareStarImport.tsx
  test('.server() given a function expression, an arrow, an identifier or a wrapper call leaves no server code or import in the client', async () => {
    const { client, module } =
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
    expectNotLoaded(await moduleLoads(client, { stubs }), ['zod'])
    expect(declaredNames(client)).not.toContain('abstractedFunction')
    expect(declaredNames(client)).not.toContain('zodValidator')
    const names = ['withFunction', 'withArrow', 'withVariable', 'withWrapper']
    expect(
      names.map((name) => [
        module[name].options.client(),
        module[name].options.server,
      ]),
    ).toEqual([
      ['function', undefined],
      ['arrow', undefined],
      ['variable', undefined],
      ['wrapper', undefined],
    ])
  })

  // Source: snapshot fixture createMiddlewareValidator.tsx, inline snapshot
  // "should compile validator method" (gap MW2)
  test('the validator and its module leave the client', async () => {
    const { client, module } =
      await evaluateClient(`import { createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
export const withValidator = createMiddleware({ type: 'function' })
  .validator(z.number())
  .client(() => 'client')
  .server(({ data, next }) => next({ context: { value: data + 1 } }))`)
    expectNotLoaded(await moduleLoads(client, { stubs }), ['zod'])
    expect(module.withValidator.options.validator).toBeUndefined()
    expect(module.withValidator.options.server).toBeUndefined()
    expect(module.withValidator.options.client()).toBe('client')
  })

  // Source: snapshot fixture middleware-factory.ts
  test('a middleware built inside a function drops .server() and what it reads', async () => {
    const { client, module } =
      await evaluateClient(`import { createMiddleware } from '@tanstack/react-start'
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
  .server(async ({ next }) => next())`)
    expectNotLoaded(await moduleLoads(client, { stubs }), ['./auth.server'])
    expect(module.createPublicRateLimitMiddleware('ip').options).toEqual({
      type: 'function',
    })
    expect(module.createAuthMiddleware('admin').options).toEqual({
      type: 'function',
    })
    expect(module.topLevelMiddleware.options.client()).toBe('topLevel')
    expect(module.topLevelMiddleware.options.server).toBeUndefined()
  })

  // Source: snapshot fixture createStart.tsx (gap MW5)
  test('middleware of a createStart instance keeps .client() and drops .server()', async () => {
    const { client, module } =
      await evaluateClient(`import { createStart } from '@tanstack/react-start'
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
  })`)
    expectNotLoaded(await moduleLoads(client, { stubs }), ['./audit.server'])
    expect(module.serverFnMw.options.client).toBeTypeOf('function')
    expect(module.serverFnMw.options.server).toBeUndefined()
    expect(module.requestMw.options).toEqual({ type: 'request' })
  })
})

// A valid full chain (`.middleware().validator().client().server()`) of a
// middleware a server fn uses, run through Start's runtime: the client runs
// `.client()` (its send context reaches the server) and ships no server
// code; on the server, the SSR caller and an HTTP call by id run the
// validator, `.server()` and the handler, with the context `.server()` adds.
test('a full middleware chain runs its client part on the client and its server part on the server', async () => {
  const compiled =
    await compileAll(`import { createMiddleware, createServerFn } from '@tanstack/react-start'
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
  .handler(async ({ data, context }) => [data, context.user, context.base])`)
  const stubs = {
    './db.server': { db: { user: (from: string) => `user(${from})` } },
    './check.server': { check: (data: string) => `checked(${data})` },
  }
  expectNotLoaded(await moduleLoads(compiled.client), [
    './db.server',
    './check.server',
  ])
  expect(compiled.client).not.toMatch(/db\.user|check\(/)
  const expected = ['checked(input)', 'user(client)', 'base']
  expect(
    await callFromClient(compiled, (module) => module.fn, 'input', stubs),
  ).toEqual(expected)
  const ssr = await createServerGraph(compiled, stubs).ssr()
  expect(await ssr.fn({ data: 'input' })).toEqual(expected)
})
