import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { StartCompiler } from '../../src/start-compiler/compiler'
import { formatSnapshot } from '../format-snapshot'
import {
  compileCode,
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

async function getFilenames() {
  return await readdir(path.resolve(import.meta.dirname, './test-files'))
}

async function compile(opts: {
  env: 'client' | 'server'
  code: string
  id: string
}) {
  const compiler = new StartCompiler({
    ...opts,
    ...getDefaultTestOptions(opts.env),
    loadModule: async () => {
      // do nothing in test
    },
    lookupKinds: new Set(['Middleware']),
    lookupConfigurations: [
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createMiddleware',
        kind: 'Root',
      },
      {
        libName: `@tanstack/react-start`,
        rootExport: 'createStart',
        kind: 'Root',
      },
    ],
    getKnownServerFns: () => ({}),
    resolveId: async (id) => {
      return id
    },
  })
  const result = await compiler.compile({
    code: opts.code,
    id: opts.id,
  })
  return result
}

describe('createMiddleware compiles correctly', async () => {
  const filenames = await getFilenames()

  describe.each(filenames)('should handle "%s"', async (filename) => {
    const file = await readFile(
      path.resolve(import.meta.dirname, `./test-files/${filename}`),
    )
    const code = file.toString()

    // Note: Middleware compilation only happens on the client
    test(`should compile for ${filename} client`, async () => {
      const result = await compile({ env: 'client', code, id: filename })

      await expect(
        await formatSnapshot(result!.code, filename),
      ).toMatchFileSnapshot(`./snapshots/client/${filename}`)
    })
  })

  test('should compile validator method', async () => {
    const code = `
      import { createMiddleware } from '@tanstack/react-start'
      const myMiddleware = createMiddleware({ type: 'function' })
        .validator((input: string) => input)
        .server(async ({ next }) => {
          return next()
        })`

    const result = await compile({
      env: 'client',
      code,
      id: 'test.ts',
    })

    expect(await formatSnapshot(result!.code, 'test.ts'))
      .toMatchInlineSnapshot(`
      "import { createMiddleware } from '@tanstack/react-start'
      const myMiddleware = createMiddleware({ type: 'function' })
      "
    `)
  })

  test('requires an argument for validator()', async () => {
    await expect(
      compile({
        env: 'client',
        code: `
      import { createMiddleware } from '@tanstack/react-start'
      const myMiddleware = createMiddleware({ type: 'function' })
        .validator()
        .server(async ({ next }) => next())`,
        id: 'test.ts',
      }),
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

  test('should use fast path for direct imports from known library (no extra resolveId calls)', async () => {
    const code = `
      import { createMiddleware } from '@tanstack/react-start'
      const myMiddleware = createMiddleware().server(async ({ next }) => {
        return next()
      })`

    const resolveIdMock = vi.fn(async (id: string) => id)

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      loadModule: async () => {},
      lookupKinds: new Set(['Middleware']),
      lookupConfigurations: [
        {
          libName: '@tanstack/react-start',
          rootExport: 'createMiddleware',
          kind: 'Root',
        },
      ],
      getKnownServerFns: () => ({}),
      resolveId: resolveIdMock,
    })

    await compiler.compile({
      code,
      id: 'test.ts',
    })

    // Direct known-library imports use the knownRootImports fast path, so they
    // do not need resolveId.
    expect(resolveIdMock).not.toHaveBeenCalled()
  })

  test('should use slow path for factory pattern (resolveId called for import resolution)', async () => {
    // This simulates a factory pattern where createMiddleware is re-exported from a local file
    const factoryCode = `
      import { createFooMiddleware } from './factory'
      const myMiddleware = createFooMiddleware().server(async ({ next }) => {
        return next()
      })`

    const resolveIdMock = vi.fn(async (id: string) => id)

    const compiler = new StartCompiler({
      env: 'client',
      ...getDefaultTestOptions('client'),
      loadModule: async (id) => {
        // Simulate the factory module being loaded
        if (id === './factory') {
          compiler.ingestModule({
            code: `
              import { createMiddleware } from '@tanstack/react-start'
              export const createFooMiddleware = createMiddleware
            `,
            id: './factory',
          })
        }
      },
      lookupKinds: new Set(['Middleware']),
      lookupConfigurations: [
        {
          libName: '@tanstack/react-start',
          rootExport: 'createMiddleware',
          kind: 'Root',
        },
      ],
      getKnownServerFns: () => ({}),
      resolveId: resolveIdMock,
    })

    await compiler.compile({
      code: factoryCode,
      id: 'test.ts',
    })

    // resolveId should only be called for './factory'. Direct known-library
    // imports use the knownRootImports fast path.
    //
    // Note: The factory module's import from '@tanstack/react-start' ALSO uses
    // the fast path (knownRootImports), so no additional resolveId call is needed there.
    expect(resolveIdMock).toHaveBeenCalledTimes(1)
    expect(resolveIdMock).toHaveBeenNthCalledWith(1, './factory', 'test.ts')
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
    expect(result!.code).not.toContain('createIsomorphicFn')
  })

  test('should resolve namespace createMiddleware from start-client-core implementation file', async () => {
    const virtualModules: Record<string, string> = {
      '@tanstack/start-client-core': `
        export { createMiddleware } from './createMiddleware'
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
      lookupKinds: new Set(['Middleware']),
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
      id: '/repo/packages/start-client-core/src/internal.ts',
      code: `
        import * as middlewareModule from './createMiddleware'

        export const middleware = middlewareModule.createMiddleware().server(() => {
          return 'server-only-middleware'
        })
      `,
    })

    expect(result).not.toBeNull()
    expect(result!.code).not.toContain('server-only-middleware')
  })
})

// The client keeps what a middleware runs in the browser (`.client()`, the
// chain itself) and drops its server part: `.server()`, `.validator()` (the
// validator only runs on the server) and the code and imports only they
// read. The runtime stub's `.server()` throws, so the client modules only
// evaluate without it.
// Replaces the snapshot fixtures of this directory (N3).
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
