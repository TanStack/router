import { describe, expect, test } from 'vitest'
import { StartCompiler } from '../../src/start-compiler/compiler'
import {
  compileCode,
  createStartCompiler,
  evaluateModule,
  importSources,
} from '../regression-helpers'
import {
  declarationOf,
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
 * Start's own middleware factory module, as the client runtime runs it:
 * `.server()` throws, like the runtime stub's when it is called uncompiled.
 */
const middlewareFactoryStub = {
  createMiddleware: () => ({ server: uncompiled }),
}

describe('createMiddleware compiles correctly', () => {
  test('requires an argument for validator()', async () => {
    await expect(
      compileCode(
        'client',
        `import { createMiddleware } from '@tanstack/react-start'
const myMiddleware = createMiddleware({ type: 'function' })
  .validator()
  .server(async ({ next }) => next())`,
      ),
    ).rejects.toThrow(
      'createMiddleware().validator() must be called with a validator!',
    )
  })

  test('keeps a middleware without a server function on the client', async () => {
    const code = `import { createMiddleware } from '@tanstack/react-start'
export const logger = createMiddleware().client(async ({ next }) => next())`
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
    // The client runtime's `.server()` throws: the module evaluates only
    // without it.
    const { middleware } = await evaluateModule(result!, {
      './createMiddleware': middlewareFactoryStub,
    })
    expect(middleware).toBeDefined()
  })
})

// The client keeps what a middleware runs in the browser (`.client()`, the
// chain itself) and drops its server part: `.server()`, `.validator()` (the
// validator only runs on the server) and the code and imports only they
// read. The runtime stub's `.server()` throws, so the client modules only
// evaluate without it.
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
  .server(({ next }) => {
    foo()
    return next()
  })
  .client(() => 'client')`)
    expect(importSources(client)).toEqual([])
    expect(module.fnMw.options.type).toBe('function')
    expect(module.fnMw.options.client()).toBe('client')
  })

  // Source: snapshot fixtures createMiddlewareDestructured.tsx,
  // createMiddlewareDestructuredRename.tsx, createMiddlewareStarImport.tsx
  test('.server() given a function expression, an arrow, an identifier or a wrapper call leaves no server code or import in the client', async () => {
    const { client, module } =
      await evaluateClient(`import { createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
export const withFunction = createMiddleware({ id: 'function' }).server(
  async function () {
    return z.number()
  },
)
export const withArrow = createMiddleware({ id: 'arrow' }).server(async () =>
  z.number(),
)
export const withVariable = createMiddleware({ id: 'variable' }).server(
  abstractedFunction,
)
async function abstractedFunction() {
  return z.number()
}
function zodValidator(schema: unknown, fn: (input: unknown) => unknown) {
  return async (input: unknown) => fn([schema, input])
}
export const withWrapper = createMiddleware({ id: 'wrapper' }).server(
  zodValidator(z.number(), (input) => ({ 'you gave': input })),
)`)
    expect(importSources(client)).toEqual([])
    expect(client).not.toMatch(declarationOf('abstractedFunction'))
    expect(client).not.toMatch(declarationOf('zodValidator'))
    expect(
      ['withFunction', 'withArrow', 'withVariable', 'withWrapper'].map(
        (name) => module[name].options,
      ),
    ).toEqual([
      { id: 'function' },
      { id: 'arrow' },
      { id: 'variable' },
      { id: 'wrapper' },
    ])
  })

  // Source: snapshot fixture createMiddlewareValidator.tsx, inline snapshot
  // "should compile validator method" (gap MW2)
  test('the validator and its module leave the client', async () => {
    const { client, module } =
      await evaluateClient(`import { createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
export const withValidator = createMiddleware({ id: 'test' })
  .validator(z.number())
  .server(({ data }) => data + 1)`)
    expect(importSources(client)).toEqual([])
    expect(module.withValidator.options).toEqual({ id: 'test' })
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
export const topLevelMiddleware = createMiddleware({ id: 'topLevel' }).server(
  async ({ next }) => next(),
)`)
    expect(importSources(client)).toEqual([])
    expect(module.createPublicRateLimitMiddleware('ip').options).toEqual({
      type: 'function',
    })
    expect(module.createAuthMiddleware('admin').options).toEqual({
      type: 'function',
    })
    expect(module.topLevelMiddleware.options).toEqual({ id: 'topLevel' })
  })

  // Source: snapshot fixture createStart.tsx (gap MW5)
  test('middleware of a createStart instance keeps .client() and drops .server()', async () => {
    const { client, module } =
      await evaluateClient(`import { createStart } from '@tanstack/react-start'
import { audit } from './audit.server'
export const startInstance = createStart(() => {})
export const serverFnMw = startInstance
  .createMiddleware({ type: 'function' })
  .server(({ next }) => {
    audit('function')
    return next({ context: { admin: 'admin' } })
  })
  .client(({ next }) => next())
export const requestMw = startInstance
  .createMiddleware({ type: 'request' })
  .server(({ next }) => {
    audit('request')
    return next({ context: { requestMw: 'yes' } })
  })`)
    expect(importSources(client)).toEqual([])
    expect(module.serverFnMw.options.client).toBeTypeOf('function')
    expect(module.requestMw.options).toEqual({ type: 'request' })
  })
})
